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
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import json
from pydub import AudioSegment

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

##################################### Functions #####################################
def get_timestamp() -> str:
    '''
    Gets the current date & time in the `YYYY-MM-DD H:MM:SS` format.
    '''
    tz_gmt8 = timezone(timedelta(hours=8))
    return datetime.now(tz_gmt8).strftime("%Y-%m-%d %H:%M:%S")


def format_result(diarized: list) -> list[dict]:
    """
    Formats the diarized results into an array of
    {speaker: text} entries.
    
    diarized: list of tuples (segment, speaker, utterance)
    """
    full_transcript = []

    for segment, speaker, utterance in diarized:
        full_transcript.append({
            speaker: utterance.strip()
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

def summarise_transcript(transcript: str) -> str:
    """
    Summarises the transcript using a defined LLM.
    """

    url = str(os.getenv("LLM_API_URL"))
    model_name = str(os.getenv("LLM_MODEL_NAME"))

    payload = {
        "model": model_name,
        "temperature": 0.3,
        "max_tokens": 5000,
        "messages": [
            {"role": "system",
             "content": "You are a helpful assistant that summarizes meeting transcripts. You will give a concise summary of the key points, decisions made, and any action items, outputting it in markdown format."},
            {"role": "user",
             "content": (
                 "Please provide a concise summary of the following meeting transcript, "
                 "highlighting participants, key points, action items & next steps."
                 "The summary should contain point forms phrased in concise standard English."
                 "You are to give the final summary in markdown format for easier visualisation."
                 "Do not give the output in an integrated code block i.e.: '```markdown ```"
                 "Output the summary directly. Do not add a statement like 'Here is the summary:' before the summary itself.\n\n"
                 + transcript
             )},
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
            return {"csv_list": "No audio files found."}
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

        logging.info(f"Created transcription request for file: {wav_file_name} and UUID: {uuid} with model: {model_name}")
        add_job(uuid, os.path.splitext(file_name)[0] + '.wav',"202")
        model = whisper.load_model(model_name)
        device = DEVICE
        model = model.to(device)
        file_path = os.path.join(UPLOAD_DIR, wav_file_name)

        # Log time & activity
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
        json_path = os.path.join("transcripts", f"{file_name}.json")
        if not os.path.exists(json_path):
            with open(os.path.join("transcripts", f"{file_name.split('.')[0]}.json"), "w", encoding="utf-8") as f:
                json.dump(full_transcript, f, indent=4)
            
        logging.info(f"{timestamp}: Successfully processed file {file_name}.wav with model {model_name}")
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
        logging.warning(f"File {file_name} not found in {UPLOAD_DIR}. It may have already been deleted.")
    try:  
        os.remove(os.path.join("transcripts", f"{file_name}.json"))
    except FileNotFoundError:
        logging.warning(f"Transcript {file_name}.json not found in transcripts directory. It may have already been deleted.")
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
        logging.info(file_path)
        
        if os.path.exists(file_path):
            full_transcript = []
            with open(file_path, "r", encoding="utf-8") as f:
                full_transcript = f.read()
            timestamp = get_timestamp()
            logging.info(f"{timestamp}: Retrieved raw transcript for UUID: {uuid}, file name: {file_name}")
            return {"uuid": uuid, "status": "exists", "full_transcript": full_transcript}
        else:
            return {"uuid": uuid, "status": "not found"}
        
    except: return {"uuid": uuid, "status": "not found"}

@app.get("/jobs/{uuid}/result")
def get_job_result(uuid: str) -> dict:
    """
    Returns the  transcript with timestamps for the given UUID, separated by speakers.
    """
    uuid = uuid.zfill(4)
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
    return {"uuid": uuid, "status": "exists", "result": full_result}

@app.post("/jobs/{uuid}/summarise")
def summarise_job(uuid: str) -> dict[str, str]:
    """
    Summarises the transcript for the given UUID using a defined LLM.
    """
    uuid = uuid.zfill(4)
    file_name = get_file_name(uuid)["file_name"]
    try:
        get_full_transcript_response = get_file_transcript(uuid)
        if get_full_transcript_response["status"] == "not found":
            return {"error": f"Transcript not found for the given UUID: {uuid}."}
        else:
            full_transcript = get_full_transcript_response["full_transcript"]

        summary = summarise_transcript(full_transcript)
        timestamp = get_timestamp()

        if "Error" in summary:
            logging.error(f"{timestamp}: Error summarising transcript for UUID: {uuid}, file name: {file_name}")
            return {"uuid": uuid, "file_name": file_name, "status": "error", "summary": summary, "status_code": "500"}
        else:
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
        return {"uuid": uuid, "file_name": file_name, "error": str(e), "status_code": "500", "summary": ""} # type: ignore

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
            return {"status": "error", "message": error_msg, "status_code": "500"}
        else:
            logging.info(f"{timestamp}: Health check passed successfully.")
            return {"status": "ok", "status_code": "200"}
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Health check failed: {e}")
        return {"status": "error", "error": str(e), "status_code": "500"}


@app.post("/testingllm")
def testingllm():
    import requests, json

    payload = {
        "model": "Qwen2.5",
        "messages": [
            {"role": "system", "content": "You are a travel advisor."},
            {"role": "user", "content": "What are the 3 Laws of Newton?"}
        ],
        "temperature": 0.8,
        "max_tokens": 8000
    }

    r = requests.post(
        "http://qwen2.5:8000/v1/chat/completions",
        headers={"Content-Type": "application/json"},
        json=payload, timeout=60
    )
    resp = r.json()
    return(resp['choices'][0]['message']['content'])