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
        return {"name": csv_list[uuid]}
    return {"error": "UUID not found"}


@app.get("/jobs")
async def check_files() -> dict[str, dict[str, str]]:
    """
    Dummy route to return a JSON response including a list of strings.
    """
    return {
        "csv_list":
        {
            "1": "file_1",
            "2": "file_2",
            "3": "file_3",
            "4": "file_4",
            "5": "file_5"
        }
    }


@app.post("/jobs")
async def transcribe(file: UploadFile = File(...)) -> dict[str, str | list[dict[str, str]]]:
    """
    Dummy function to transcribe input audio file.
    """
    time.sleep(3)
    dummy_transcription = [
        {"Customer": "Hi, I'm having trouble connecting to the internet."},
        {"Support Agent": "I'm sorry to hear that. Can you tell me if any of the router lights are blinking red?"},
        {"Customer": "Yes, the one labeled 'WAN' is flashing red."},
        {"Support Agent": "Alright. That usually means the router isn't detecting a signal. Let's try restarting it first."},
        {"Customer": "Okay, I've unplugged it and plugged it back in."},
        {"Support Agent": "Great. Let's give it a minute... Are the lights back to normal now?"},
        {"Customer": "Yes, they're all green now!"},
        {"Support Agent": "Perfect. You should be back online. Is everything working on your end?"},
        {"Customer": "Yes, thank you so much for your help!"},
        {"Support Agent": "You're very welcome. Have a great day!"}
    ]

    return {
        "uuid": "1",
        "file_name": "new_file",
        "transcript": dummy_transcription
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
            {"Speaker 1": "Good morning, everyone. Let's begin with the project updates."},
            {"Speaker 2": "Sure. We've completed the initial design phase and are moving into development."},
            {"Speaker 1": "Excellent. Any blockers or concerns we should address now?"},
            {"Speaker 3": "Not at the moment, but we'll need additional resources by next sprint."}
        ],
        "2": [
            {"Interviewer": "Can you tell me about a time you handled a challenging situation at work?"},
            {"Candidate": "Yes, there was a time we had to deliver a project in half the usual time. I reorganized our workflow and prioritized key features."},
            {"Interviewer": "Impressive. What was the result?"},
            {"Candidate": "We launched on time and received positive feedback from the client."}
        ],
        "3": [
            {"Professor": "Today, we're going to explore the principles of quantum mechanics."},
            {"Student": "Is this related to what we covered in thermodynamics?"},
            {"Professor": "That's a great question. There are connections, but the foundational principles are quite different."}
        ],
        "4": [
            {"Host": "Welcome back to TechTalk Weekly. I'm your host, Jamie."},
            {"Guest": "Thanks for having me, Jamie. Excited to dive into today's topic."},
            {"Host": "Let's start with AI and privacy concerns. What's your take?"},
            {"Guest": "It's a big issue. Transparency and data control need to be built into systems by default."}
        ],
        "5": [
            {"Alex": "Hey, did you watch the match last night?"},
            {"Jordan": "Yeah! It was intense. That last-minute goal was wild."},
            {"Alex": "I know, right? Totally unexpected turn."}
        ]
    }

    return {"result": dummy_transcripts[uuid]}

@app.post("/jobs/{uuid}/summarise")
def summarise_job(uuid: str) -> dict:
    """
    Dummy function to summarise transcription result
    with the help of an LLM.
    """
    time.sleep(3)

    return {
        "status": "success",
        "summary": "The quick brown fox jumps over the lazy dog."
    }