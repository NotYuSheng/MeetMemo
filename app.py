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
    "0006": {"file_name": "file_6", "status_code": "200"},
    "0007": {"file_name": "file_7", "status_code": "200"},
    "0008": {"file_name": "file_8", "status_code": "200"},
    "0009": {"file_name": "file_9", "status_code": "200"},
    "0010": {"file_name": "file_10", "status_code": "200"},
    "0011": {"file_name": "file_11", "status_code": "200"},
    "0012": {"file_name": "file_12", "status_code": "200"},
    "0013": {"file_name": "file_13", "status_code": "200"},
    "0014": {"file_name": "file_14", "status_code": "200"},
    "0015": {"file_name": "file_15", "status_code": "200"},
    "0016": {"file_name": "file_16", "status_code": "200"},
    "0017": {"file_name": "file_17", "status_code": "200"},
    "0018": {"file_name": "file_18", "status_code": "200"},
    "0019": {"file_name": "file_19", "status_code": "200"},
    "0020": {"file_name": "file_20", "status_code": "200"},
}

dummy_transcripts = {
    "0001": [
        {"speaker": "speaker 1", "text": "Welcome to the meeting."},
        {"speaker": "speaker 2", "text": "Thanks! Let's begin with updates."},
        {"speaker": "speaker 3", "text": "Team Cicada has already liasoned with the production team to arrange for shipments. We'll be ready to go in about 2 weeks."},
        {"speaker": "speaker 1", "text": "That's re-assuring to hear."}
    ],
    "0002": [
        {"speaker": "INTERVIEWER", "text": "Tell me about your background."},
        {"speaker": "CANDIDATE", "text": "I've worked on multiple projects involving AI."},
        {"speaker": "INTERVIEWER", "text": "That's great to hear! Can you elaborate a little more about them?"},
        {"speaker": "CANDIDATE", 'text': "It's got to do with locally-hosted apps that help assist the team in their day-to-day activities. It helps us automate some of the more mundane tasks."},
        {"speaker": "INTERVIEWER", "text": "Interesting."}
    ],
    "0003": [
        {"speaker": "Candice", "text": "Hello guys! How's everyone doing?"},
        {"speaker": "Markko", "text": "I'm doing pretty fine. Just went on a trip to Japan - saw snow over there for the first time!"},
        {"speaker": "Charlie", "text": "That's so cool. I'm a little jealous, to be honest. Have never really been to Japan before."},
        {"speaker": "Candice", "text": "Yeah, me too. I've only been to countries in Sountheast Asia in my past trips. Japan sounds like a nice place to go for my next vacation."}
    ],
    "0004": [
        {"speaker": "Tom", "text": "Hello! Let's start discussing about our project that's due soon."},
        {"speaker": "Sally", "text": "Sure, let's start by assigning roles to team members."},
        {"speaker": "Tom", "text": "Cindy can help with the news sourcing, you can help prepare the slides while I continue working on the write-up."},
        {"speaker": "Sally", "text": "Sure, sounds like a plan."}
    ],
    "0005": [
        {"speaker": "speaker 1", "text": "How's the restaurant trip yesterday?"},
        {"speaker": "speaker 2", "text": "It was pretty good. The food was affordable & the quality was suprisingly good."},
        {"speaker": "speaker 1", "text": "Cool! Maybe I can bring my family along for a meal there this coming Friday."}
    ],
    "0006": [{"speaker": "speaker 1", "text": "This is transcript 6."}],
    "0007": [{"speaker": "speaker 1", "text": "This is transcript 7."}],
    "0008": [{"speaker": "speaker 1", "text": "This is transcript 8."}],
    "0009": [{"speaker": "speaker 1", "text": "This is transcript 9."}],
    "0010": [{"speaker": "speaker 1", "text": "This is transcript 10."}],
    "0011": [{"speaker": "speaker 1", "text": "This is transcript 11."}],
    "0012": [{"speaker": "speaker 1", "text": "This is transcript 12."}],
    "0013": [{"speaker": "speaker 1", "text": "This is transcript 13."}],
    "0014": [{"speaker": "speaker 1", "text": "This is transcript 14."}],
    "0015": [{"speaker": "speaker 1", "text": "This is transcript 15."}],
    "0016": [{"speaker": "speaker 1", "text": "This is transcript 16."}],
    "0017": [{"speaker": "speaker 1", "text": "This is transcript 17."}],
    "0018": [{"speaker": "speaker 1", "text": "This is transcript 18."}],
    "0019": [{"speaker": "speaker 1", "text": "This is transcript 19."}],
    "0020": [{"speaker": "speaker 1", "text": "This is transcript 20."}],
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
    return {"uuid": uuid, "fileName": file_name, "transcript": transcript}

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