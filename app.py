from fastapi import FastAPI, UploadFile, File
import time

app = FastAPI()

@app.get("/jobs/{uuid}/filename")
async def get_file_name(uuid: str) -> dict[str, str]:
    """
    Returns the filename associated with a given UUID.
    """
    csv_list = {
        "1": "file_1",
        "2": "file_2",
        "3": "file_3",
        "4": "file_4",
        "5": "file_5"
    }

    if uuid in csv_list:
        return {"file_name": csv_list[uuid]}
    return {"error": "UUID not found"}


@app.get("/jobs")
async def check_files() -> dict[str, dict[str, dict[str, str]]]:
    """
    Dummy route to return a JSON response including a list of strings.
    """
    return {
        "csv_list":
        {
            "1": {"file_name": "file_1", "status_code": "200"},
            "2": {"file_name": "file_2", "status_code": "200"},
            "3": {"file_name": "file_3", "status_code": "200"},
            "4": {"file_name": "file_4", "status_code": "200"},
            "5": {"file_name": "file_5", "status_code": "200"}
        }
    }


@app.post("/jobs")
async def transcribe(file: UploadFile = File(...)) -> dict[str, str | list[dict[str, int | str]]]:
    """
    Dummy function to transcribe input audio file.
    """
    time.sleep(3)
    dummy_transcription = [
        {"id": 1, "speaker": "SPEAKER_1", "text": "Hi, I'm having trouble connecting to the internet."},
        {"id": 2, "speaker": "SPEAKER_2", "text": "I'm sorry to hear that. Can you tell me if any of the router lights are blinking red?"},
        {"id": 3, "speaker": "SPEAKER_1", "text": "Yes, the one labeled 'WAN' is flashing red."},
        {"id": 4, "speaker": "SPEAKER_2", "text": "Alright. That usually means the router isn't detecting a signal. Let's try restarting it first."},
        {"id": 5, "speaker": "SPEAKER_1", "text": "Okay, I've unplugged it and plugged it back in."},
        {"id": 6, "speaker": "SPEAKER_2", "text": "Great. Let's give it a minute... Are the lights back to normal now?"},
        {"id": 7, "speaker": "SPEAKER_1", "text": "Yes, they're all green now!"},
        {"id": 8, "speaker": "SPEAKER_2", "text": "Perfect. You should be back online. Is everything working on your end?"},
        {"id": 9, "speaker": "SPEAKER_1", "text": "Yes, thank you so much for your help!"},
        {"id": 10, "speaker": "SPEAKER_2", "text": "You're very welcome. Have a great day!"}
    ]

    return {
        "uuid": "1",
        "file_name": "new_file",
        "transcript": [{entry["speaker"]: entry["text"]} for entry in dummy_transcription]
    }


@app.delete("/jobs/{uuid}")
async def delete_item(uuid: int) -> dict[str, str]:
    uuid_files = {
        1: "file_1",
        2: "file_2",
        3: "file_3",
        4: "file_4",
        5: "file_5"
    }
    return {"status": "success", "message": f"Job with UUID {uuid} and file {uuid_files[uuid]} deleted successfully."}


@app.get("/jobs/{uuid}/transcript")
async def get_file_transcript(uuid: str) -> dict[str, list[dict[str, str]]]:
    """
    Gets the transcription contents from the file.
    """
    dummy_transcripts = {
        "1": [
            {"id": 1, "speaker": "SPEAKER_1", "text": "Good morning, everyone. Let's begin with the project updates."},
            {"id": 2, "speaker": "SPEAKER_2", "text": "Sure. We've completed the initial design phase and are moving into development."},
            {"id": 3, "speaker": "SPEAKER_1", "text": "Excellent. Any blockers or concerns we should address now?"},
            {"id": 4, "speaker": "SPEAKER_3", "text": "Not at the moment, but we'll need additional resources by next sprint."}
        ],
        "2": [
            {"id": 5, "speaker": "INTERVIEWER", "text": "Can you tell me about a time you handled a challenging situation at work?"},
            {"id": 6, "speaker": "CANDIDATE", "text": "Yes, there was a time we had to deliver a project in half the usual time. I reorganized our workflow and prioritized key features."},
            {"id": 7, "speaker": "INTERVIEWER", "text": "Impressive. What was the result?"},
            {"id": 8, "speaker": "CANDIDATE", "text": "We launched on time and received positive feedback from the client."}
        ],
        "3": [
            {"id": 9, "speaker": "PROFESSOR", "text": "Today, we're going to explore the principles of quantum mechanics."},
            {"id": 10, "speaker": "STUDENT", "text": "Is this related to what we covered in thermodynamics?"},
            {"id": 11, "speaker": "PROFESSOR", "text": "That's a great question. There are connections, but the foundational principles are quite different."}
        ],
        "4": [
            {"id": 12, "speaker": "HOST", "text": "Welcome back to TechTalk Weekly. I'm your host, Jamie."},
            {"id": 13, "speaker": "GUEST", "text": "Thanks for having me, Jamie. Excited to dive into today's topic."},
            {"id": 14, "speaker": "HOST", "text": "Let's start with AI and privacy concerns. What's your take?"},
            {"id": 15, "speaker": "GUEST", "text": "It's a big issue. Transparency and data control need to be built into systems by default."}
        ],
        "5": [
            {"id": 16, "speaker": "ALEX", "text": "Hey, did you watch the match last night?"},
            {"id": 17, "speaker": "JORDAN", "text": "Yeah! It was intense. That last-minute goal was wild."},
            {"id": 18, "speaker": "ALEX", "text": "I know, right? Totally unexpected turn."}
        ]
    }

    return {"result": [{entry["speaker"]: entry["text"]} for entry in dummy_transcripts[uuid]]}

@app.post("/jobs/{uuid}/summarise")
def summarise_job(uuid: str) -> dict[str, str | int | list[str]]:
    """
    Dummy function to summarise transcription result
    with the help of an LLM.
    """
    time.sleep(3)

    return {
        "status": "success",
        "participants": ["speaker_1", "speaker_2"],
        "keyPoints": ["The quick brown fox jumps over the lazy dog."],
        "actionItems": ["Carry out task 1.", "Carry out task 2."],
        "nextSteps": ["Carry out sub-task 1."]
    }