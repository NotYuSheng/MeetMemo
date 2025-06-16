from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Mount the static directory (React build)
app.mount("/static", StaticFiles(directory="../frontend/build/static"), name="static")

@app.post("/jobs")
async def transcribe(file: UploadFile = File(...)) -> dict[str, list[dict[str, str]]]:
    """
    Dummy function to transcribe input audio file.
    """
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

    return {"transcription": dummy_transcription}

@app.get("/jobs")
async def check_files() -> dict[str, list[str]]:
    """
    Dummy route to return a JSON response including a list of strings.
    """
    return {"result": ["file_1", "file_2", "file_3", "file_4", "file_5"]}

@app.get("/files/{file}")
async def get_file_transcript(file: str) -> dict[str, list[dict[str, str]]]:
    """
    Gets the transcription contents from the file.
    """
    dummy_transcripts = {
        "file_1": [
            {"Speaker 1": "Good morning, everyone. Let's begin with the project updates."},
            {"Speaker 2": "Sure. We've completed the initial design phase and are moving into development."},
            {"Speaker 1": "Excellent. Any blockers or concerns we should address now?"},
            {"Speaker 3": "Not at the moment, but we'll need additional resources by next sprint."}
        ],
        "file_2": [
            {"Interviewer": "Can you tell me about a time you handled a challenging situation at work?"},
            {"Candidate": "Yes, there was a time we had to deliver a project in half the usual time. I reorganized our workflow and prioritized key features."},
            {"Interviewer": "Impressive. What was the result?"},
            {"Candidate": "We launched on time and received positive feedback from the client."}
        ],
        "file_3": [
            {"Professor": "Today, we're going to explore the principles of quantum mechanics."},
            {"Student": "Is this related to what we covered in thermodynamics?"},
            {"Professor": "That's a great question. There are connections, but the foundational principles are quite different."}
        ],
        "file_4": [
            {"Host": "Welcome back to TechTalk Weekly. I'm your host, Jamie."},
            {"Guest": "Thanks for having me, Jamie. Excited to dive into today's topic."},
            {"Host": "Let's start with AI and privacy concerns. What's your take?"},
            {"Guest": "It's a big issue. Transparency and data control need to be built into systems by default."}
        ],
        "file_5": [
            {"Alex": "Hey, did you watch the match last night?"},
            {"Jordan": "Yeah! It was intense. That last-minute goal was wild."},
            {"Alex": "I know, right? Totally unexpected turn."}
        ]
    }

    return {"result": dummy_transcripts[file]}


# # Serve index.html at root or for unknown paths (for React Router support)
# @app.get("/{full_path:path}")
# async def serve_react_app(full_path: str):
#     index_path = "../frontend/build/index.html"
#     if os.path.exists(index_path):
#         return FileResponse(index_path)
#     return {"error": "Frontend not built yet"}