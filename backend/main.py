"""FastAPI application for audio transcription and speaker diarization."""
import csv
import json
import logging
import os
import re
import tempfile
import uuid as uuid_lib
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from threading import Lock

import requests
import whisper
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pyannote.audio import Pipeline
from pydantic import BaseModel
from typing import Optional, Dict, Any
from pydub import AudioSegment

from pyannote_whisper.utils import diarize_text

# Start up the app
app = FastAPI(
    title="MeetMemo API",
    description="Audio transcription and speaker diarization service for meeting recordings",
    version="1.0.0"
)    

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not os.path.exists("logs/app.log"):
    os.makedirs("logs", exist_ok=True)
    with open("logs/app.log", "w") as f:
        f.write("")  # Create an empty log file if it doesn't exist

# Store logs inside the volume
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler()  # Also log to console
    ]
)

# Create logger instance
logger = logging.getLogger(__name__)

# Variables 
load_dotenv('.env')
UPLOAD_DIR = "audiofiles"
CSV_LOCK = Lock()
CSV_FILE = "audiofiles/audiofiles.csv"
FIELDNAMES = ["uuid", "file_name", "status_code"]
DEVICE = "cuda:0" 

# Ensure required directories exist
os.makedirs("transcripts", exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

###################################### Classes ######################################
class SpeakerNameMapping(BaseModel):
    '''Pydantic model for mapping old speaker names to new ones.'''
    mapping: dict[str, str]

class SummarizeRequest(BaseModel):
    '''Pydantic model for summarization requests with optional custom prompts.'''
    custom_prompt: str = None
    system_prompt: str = None

class ClientLogEntry(BaseModel):
    '''Pydantic model for client-side log entries.'''
    level: str
    message: str
    timestamp: str
    url: Optional[str] = None
    userAgent: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None

##################################### Functions #####################################
def get_timestamp() -> str:
    '''
    Gets the current date & time in the `YYYY-MM-DD H:MM:SS` format.
    '''
    tz_gmt8 = timezone(timedelta(hours=8))
    return datetime.now(tz_gmt8).strftime("%Y-%m-%d %H:%M:%S")

def format_result(diarized: list) -> list[dict]:
    """
    Formats the diarized results into a list of dictionaries,
    each with speaker, text, start, and end time.
    
    diarized: list of tuples (segment, speaker, utterance)
    """
    full_transcript = []
    for segment, speaker, utterance in diarized:
        # Convert SPEAKER_XX format to Speaker X format
        formatted_speaker = speaker
        if speaker.startswith("SPEAKER_"):
            speaker_num = speaker.replace("SPEAKER_", "")
            try:
                # Convert zero-padded number to regular number (e.g., "00" -> "1")
                speaker_number = int(speaker_num) + 1
                formatted_speaker = f"Speaker {speaker_number}"
            except ValueError:
                # If parsing fails, keep original format
                formatted_speaker = speaker
        
        full_transcript.append({
            "speaker": formatted_speaker,
            "text": utterance.strip(),
            "start": f"{segment.start:.2f}",
            "end": f"{segment.end:.2f}",
        })
    return full_transcript

def upload_audio(uuid: str, file: UploadFile) -> str:
    """
    Uploads the audio file to the desired directory,
    & returns the resultant file name in string form.
    """
    
    filename = file.filename
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    # Handle duplicate filenames by adding (1), (2), etc.
    if os.path.exists(file_path):
        name, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(file_path):
            filename = f"{name} ({counter}){ext}"
            file_path = os.path.join(UPLOAD_DIR, filename)
            counter += 1

    # Save the file to disk
    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    return filename

def add_job(uuid: str, file_name: str, status_code: str) -> None:
    """
    Inserts a new job in the CSV.  
    Reads all rows, adds the new one, sorts by numeric uuid,  
    then rewrites the entire file.
    """
    with CSV_LOCK:
        rows = []
        if os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "r", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    rows.append(row)

        rows.append({
            "uuid":        uuid,
            "file_name":   file_name,
            "status_code": status_code
        })

        rows.sort(key=lambda r: r["uuid"])

        with open(CSV_FILE, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)

def update_status(uuid: str, new_status: str) -> None:
    """
    Read the existing CSV, update the status_code for the matching uuid,
    and write out to a temporary file which then replaces the original.
    """
    with CSV_LOCK:
        dir_name = os.path.dirname(CSV_FILE) or "."
        fd, temp_path = tempfile.mkstemp(dir=dir_name, text=True)
        try:
            with os.fdopen(fd, "w", newline="") as tmpf, open(CSV_FILE, "r", newline="") as csvf:
                reader = csv.DictReader(csvf)
                writer = csv.DictWriter(tmpf, fieldnames=FIELDNAMES)
                writer.writeheader()

                for row in reader:
                    if row["uuid"] == uuid:
                        row["status_code"] = new_status
                    writer.writerow(row)
            os.replace(temp_path, CSV_FILE)
        except Exception:
            os.remove(temp_path)
            raise        

def parse_transcript_with_times(text: str) -> dict:
    # allow lowercase, optional colon, flexible whitespace
    pattern = re.compile(
        r'(?P<start>\d+\.\d+)\s+'                   # start time
        r'(?P<end>\d+\.\d+)\s+'                     # end time
        r'(?P<speaker>(?:speaker\s*\d+|speaker_\d+)):?\s+'  # speaker label (case-insensitive, optional colon)
        r'(?P<utterance>.*?)'                       # the spoken text
        r'(?=(?:\d+\.\d+\s+\d+\.\d+\s+(?:speaker\s*\d+|speaker_\d+))|\Z)',  
        re.DOTALL | re.IGNORECASE                   # match across lines, ignore case
    )

    speakers = defaultdict(list)
    for m in pattern.finditer(text):
        speakers[m.group('speaker').lower()].append({
            'start': float(m.group('start')),
            'end':   float(m.group('end')),
            'text':  m.group('utterance').strip()
        })

    return dict(speakers)

def summarise_transcript(transcript: str, filename: str = None, custom_prompt: str = None, system_prompt: str = None) -> str:
    """
    Summarises the transcript using a defined LLM.
    
    Args:
        transcript: The transcript text to summarize
        filename: The source filename to include in the summary
        custom_prompt: Optional custom user prompt. If None, uses default prompt.
        system_prompt: Optional custom system prompt. If None, uses default system prompt.
    """

    base_url = str(os.getenv("LLM_API_URL"))
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    model_name = str(os.getenv("LLM_MODEL_NAME"))

    # Default system prompt
    default_system_prompt = "You are a meeting summarizer. You MUST follow the exact format provided in the user prompt. Always start with a # title, include source file information, and use the specific markdown structure requested. Do not deviate from the format."
    
    # Default user prompt
    default_user_prompt = (
        "REQUIRED FORMAT - Generate a meeting summary using EXACTLY this structure:\n\n"
        "# [Generate a descriptive title for this meeting]\n\n"
        "**Source File:** [filename]\n\n"
        "## Participants\n"
        "- [list participants]\n\n"
        "## Key Points\n"
        "- [summarize main discussion points]\n\n"
        "## Action Items\n"
        "- [list specific actions, or 'None identified']\n\n"
        "## Next Steps\n"
        "- [list next steps, or 'None identified']\n\n"
        "Be concise and professional. Use the exact markdown structure shown above."
    )

    # Use custom prompts if provided, otherwise use defaults
    final_system_prompt = system_prompt if system_prompt else default_system_prompt
    
    # Always append filename and transcript to user prompt, whether custom or default
    filename_text = f"Source file: {filename}\n\n" if filename else ""
    if custom_prompt:
        final_user_prompt = custom_prompt + "\n\n" + filename_text + transcript
    else:
        final_user_prompt = default_user_prompt + "\n\n" + filename_text + transcript 

    payload = {
        "model": model_name,
        "temperature": 0.3,
        "max_tokens": 5000,
        "messages": [
            {"role": "system", "content": final_system_prompt},
            {"role": "user", "content": final_user_prompt},
        ],
    }

    try:
        resp = requests.post(url, headers={"Content-Type": "application/json"}, json=payload)
        resp.raise_for_status()
        data = resp.json()
        summary = data["choices"][0]["message"]["content"].strip()
        return summary
    
    except requests.RequestException as e:
        return f"Error: {e}"

def convert_to_wav(input_path: str, output_path: str, sample_rate: int = 16000):
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_frame_rate(sample_rate).set_channels(1)  # 16kHz mono
    audio.export(output_path, format="wav")

##################################### Main routes for back-end #####################################
@app.get("/jobs")
def get_jobs() -> dict:
    """
    Returns a dict of all jobs in the CSV, keyed by uuid,
    each mapping to its file_name and status_code.
    """
    try:
        if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()

        jobs = {}
        with open(CSV_FILE, "r", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row.get("uuid") or not row.get("file_name"):
                    continue
                jobs[row["uuid"]] = {
                    "file_name": row["file_name"],
                    "status_code": row.get("status_code", "")
                }

        if not jobs:
            return {"csv_list": {}}
        return {"csv_list": jobs}

    except Exception as e:
        logger.error(f"Error retrieving jobs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/jobs")
def transcribe(file: UploadFile, model_name: str = "turbo") -> dict:
    '''
    Gets the audio file from the front-end form data, & transcribes it using the Whisper turbo model.

    Returns an array of speaker-utterance pairs to be displayed on the front-end.
    '''
    # Generate a unique UUID for this job
    uuid = str(uuid_lib.uuid4())

    if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()
    
    try:
        file_name = upload_audio(uuid, file)
        file_path = os.path.join(UPLOAD_DIR, file_name)

        # Check and convert to WAV if needed
        if not file_name.lower().endswith(".wav"):
            wav_file_name = f"{os.path.splitext(file_name)[0]}.wav"
            wav_file_path = os.path.join(UPLOAD_DIR, wav_file_name)
            convert_to_wav(file_path, wav_file_path)
            file_path = wav_file_path  # update path for Whisper/Pyannote
        else:
            wav_file_name = file_name  # keep the original if already WAV

        timestamp = get_timestamp()
        logger.info(f"Created transcription request for file: {wav_file_name} and UUID: {uuid} with model: {model_name}")
        add_job(uuid, os.path.splitext(file_name)[0] + '.wav',"202")
        
        try:
            model = whisper.load_model(model_name)
            device = DEVICE
            model = model.to(device)
        except Exception as e:
            logger.error(f"Whisper model loading error for UUID {uuid}, model: {model_name}: {e}", exc_info=True)
            update_status(uuid, "500")
            raise HTTPException(status_code=500, detail=f"Error loading Whisper model: {str(e)}")
        file_path = os.path.join(UPLOAD_DIR, wav_file_name)
        timestamp = get_timestamp()
        logger.info(f"Processing file {wav_file_name} with model {model_name}")

        # Transcription & diarization of text
        hf_token = os.getenv("HF_TOKEN")
        if not hf_token:
            error_msg = "HF_TOKEN environment variable is not set. Please check your .env file."
            logger.error(f"HF_TOKEN missing for UUID {uuid}, file: {file_name}")
            update_status(uuid, "500")
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Try to load PyAnnote pipeline for speaker diarization
        pipeline = None
        use_diarization = True
        
        try:
            # Set the Hugging Face token as an environment variable for PyAnnote
            os.environ["HF_TOKEN"] = hf_token
            
            # Try to login to Hugging Face Hub first
            try:
                from huggingface_hub import login
                login(token=hf_token)
            except ImportError:
                logger.warning("huggingface_hub not available for login, continuing with token-based auth")
            except Exception as e:
                logger.warning(f"Failed to login to Hugging Face Hub: {e}")
            
            # Try different authentication methods for PyAnnote
            try:
                # Method 1: Use token parameter (newer versions)
                pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization", 
                    token=hf_token
                )
                logger.info(f"PyAnnote pipeline loaded successfully for UUID {uuid}")
            except (TypeError, AttributeError):
                try:
                    # Method 2: Use use_auth_token parameter (older versions)
                    pipeline = Pipeline.from_pretrained(
                        "pyannote/speaker-diarization", 
                        use_auth_token=hf_token
                    )
                    logger.info(f"PyAnnote pipeline loaded successfully (legacy auth) for UUID {uuid}")
                except (TypeError, AttributeError):
                    # Method 3: Environment variable based (fallback)
                    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization")
                    logger.info(f"PyAnnote pipeline loaded successfully (env auth) for UUID {uuid}")
                    
        except Exception as e:
            logger.warning(f"PyAnnote pipeline failed to load for UUID {uuid}: {e}. Falling back to transcription-only mode.")
            use_diarization = False
            pipeline = None

        # Perform transcription
        asr = model.transcribe(file_path, language="en")
        
        if use_diarization and pipeline is not None:
            try:
                # Perform speaker diarization
                diarization = pipeline(file_path)
                diarized = diarize_text(asr, diarization)
                full_transcript = format_result(diarized=diarized)
                logger.info(f"Successfully processed with speaker diarization for UUID {uuid}")
            except Exception as e:
                logger.warning(f"Speaker diarization failed for UUID {uuid}: {e}. Using transcription-only.")
                use_diarization = False
        
        if not use_diarization:
            # Fallback: Create transcript without speaker diarization
            full_transcript = []
            for i, segment in enumerate(asr['segments']):
                full_transcript.append({
                    "speaker": f"Speaker 1",  # Default speaker when diarization fails
                    "text": segment['text'].strip(),
                    "start": f"{segment['start']:.2f}",
                    "end": f"{segment['end']:.2f}",
                })
            logger.info(f"Successfully processed without speaker diarization for UUID {uuid}")

        # Save results & log activity process
        timestamp = get_timestamp()
        os.makedirs("transcripts", exist_ok=True)
        json_path = os.path.join("transcripts", f"{file_name}.wav.json")
        if not os.path.exists(json_path):
            with open(os.path.join("transcripts", f"{file_name.split('.')[0]}.wav.json"), "w", encoding="utf-8") as f:
                json.dump(full_transcript, f, indent=4)

        timestamp = get_timestamp()
        logger.info(f"Successfully processed file {file_name} with model {model_name}")
        update_status(uuid, "200") 
        return {"uuid": uuid, "file_name": file_name, "transcript": full_transcript}
    
    # Catch any errors when trying to transcribe & diarize recording
    except HTTPException:
        # Re-raise HTTPExceptions to maintain proper status codes
        raise
    except Exception as e:
        file_name = file.filename
        logger.error(f"Unexpected error processing file {file_name} for UUID {uuid}: {e}", exc_info=True)
        update_status(uuid, "500")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.delete("/jobs/{uuid}")
def delete_job(uuid: str) -> dict:
    """
    Deletes the job with the given UUID, including the audio file and its transcript.
    """
    file_name = None  

    if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()

    with CSV_LOCK:
        with open(CSV_FILE, "r") as f:
            reader = csv.reader(f)
            rows = list(reader)
        for row in rows:
            if row[0] == uuid:
                file_name = row[1]
                rows.remove(row)
                break
        else:
            raise HTTPException(status_code=404, detail="UUID not found")

        with open(CSV_FILE, "w", newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
    try:
        os.remove(os.path.join(UPLOAD_DIR, file_name))
    except FileNotFoundError:
        timestamp = get_timestamp()
        logger.warning(f"File {file_name} not found in {UPLOAD_DIR}. It may have already been deleted.")
    try:  
        os.remove(os.path.join("transcripts", f"{file_name}.json"))
    except FileNotFoundError:
        timestamp = get_timestamp()
        logger.warning(f"Transcript {file_name}.json not found in transcripts directory. It may have already been deleted.")

    timestamp = get_timestamp()
    logger.info(f"Deleted job with UUID: {uuid}, file name: {file_name}")
    return {"uuid": uuid, "status": "success", "message": f"Job with UUID {uuid} and file {file_name} deleted successfully.", "status_code": "204"}

@app.get("/jobs/{uuid}/filename")
def get_file_name(uuid: str) -> dict:
    """
    Returns the file name associated with the given UUID.
    """

    if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()

    with open(CSV_FILE, "r") as f:
        reader = csv.reader(f)
        for row in reader:
            if row[0] == uuid:
                return {"uuid": uuid, "file_name": row[1]}
            
    raise HTTPException(status_code=404, detail=f"UUID: {uuid} not found")

@app.get("/jobs/{uuid}/status")
def get_job_status(uuid: str):
    """
    Returns the file_name and status for the given uuid,
    reading from jobs.csv (uuid, file_name, status_code).
    """
    file_name = "unknown"
    status_code = "404"

    if not os.path.isfile(CSV_FILE):
        with open(CSV_FILE, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writeheader()

    with open(CSV_FILE, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("uuid") == uuid:
                file_name = row.get("file_name", "unknown")
                status_code = row.get("status_code", "")
                break

    status_map = {
        "200": "completed",
        "202": "processing",
        "204": "deleted",
        "404": "does not exist",
        "500": "error"
    }

    if status_code in status_map:
        status = status_map[status_code]
    else:
        log_msg = ""
        logs = get_logs().get("logs", [])
        for entry in logs:
            if uuid in entry:
                log_msg += entry + "\n"
        status = log_msg or "unknown"

    return {"uuid": uuid, "file_name": file_name, "status_code": status_code, "status": status}

@app.get("/jobs/{uuid}/transcript")
def get_file_transcript(uuid: str) -> dict:
    """
    Returns the raw full transcript for the given UUID.
    """
    try:
        file_name = get_file_name(uuid)["file_name"]
        file_path = f"transcripts/{file_name}.json"
        timestamp = get_timestamp()
        logger.info(f"Retrieving transcript for UUID: {uuid}, file name: {file_name}")
        
        if os.path.exists(file_path):
            full_transcript = []
            with open(file_path, "r", encoding="utf-8") as f:
                full_transcript = f.read()
            logger.info(f"Successfully retrieved raw transcript for UUID: {uuid}, file name: {file_name}")
            return {"uuid": uuid, "status": "exists", "full_transcript": full_transcript,"status_code":"200"}
        else:
            logger.error(f"Transcript file not found for UUID: {uuid}, file name: {file_name}")
            raise HTTPException(status_code=404, detail="Transcript not found")
    except HTTPException:
        raise
    except Exception as e: 
        logger.error(f"Error retrieving transcript for UUID: {uuid}, file name: {file_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.delete("/jobs/{uuid}/summary")
def delete_summary(uuid: str) -> dict:
    """
    Deletes the cached summary for the given UUID.
    """
    try:
        file_name = get_file_name(uuid)["file_name"]
        summary_dir = Path("summary")
        summary_path = summary_dir / f"{uuid}.txt"
        
        if summary_path.exists():
            summary_path.unlink()
            timestamp = get_timestamp()
            logger.info(f"Deleted cached summary for UUID: {uuid}, file name: {file_name}")
            return {
                "uuid": uuid,
                "fileName": file_name,
                "status": "success",
                "message": "Summary deleted successfully",
                "status_code": "200"
            }
        else:
            timestamp = get_timestamp()
            logger.warning(f"No cached summary found to delete for UUID: {uuid}, file name: {file_name}")
            return {
                "uuid": uuid,
                "fileName": file_name,
                "status": "not_found",
                "message": "No cached summary found",
                "status_code": "404"
            }
    except Exception as e:
        logger.error(f"Error deleting summary for UUID: {uuid}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/jobs/{uuid}/summarise")
def summarise_job(uuid: str, request: SummarizeRequest = None) -> dict[str, str]:
    """
    Summarises the transcript for the given UUID using a defined LLM.
    Summary is cached to a text file in the "summary" folder.
    Accepts optional custom prompts via request body.
    """
    file_name_response = get_file_name(uuid)
    if "error" in file_name_response:
        raise HTTPException(status_code=404, detail=f"File not found for UUID: {uuid}")
    file_name = file_name_response["file_name"]
    summary_dir = Path("summary")
    summary_dir.mkdir(exist_ok=True)
    summary_path = summary_dir / f"{uuid}.txt"

    # Return cached summary if it exists
    if summary_path.exists():
        try:
            cached_summary = summary_path.read_text(encoding="utf-8")
            timestamp = get_timestamp()
            logger.info(f"Returned cached summary for UUID: {uuid}, file name: {file_name}")
            return {
                "uuid": uuid,
                "fileName": file_name,
                "status": "success",
                "status_code": "200",
                "summary": cached_summary
            }
        except Exception as e:
            logger.error(f"Error reading cached summary for UUID: {uuid}, file name: {file_name}: {e}", exc_info=True)
            # Fall through to generate new summary if reading cached summary fails

    # Generate new summary if not cached or error reading cached
    try:
        get_full_transcript_response = get_file_transcript(uuid)
        full_transcript = get_full_transcript_response["full_transcript"]

        # Use custom prompts if provided
        custom_prompt = None
        system_prompt = None
        if request:
            custom_prompt = request.custom_prompt
            system_prompt = request.system_prompt

        summary = summarise_transcript(full_transcript, file_name, custom_prompt, system_prompt)
        timestamp = get_timestamp()

        if "Error" in summary:
            logger.error(f"Error summarising transcript for UUID: {uuid}, file name: {file_name}")
            raise HTTPException(status_code=500, detail="Failed to generate summary")
        else:
            # Save summary to file
            try:
                summary_path.write_text(summary, encoding="utf-8")
            except Exception as e:
                logger.error(f"Error saving summary to file for UUID: {uuid}, file name: {file_name}: {e}", exc_info=True)

            logger.info(f"Summarised transcript for UUID: {uuid}, file name: {file_name}")
            return {
                "uuid": uuid,
                "fileName": file_name,
                "status": "success",
                "status_code": "200",
                "summary": summary
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error summarising transcript for UUID: {uuid}, file name: {file_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.patch("/jobs/{uuid}/rename")
def rename_job(uuid: str, new_name: str) -> dict:
    """
    Renames the job with the given UUID.
    """
    
    with CSV_LOCK:
        rows = []
        file_name_to_rename = None
        if os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "r", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row["uuid"] == uuid:
                        file_name_to_rename = row["file_name"]
                        row["file_name"] = new_name
                    rows.append(row)

        if file_name_to_rename:
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()
                writer.writerows(rows)
            
            # Rename the audio file
            old_audio_path = os.path.join(UPLOAD_DIR, file_name_to_rename)
            new_audio_path = os.path.join(UPLOAD_DIR, new_name)
            if os.path.exists(old_audio_path):
                os.rename(old_audio_path, new_audio_path)

            # Rename the transcript file
            old_transcript_path = os.path.join("transcripts", f"{file_name_to_rename}.json")
            new_transcript_path = os.path.join("transcripts", f"{new_name}.json")
            if os.path.exists(old_transcript_path):
                os.rename(old_transcript_path, new_transcript_path)
            
            return {"uuid": uuid, "status": "success", "new_name": new_name}
        else:
            raise HTTPException(status_code=404, detail="UUID not found")
        
@app.patch("/jobs/{uuid}/speakers")
def rename_speakers(uuid: str, speaker_map: SpeakerNameMapping) -> dict:
    """
    Updates the speaker names in a transcript file based on a provided mapping.
    
    Expects a JSON body with a 'mapping' key, e.g.:
    {
        "mapping": {
            "Speaker 1": "Alice",
            "Speaker 2": "Bob"
        }
    }
    """
    try:
        timestamp = get_timestamp()
        
        # 1. Get the filename associated with the UUID
        filename_response = get_file_name(uuid)
        if "error" in filename_response:
            logger.error(f"No file found for UUID {uuid} during speaker rename attempt.")
            raise HTTPException(status_code=404, detail=f"UUID {uuid} not found")
            
        file_name = filename_response["file_name"]
        transcript_path = os.path.join("transcripts", f"{file_name}.json")

        # 2. Check if the transcript file exists
        if not os.path.exists(transcript_path):
            logger.error(f"Transcript file not found at {transcript_path} for UUID {uuid}.")
            raise HTTPException(status_code=404, detail="Transcript file not found")

        # 3. Read, update, and write the transcript data
        temp_file_path = transcript_path + ".tmp"
        with open(transcript_path, "r", encoding="utf-8") as f_read, open(temp_file_path, "w", encoding="utf-8") as f_write:
            transcript_data = json.load(f_read)
            
            # Create a copy of the mapping from the Pydantic model
            name_map = speaker_map.mapping

            # Iterate through each segment and update the speaker name if it's in the map
            # Normalize None to placeholder
            for segment in transcript_data:
                original_speaker = (segment.get("speaker") or "Speaker 1").strip()

                if original_speaker in name_map:
                    segment["speaker"] = name_map[original_speaker].strip()
            
            json.dump(transcript_data, f_write, indent=4)

        # Atomically replace the original file with the updated one
        os.replace(temp_file_path, transcript_path)

        logger.info(f"Successfully renamed speakers for UUID {uuid}, file: {file_name}")
        return {
            "uuid": uuid, 
            "status": "success", 
            "message": "Speaker names updated successfully.",
            "status_code": "200",
            "transcript": transcript_data
        }

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Error decoding JSON for UUID {uuid}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Invalid transcript file format")
    except Exception as e:
        logger.error(f"An unexpected error occurred while renaming speakers for UUID {uuid}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

##################################### Functionality check #####################################
@app.get("/health")
def health_check():
    """
    Health check to verify if the application is running correctly."""
    error_msg = ''
    try:
        logs = get_logs()
        error_msg = [i for i in logs['logs'] if "error" in i.lower()]
        if error_msg:
            logger.error(f"Health check found errors: {error_msg}")
            raise HTTPException(status_code=500, detail="Health check failed")
        else:
            logger.info("Health check passed successfully.")
            return {"status": "ok", "status_code": "200"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

def get_logs():
    """Placeholder function for getting logs."""
    return {"logs": []}

@app.post("/api/logs")
def receive_client_logs(log_entry: ClientLogEntry):
    """
    Receives client-side log entries from the frontend.
    """
    try:
        # Format the client log for server logging
        client_info = f"Client[{log_entry.url}] - {log_entry.userAgent[:50] if log_entry.userAgent else 'Unknown'}"
        
        if log_entry.level == "ERROR":
            error_details = ""
            if log_entry.error:
                error_details = f" | Error: {log_entry.error.get('name', '')}: {log_entry.error.get('message', '')}"
            
            logger.error(
                f"CLIENT ERROR - {log_entry.message}{error_details} | {client_info}",
                extra={"client_log": log_entry.dict()}
            )
        elif log_entry.level == "WARN":
            logger.warning(f"CLIENT WARN - {log_entry.message} | {client_info}")
        else:
            logger.info(f"CLIENT {log_entry.level} - {log_entry.message} | {client_info}")
        
        return {"status": "logged"}
        
    except Exception as e:
        logger.error(f"Error processing client log: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
