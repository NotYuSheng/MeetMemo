import whisper
from pyannote.audio import Pipeline
from pyannote.audio import Audio
from pyannote_whisper.utils import diarize_text
from dotenv import load_dotenv
import os
from fastapi import FastAPI
from datetime import datetime, timezone, timedelta, 
import logging
from numba import cuda

app = FastAPI()    

logging.basicConfig(level=logging.INFO,
                    filename='logs/app.log',
                    filemode='a',
                    )

dotenv_path = os.path.join('config', '.env')
load_dotenv(dotenv_path)

def get_timestamp():
    tz_gmt8 = timezone(timedelta(hours=8))
    return datetime.now(tz_gmt8).strftime("%Y-%m-%d %H:%M:%S")


@app.post("/jobs")
def transcribe(file_name: str, model_name: str = "turbo"):
    try:
        file_path = f"data/{file_name}.wav"
        model = whisper.load_model(model_name)
        device = "cuda:0" if cuda.is_available() else "cpu"
        model = model.to(device)

        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Processing file {file_name}.wav with model {model_name}")
        pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization", 
                                            use_auth_token=os.getenv("USE_AUTH_TOKEN"))

        asr = model.transcribe(file_path, language="en")
        diarization = pipeline(file_path)

        diarized = diarize_text(asr, diarization)

        full_transcript = ""

        for segment, speaker, utterance in diarized:
            start = segment.start
            end   = segment.end
            full_transcript += f"{start:.2f}s–{end:.2f}s  speaker_{speaker}: {utterance}\n"

        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Successfully processed file {file_name}.wav")
        return {"transcript": full_transcript}
    
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error processing file {file_name}: {e}", exc_info=True)
        return {"error": str(e)}

@app.get("/logs")
def get_logs():
    with open("logs/app.log", "r") as f:
        logs = f.readlines()
    return {"logs": logs}

@app.get("/health")
def health_check():
    error_msg = ''
    try:
        logs = get_logs()
        for i in logs['logs']:
            if "error" in i.lower():
                error_msg += i
        if error_msg:
            return {"status": "error", "message": error_msg}
        else:
            return {"status": "ok"}
    except Exception as e:
        logging.error(f"Health check failed: {e}")
        return {"status": "error", "error": str(e)}
    
