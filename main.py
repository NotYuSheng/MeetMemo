import whisper
from pyannote.audio import Pipeline
from pyannote.audio import Audio
from pyannote_whisper.utils import diarize_text
from dotenv import load_dotenv
import os

# Build full path to the .env file inside the config subfolder
dotenv_path = os.path.join('config', '.env')

# Load the .env file
load_dotenv(dotenv_path)

pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization",
                                    use_auth_token=os.getenv("USE_AUTH_TOKEN"))

file_name = "testing_ccs"
file_path = f"data/{file_name}.wav"
model = whisper.load_model("large-v3")
model = model.to("cuda:0")

asr = model.transcribe(file_path, language="en")
diarization = pipeline(file_path)

# merge into one list of {start,end,speaker,text}
diarized = diarize_text(asr, diarization)

for segment, speaker, utterance in diarized:
    start = segment.start
    end   = segment.end
    print(f"{start:.2f}s–{end:.2f}s  speaker_{speaker}: {utterance}")
