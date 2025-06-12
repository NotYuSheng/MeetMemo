import whisper
from pyannote.audio import Pipeline
from pyannote.audio import Audio
from pyannote_whisper.utils import diarize_text
from dotenv import load_dotenv
import os
from fastapi import FastAPI
import datetime, logging
import torch

app = FastAPI()    

logging.basicConfig(level=logging.INFO)

dotenv_path = os.path.join('config', '.env')
load_dotenv(dotenv_path)

@app.post("/jobs")
def transcribe(file_name: str, model_name: str = "turbo"):
    try:
        file_path = f"data/{file_name}.wav"
        model = whisper.load_model(model_name)
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        model = model.to(device)

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

        return {"transcript": full_transcript}
    
    except Exception as e:
        logging.error(f"Error processing file {file_name}: {e}", exc_info=True)
        return {"error": str(e)}