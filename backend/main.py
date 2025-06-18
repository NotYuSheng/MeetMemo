from datetime import datetime, timezone, timedelta
import logging
import os
import whisper
import csv
from threading import Lock
import re
from collections import defaultdict
from pyannote.audio import Pipeline
from pyannote_whisper.utils import diarize_text
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile
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

# Variables 
load_dotenv('.env')
UPLOAD_DIR = "audiofiles"
csv_lock = Lock()
csv_file = "audiofiles/audiofiles.csv"
DEVICE = "cuda:0" if whisper.is_cuda_available() else "cpu"


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


def upload_audio(uuid: str, file: UploadFile) -> str:
    """
    Uploads the audio file to the desired directory,
    & returns the resultant file name in string form.
    """
    
    filename = f"{uuid}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    # Save the file to disk
    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    return filename

def parse_transcript_with_times(text: str) -> dict:
    """
    Parses a transcript and returns a dict mapping each speaker to a list of {start, end, text} entries.
    """

    pattern = re.compile(
        r'(?P<start>\d+\.\d+)\s+'           # start time
        r'(?P<end>\d+\.\d+)\s+'             # end time
        r'(?P<speaker>SPEAKER_\d+)\s+'      # speaker label
        r'(?P<utterance>.*?)'               # what they said
        r'(?=(?:\d+\.\d+\s+\d+\.\d+\s+SPEAKER_\d+)|\Z)',  # lookahead for next block or end
        re.DOTALL
    )

    speakers = defaultdict(list)
    for m in pattern.finditer(text):
        start = float(m.group('start'))
        end   = float(m.group('end'))
        spkr  = m.group('speaker')
        utt   = m.group('utterance').strip()

        speakers[spkr].append({
            'start': start,
            'end': end,
            'text': utt
        })

    return dict(speakers)

##################################### Main routes for back-end #####################################
@app.get("/jobs")
def get_jobs() -> dict:
    """
    Returns a list of all audio files in the UPLOAD_DIR.
    """
    if not os.path.exists(csv_file):
        with open(csv_file, "w", newline='') as f:
            writer = csv.writer(f)
            writer.writerow(["uuid", "file_name"])
    else:
        with open(csv_file, "r") as f:
            reader = csv.reader(f)
            list_of_files = {i[0]: i[1] for i in reader}

    return {"csv_list": list_of_files}

@app.post("/jobs")
def transcribe(file: UploadFile, model_name: str = "turbo") -> dict:
    '''
    Gets the audio file from the front-end form data, & transcribes it using the Whisper turbo model.

    Returns an array of speaker-utterance pairs to be displayed on the front-end.
    '''
    try:
        with open(csv_file, "r") as f:
            reader = csv.reader(f)
        used = set()
        for row in reader:
            try:
                used.add(int(row[0]))
            except ValueError:
                continue
        for i in range(10000):
            if i not in used:
                uuid = f"{i:04d}"
                break

        file_name = upload_audio(uuid, file)
        logging.info(f"Received transcription request for file: {file_name}.wav and UUID: {uuid} with model: {model_name}")
        model = whisper.load_model(model_name)
        device = DEVICE
        model = model.to(device)
        file_path = os.path.join(UPLOAD_DIR, file_name)

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
        return {"uuid": uuid, "file_name": file_name, "transcript": full_transcript}
    
    # Catch any errors when trying to transcribe & diarize recording
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error processing file {file_name}: {e}", exc_info=True)
        return {"error": str(e)}

@app.delete("/jobs/{uuid}")
def delete_job(uuid: str) -> dict:
    """
    Deletes the job with the given UUID, including the audio file and its transcript.
    """
    # Delete the audio file
    file_name = None
    with csv_lock:
        with open(csv_file, "r") as f:
            reader = csv.reader(f)
            rows = list(reader)
        for row in rows:
            if row[0] == uuid:
                file_name = row[1]
                rows.remove(row)
                break
        else:
            return {"error": "UUID not found"}

        with open(csv_file, "w", newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)

    os.remove(os.path.join(UPLOAD_DIR, file_name))
    os.remove(os.path.join("transcripts", f"{file_name}.json"))
    timestamp = get_timestamp()

    logging.info(f"{timestamp}: Deleted job with UUID: {uuid}, file name: {file_name}")
    return {"status": "success", "message": f"Job with UUID {uuid} and file {file_name} deleted successfully."}

@app.get("/jobs/{uuid}/filename")
def get_file_name(uuid: str) -> dict:
    """
    Returns the file name associated with the given UUID.
    """
    with open(csv_file, "r") as f:
        reader = csv.reader(f)
        for row in reader:
            if row[0] == uuid:
                return {"uuid": uuid, "file_name": row[1]}
    return {"error": "UUID not found"}

@app.get("/jobs/{uuid}/status")
def get_job_status(uuid: str):
    """
    Gets ALL the statuses of the job with the given UUID.
    """
    logs = get_logs()
    status = []
    get_file_name_response = get_file_name(uuid)
    file_name = get_file_name_response["file_name"]
    status.append(f"Job status for UUID: {uuid}:\n, File name: {file_name}\n")
    for i in logs['logs']:
        if uuid in i:
            status.append(i)
    return {"uuid": uuid, "file_name": file_name, "status": status}


@app.get("/jobs/{uuid}/transcript")
def get_file_transcript(uuid: str):
    """
    Returns the raw full transcript for the given UUID.
    """
    file_name = get_file_name(uuid)["file_name"]
    file_path = f"transcripts/{file_name}.txt"
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            full_transcript = f.read()
        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Retrieved raw transcript for UUID: {uuid}, file name: {file_name}")
        return {"status": "exists", "full_transcript": full_transcript}
    else:
        return {"status": "not found"}

@app.get("/jobs/{uuid}/result")
def get_job_result(uuid: str) -> dict:
    """
    Returns the  transcript with timestamps for the given UUID, separated by speakers.
    """
    raw_transcript = get_file_transcript(uuid)["full_transcript"]
    result = parse_transcript_with_times(raw_transcript)
    full_result = ""
    for speaker, entries in result.items():
        full_result += f"{speaker}:\n"
        for e in entries:
            full_result += f"  {e['start']:.2f}–{e['end']:.2f} → {e['text']}\n"
    timestamp = get_timestamp()
    file_name = get_file_name(uuid)["file_name"]
    logging.info(f"{timestamp}: Retrieved diarised transcript for UUID: {uuid}, file name: {file_name}")
    return {"status": "exists", "result": full_result}


##################################### Functionality check #####################################
@app.get("/logs")
def get_logs() -> dict:
    """
    Get logs.
    """
    with open("logs/app.log", "r") as f:
        logs = f.readlines()
    return {"logs": logs}


@app.get("/health")
def health_check():
    """
    Health check to verify if the application is running correctly."""
    error_msg = ''
    try:
        logs = get_logs()
        error_msg = [i for i in logs['logs'] if "error" in i.lower()]
        timestamp = get_timestamp()
        if error_msg:
            logging.error(f"{timestamp}: Health check found errors: {error_msg}")
            return {"status": "error", "message": error_msg}
        else:
            logging.info(f"{timestamp}: Health check passed successfully.")
            return {"status": "ok"}
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Health check failed: {e}")
        return {"status": "error", "error": str(e)}