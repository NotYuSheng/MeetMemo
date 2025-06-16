from datetime import datetime, timezone, timedelta
import logging
import os
import whisper
from pyannote.audio import Pipeline
from pyannote_whisper.utils import diarize_text
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import json

# Start up the app
app = FastAPI()    

origins = [
    "http://localhost:3000",  # React dev server
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,            # or ["*"] to allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store logs inside the volume
logging.basicConfig(level=logging.INFO,
                    filename='logs/app.log',
                    filemode='a',
                    )

# Environment variables for HuggingFace tokens
load_dotenv('.env')
UPLOAD_DIR = "audiofiles"
DEVICE = "cpu"

##################################### Functions #####################################
def get_timestamp() -> str:
    '''
    Gets the current date & time in the `YYYY-MM-DD H:MM:SS` format.
    '''
    tz_gmt8 = timezone(timedelta(hours=8))
    return datetime.now(tz_gmt8).strftime("%Y-%m-%d %H:%M:%S")


def format_result(diarized: list) -> list[dict]:
    """
    Formats the diarized results into an array of speaker-utterance pairs.
    """
    full_transcript = []

    for _, speaker, utterance in diarized:
        segment = {speaker: utterance}
        full_transcript.append(segment)

    return full_transcript


def upload_audio(file: UploadFile = File(...)) -> str:
    """
    Uploads the audio file to the desired directory,
    & returns the resultant file name in string form.
    """
    timestamp = get_timestamp()
    filename = f"{timestamp}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    # Save the file to disk
    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    return filename


##################################### Main routes for back-end #####################################
@app.post("/jobs")
def transcribe(file: UploadFile = File(...), model_name: str = "turbo") -> list[dict]:
    '''
    Gets the audio file from the front-end form data, & transcribes it using the Whisper turbo model.

    Returns an array of speaker-utterance pairs to be displayed on the front-end.
    '''
    try:
        file_name = upload_audio(file=file)    # Uploads audio file to target folder, & returns the file name
        logging.info(f"Received transcription request for file: {file_name}.wav with model: {model_name}")
        file_path = os.path.join("audiofiles", file_name)
        model = whisper.load_model(model_name)
        device = DEVICE
        model = model.to(device)

        # Log time & activity
        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Processing file {file_name}.wav with model {model_name}")

        # Transcription & diarization of text
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization", 
            use_auth_token=os.getenv("USE_AUTH_TOKEN")
        )
        asr = model.transcribe(file_path, language="en")
        diarization = pipeline(file_path)

        # Format the transcribed + diarized results as array of speaker-utterance pairs
        diarized = diarize_text(asr, diarization)
        full_transcript = format_result(diarized=diarized)

        # Save results & log activity process
        timestamp = get_timestamp()
        with open(os.path.join("transcripts", f"{file_name}.json"), "w", encoding="utf-8") as f:
            json.dump(full_transcript, f, indent=4)
            
        logging.info(f"{timestamp}: Successfully processed file {file_name}.wav with model {model_name}")
        return full_transcript
    
    # Catch any errors when trying to transcribe & diarize recording
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error processing file {file_name}: {e}", exc_info=True) # type: ignore
        return [{"error": str(e)}]
    

@app.get("/jobstatus/{file_name}")
def get_job_status(file_name: str):
    logs = get_logs()
    status = []
    status.append(f"Job status for {file_name}:\n")
    for i in logs['logs']:
        if file_name in i:
            status.append(i)
    return {"file_name": file_name, "status": status}


@app.get("/files/{file_name}")
def get_file_transcript(file_name: str):
    file_path = f"transcripts/{file_name}.txt"
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            full_transcript = f.read()
        return {"status": "exists", "full_transcript": full_transcript}
    else:
        return {"status": "not found"}


##################################### Functionality check #####################################
@app.get("/logs")
def get_logs() -> dict:
    with open("logs/app.log", "r") as f:
        logs = f.readlines()
    return {"logs": logs}


@app.get("/health")
def health_check():
    error_msg = ''
    try:
        logs = get_logs()
        error_msg = [i for i in logs['logs'] if "error" in i.lower()]
        if error_msg:
            return {"status": "error", "message": error_msg}
        else:
            return {"status": "ok"}
    except Exception as e:
        logging.error(f"Health check failed: {e}")
        return {"status": "error", "error": str(e)}