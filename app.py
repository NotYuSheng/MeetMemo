from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import time
import json

app = FastAPI()

# Allow CORS for frontend dev
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Dummy job database
dummy_jobs = {
    "0001": {"file_name": "file_1", "status_code": "200"},
    "0002": {"file_name": "file_2", "status_code": "200"},
    "0003": {"file_name": "file_3", "status_code": "200"},
    "0004": {"file_name": "file_4", "status_code": "200"},
    "0005": {"file_name": "file_5", "status_code": "200"},
}

dummy_transcripts = {
    "0001": [
        {"speaker": "SPEAKER_1", "text": "Welcome to the meeting."},
        {"speaker": "SPEAKER_2", "text": "Thanks! Let’s begin with updates."}
    ],
    "0002": [
        {"speaker": "INTERVIEWER", "text": "Tell me about your background."},
        {"speaker": "CANDIDATE", "text": "I’ve worked on multiple projects involving AI."}
    ]
}

@app.get("/jobs")
async def get_jobs():
    return {"csv_list": dummy_jobs}

@app.get("/jobs/{uuid}/filename")
async def get_file_name(uuid: str):
    uuid = uuid.zfill(4)
    job = dummy_jobs.get(uuid)
    if job:
        return {"uuid": uuid, "file_name": job["file_name"]}
    return {"error": "UUID not found", "status_code": "404"}

@app.get("/jobs/{uuid}/status")
async def get_job_status(uuid: str):
    uuid = uuid.zfill(4)
    job = dummy_jobs.get(uuid)
    if job:
        status_map = {
            "200": "completed",
            "202": "processing",
            "204": "deleted",
            "500": "error"
        }
        status = status_map.get(job["status_code"], "unknown")
        return {
            "uuid": uuid,
            "file_name": job["file_name"],
            "status_code": job["status_code"],
            "status": status
        }
    return {"error": "UUID not found", "status_code": "404"}

@app.post("/jobs")
async def transcribe(file: UploadFile = File(...)):
    # Simulate transcription delay
    time.sleep(2)
    uuid = "0009"
    file_name = file.filename or "new_file"
    dummy_jobs[uuid] = {"file_name": file_name, "status_code": "200"}

    transcript = [
        {"SPEAKER_1": "Hello, are we all set for the presentation?"},
        {"SPEAKER_2": "Yes, everything is ready to go."}
    ]
    dummy_transcripts[uuid] = [
        {"speaker": speaker, "text": text} for segment in transcript for speaker, text in segment.items()
    ]
    return {"uuid": uuid, "file_name": file_name, "transcript": transcript}

@app.delete("/jobs/{uuid}")
async def delete_job(uuid: str):
    uuid = uuid.zfill(4)
    job = dummy_jobs.pop(uuid, None)
    dummy_transcripts.pop(uuid, None)
    if job:
        return {
            "uuid": uuid,
            "status": "success",
            "message": f"Job with UUID {uuid} and file {job['file_name']} deleted successfully.",
            "status_code": "204"
        }
    return {"error": "UUID not found", "status_code": "404"}

@app.get("/jobs/{uuid}/transcript")
async def get_file_transcript(uuid: str):
    uuid = uuid.zfill(4)
    transcript = dummy_transcripts.get(uuid)
    if transcript:
        return {
            "uuid": uuid,
            "status": "exists",
            "full_transcript": json.dumps([{entry["speaker"]: entry["text"]} for entry in transcript])
        }
    return {"uuid": uuid, "status": "not found"}

@app.get("/jobs/{uuid}/result")
async def get_job_result(uuid: str):
    uuid = uuid.zfill(4)
    transcript = dummy_transcripts.get(uuid)
    if not transcript:
        return {"uuid": uuid, "status": "not found"}
    
    # Fake diarised timestamps
    result = ""
    for i, entry in enumerate(transcript, start=1):
        speaker = entry["speaker"].lower()
        result += f"{speaker}:\n  {i*1.0:.2f}–{i*1.0+1.5:.2f} → {entry['text']}\n"
    return {"uuid": uuid, "status": "exists", "result": result}

@app.post("/jobs/{uuid}/summarise")
def summarise_job(uuid: str) -> dict[str, str | list[str]]:
    """
    Dummy function to summarise transcription result
    with the help of an LLM.
    """
    time.sleep(3)

    return {
        "uuid": "1",
        "status": "success",
        "status_code": "200",
        "fileName": "FILE NAME",
        "participants": ["speaker_1", "speaker_2"],
        "keyPoints": ["The quick brown fox jumps over the lazy dog."],
        "actionItems": ["Carry out task 1.", "Carry out task 2."],
        "nextSteps": ["Carry out sub-task 1."]
    }