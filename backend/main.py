import whisper
from pyannote.audio import Pipeline
from pyannote.audio import Audio
from pyannote_whisper.utils import diarize_text
from dotenv import load_dotenv
import os
from fastapi import FastAPI, HTTPException
import logging
import torch

from pydantic import BaseModel

class TranscriptionRequest(BaseModel):
    file_path: str
    model_name: str = "turbo"

app = FastAPI()    

logging.basicConfig(level=logging.INFO)

dotenv_path = os.path.join('config', '.env')
load_dotenv(dotenv_path)

@app.post("/jobs")
def transcribe(request: TranscriptionRequest):
    try:
        file_path = request.file_path
        model_name = request.model_name

        model = whisper.load_model(model_name)
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        model = model.to(device)

        pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization", 
                                            use_auth_token=os.getenv("USE_AUTH_TOKEN"))

        asr = model.transcribe(file_path, language="en")
        diarization = pipeline(file_path)
        diarized = diarize_text(asr, diarization)

        full_transcript = ""

        results = []

        for segment, speaker, utterance in diarized:
            start = segment.start
            end = segment.end
            results.append({
                "speaker": f"speaker_{speaker}",
                "text": f"{start:.2f}s–{end:.2f}s {utterance}"
            })

        return results
    
    except Exception as e:
        logging.error(f"Error processing file {file_path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))