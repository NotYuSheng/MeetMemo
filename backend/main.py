from datetime import datetime, timezone, timedelta
import logging
import os
import whisper
import csv
from threading import Lock
import re
import requests
import tempfile
from collections import defaultdict
from pyannote.audio import Pipeline
from pyannote_whisper.utils import diarize_text
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
from pydub import AudioSegment
from pydantic import BaseModel

# Start up the app
app = FastAPI()    

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
logging.basicConfig(level=logging.INFO,
                    filename='logs/app.log',
                    filemode='a',
                    )

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
        full_transcript.append({
            "speaker": speaker,
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
    
    filename = f"{uuid}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)

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

        rows.sort(key=lambda r: int(r["uuid"]))

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
        r'(?P<speaker>speaker_\d+):?\s+'            # speaker label (case-insensitive, optional colon)
        r'(?P<utterance>.*?)'                       # the spoken text
        r'(?=(?:\d+\.\d+\s+\d+\.\d+\s+speaker_\d+)|\Z)',  
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

def summarise_transcript(transcript: str, custom_prompt: str = None, system_prompt: str = None) -> str:
    """
    Summarises the transcript using a defined LLM.
    
    Args:
        transcript: The transcript text to summarize
        custom_prompt: Optional custom user prompt. If None, uses default prompt.
        system_prompt: Optional custom system prompt. If None, uses default system prompt.
    """

    url = str(os.getenv("LLM_API_URL"))
    model_name = str(os.getenv("LLM_MODEL_NAME"))

    # Default system prompt
    default_system_prompt = "You are a helpful assistant that summarizes meeting transcripts. You will give a concise summary of the key points, decisions made, and any action items, outputting it in markdown format."
    
    # Default user prompt
    default_user_prompt = (
        "Please provide a concise summary of the following meeting transcript, "
        "highlighting participants, key points, action items & next steps."
        "The summary should contain point forms phrased in concise standard English."
        "You are to give the final summary in markdown format for easier visualisation."
        "Do not give the output in an integrated code block i.e.: '```markdown ```"
        "Output the summary directly. Do not add a statement like 'Here is the summary:' before the summary itself."
    )

    # Use custom prompts if provided, otherwise use defaults
    final_system_prompt = system_prompt if system_prompt else default_system_prompt
    
    # Always append transcript to user prompt, whether custom or default
    if custom_prompt:
        final_user_prompt = custom_prompt + "\n\n" + transcript
    else:
        final_user_prompt = default_user_prompt + "\n\n" + transcript 

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
        return {"error": str(e)}


@app.post("/jobs")
def transcribe(file: UploadFile, model_name: str = "turbo") -> dict:
    '''
    Gets the audio file from the front-end form data, & transcribes it using the Whisper turbo model.

    Returns an array of speaker-utterance pairs to be displayed on the front-end.
    '''
    uuid=""
    used = set()

    if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()

    with open(CSV_FILE, "r") as f:
        reader = csv.reader(f)
        for row in reader:
            try:
                if row:
                    used.add(int(row[0]))
            except (ValueError,IndexError):
                continue
    for i in range(10000):
        if i not in used:
            uuid = f"{i:04d}"
            break
    if uuid == "":
        timestamp = get_timestamp()
        file_name = file.filename
        logging.error(f"{timestamp}: Error generating UUID for transcription request for file: {file_name}.wav")
        return {"error": "No available UUIDs.", "file_name": file_name}
    
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
        logging.info(f"{timestamp}: Created transcription request for file: {wav_file_name} and UUID: {uuid} with model: {model_name}")
        add_job(uuid, os.path.splitext(file_name)[0] + '.wav',"202")
        model = whisper.load_model(model_name)
        device = DEVICE
        model = model.to(device)
        file_path = os.path.join(UPLOAD_DIR, wav_file_name)
        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Processing file {wav_file_name} with model {model_name}")

        # Transcription & diarization of text
        hf_token = os.getenv("USE_AUTH_TOKEN")
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization", 
            use_auth_token=hf_token
        )
        asr = model.transcribe(file_path, language="en")
        diarization = pipeline(file_path)

        # Format the transcribed + diarized results as array of speaker-utterance pairs
        diarized = diarize_text(asr, diarization)
        full_transcript = format_result(diarized=diarized)

        # Save results & log activity process
        timestamp = get_timestamp()
        os.makedirs("transcripts", exist_ok=True)
        json_path = os.path.join("transcripts", f"{file_name}.wav.json")
        if not os.path.exists(json_path):
            with open(os.path.join("transcripts", f"{file_name.split('.')[0]}.wav.json"), "w", encoding="utf-8") as f:
                json.dump(full_transcript, f, indent=4)

        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Successfully processed file {file_name} with model {model_name}")
        update_status(uuid, "200") 
        return {"uuid": uuid, "file_name": file_name, "transcript": full_transcript}
    
    # Catch any errors when trying to transcribe & diarize recording
    except Exception as e:
        timestamp = get_timestamp()
        file_name = file.filename
        logging.error(f"{timestamp}: Error processing file {file_name}: {e}", exc_info=True)
        update_status(uuid, "500")
        return {"uuid": uuid, "file_name": file_name, "error": str(e), "status_code": "500"}

@app.delete("/jobs/{uuid}")
def delete_job(uuid: str) -> dict:
    """
    Deletes the job with the given UUID, including the audio file and its transcript.
    """
    file_name = None
    uuid = uuid.zfill(4)  

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
            return {"error": "UUID not found", "status_code": "404"}

        with open(CSV_FILE, "w", newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
    try:
        os.remove(os.path.join(UPLOAD_DIR, file_name))
    except FileNotFoundError:
        timestamp = get_timestamp()
        logging.warning(f"{timestamp}: File {file_name} not found in {UPLOAD_DIR}. It may have already been deleted.")
    try:  
        os.remove(os.path.join("transcripts", f"{file_name}.json"))
    except FileNotFoundError:
        timestamp = get_timestamp()
        logging.warning(f"{timestamp}: Transcript {file_name}.json not found in transcripts directory. It may have already been deleted.")

    timestamp = get_timestamp()
    logging.info(f"{timestamp}: Deleted job with UUID: {uuid}, file name: {file_name}")
    return {"uuid": uuid, "status": "success", "message": f"Job with UUID {uuid} and file {file_name} deleted successfully.", "status_code": "204"}

@app.get("/jobs/{uuid}/filename")
def get_file_name(uuid: str) -> dict:
    """
    Returns the file name associated with the given UUID.
    """
    uuid = uuid.zfill(4)

    if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()

    with open(CSV_FILE, "r") as f:
        reader = csv.reader(f)
        for row in reader:
            if row[0] == uuid:
                return {"uuid": uuid, "file_name": row[1]}
            
    return {"error": f"UUID: {uuid} not found", "status_code": "404", "file_name": "404"}

@app.get("/jobs/{uuid}/status")
def get_job_status(uuid: str):
    """
    Returns the file_name and status for the given uuid,
    reading from jobs.csv (uuid, file_name, status_code).
    """
    uuid = uuid.zfill(4)
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
        uuid = uuid.zfill(4)
        file_name = get_file_name(uuid)["file_name"]
        file_path = f"transcripts/{file_name}.json"
        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Retrieving transcript for UUID: {uuid}, file name: {file_name}")
        
        if os.path.exists(file_path):
            full_transcript = []
            with open(file_path, "r", encoding="utf-8") as f:
                full_transcript = f.read()
            timestamp = get_timestamp()
            logging.info(f"{timestamp}: Successfully retrieved raw transcript for UUID: {uuid}, file name: {file_name}")
            return {"uuid": uuid, "status": "exists", "full_transcript": full_transcript,"status_code":"200"}
        else:
            timestamp = get_timestamp()
            logging.error(f"{timestamp}: {file_name} transcript not found.")
            return {"uuid": uuid, "status": "not found", "status_code":"404"}
    except Exception as e: 
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error retrieving {file_name} transcript.")
        return {"uuid": uuid, "status": "error", "error":e, "status_code":"500",}

@app.post("/jobs/{uuid}/summarise")
def summarise_job(uuid: str, request: SummarizeRequest = None) -> dict[str, str]:
    """
    Summarises the transcript for the given UUID using a defined LLM.
    
    Args:
        uuid: The job UUID to summarize
        request: Optional SummarizeRequest containing custom_prompt and/or system_prompt
    """
    uuid = uuid.zfill(4)
    file_name = get_file_name(uuid)["file_name"]
    try:
        get_full_transcript_response = get_file_transcript(uuid)
        if get_full_transcript_response["status"] == "not found":
            raise HTTPException(status_code=404, detail={"error": f"Transcript not found for the given UUID: {uuid}."})
        else:
            full_transcript = get_full_transcript_response["full_transcript"]

        # Extract custom prompts if provided
        custom_prompt = None
        system_prompt = None
        if request:
            custom_prompt = request.custom_prompt
            system_prompt = request.system_prompt

        summary = summarise_transcript(full_transcript, custom_prompt, system_prompt)

        if "Error" in summary:
            timestamp = get_timestamp()
            logging.error(f"{timestamp}: Error summarising transcript for UUID: {uuid}, file name: {file_name}")
            raise HTTPException(status_code=500, detail={"uuid": uuid, "file_name": file_name, "status": "error", "summary": summary})
        else:
            timestamp = get_timestamp()
            logging.info(f"{timestamp}: Summarised transcript for UUID: {uuid}, file name: {file_name}")
            return {
            "uuid": uuid,
            "fileName": file_name,
            "status": "success",
            "status_code": "200",
            "summary": summary}
    
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error summarising transcript for UUID: {uuid}, file name: {file_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"uuid": uuid, "file_name": file_name, "error": str(e), "summary": ""})

@app.patch("/jobs/{uuid}/rename")
def rename_job(uuid: str, new_name: str) -> dict:
    """
    Renames the job with the given UUID.
    """
    uuid = uuid.zfill(4)
    
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
            return {"error": "UUID not found", "status_code": "404"}
        
@app.patch("/jobs/{uuid}/speakers")
def rename_speakers(uuid: str, speaker_map: SpeakerNameMapping) -> dict:
    """
    Updates the speaker names in a transcript file based on a provided mapping.
    
    Expects a JSON body with a 'mapping' key, e.g.:
    {
        "mapping": {
            "SPEAKER_00": "Alice",
            "SPEAKER_01": "Bob"
        }
    }
    """
    try:
        uuid = uuid.zfill(4)
        timestamp = get_timestamp()
        
        # 1. Get the filename associated with the UUID
        filename_response = get_file_name(uuid)
        if "error" in filename_response:
            logging.error(f"{timestamp}: No file found for UUID {uuid} during speaker rename attempt.")
            return {"error": f"UUID {uuid} not found", "status_code": "404"}
            
        file_name = filename_response["file_name"]
        transcript_path = os.path.join("transcripts", f"{file_name}.json")

        # 2. Check if the transcript file exists
        if not os.path.exists(transcript_path):
            logging.error(f"{timestamp}: Transcript file not found at {transcript_path} for UUID {uuid}.")
            return {"error": "Transcript file not found", "status_code": "404"}

        # 3. Read, update, and write the transcript data
        temp_file_path = transcript_path + ".tmp"
        with open(transcript_path, "r", encoding="utf-8") as f_read, open(temp_file_path, "w", encoding="utf-8") as f_write:
            transcript_data = json.load(f_read)
            
            # Create a copy of the mapping from the Pydantic model
            name_map = speaker_map.mapping

            # Iterate through each segment and update the speaker name if it's in the map
            # Normalize None to placeholder
            for segment in transcript_data:
                original_speaker = (segment.get("speaker") or "SPEAKER_00").strip()

                if original_speaker in name_map:
                    segment["speaker"] = name_map[original_speaker].strip()
            
            json.dump(transcript_data, f_write, indent=4)

        # Atomically replace the original file with the updated one
        os.replace(temp_file_path, transcript_path)

        logging.info(f"{timestamp}: Successfully renamed speakers for UUID {uuid}, file: {file_name}")
        return {
            "uuid": uuid, 
            "status": "success", 
            "message": "Speaker names updated successfully.",
            "status_code": "200",
            "transcript": transcript_data
        }

    except json.JSONDecodeError as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error decoding JSON for UUID {uuid}: {e}", exc_info=True)
        return {"uuid": uuid, "status": "error", "error": "Invalid transcript file format.", "status_code": "500"}
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: An unexpected error occurred while renaming speakers for UUID {uuid}: {e}", exc_info=True)
        return {"uuid": uuid, "status": "error", "error": str(e), "status_code": "500"}

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
        if error_msg:
            timestamp = get_timestamp()
            logging.error(f"{timestamp}: Health check found errors: {error_msg}")
            return {"status": "error", "message": error_msg, "status_code": "500"}
        else:
            timestamp = get_timestamp()
            logging.info(f"{timestamp}: Health check passed successfully.")
            return {"status": "ok", "status_code": "200"}
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Health check failed: {e}")
        return {"status": "error", "error": str(e), "status_code": "500"}