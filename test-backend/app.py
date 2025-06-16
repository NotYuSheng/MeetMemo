from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI()

# Mount the static directory (React build)
app.mount("/static", StaticFiles(directory="../frontend/build/static"), name="static")

# Serve index.html at root or for unknown paths (for React Router support)
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    index_path = "../frontend/build/index.html"
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "Frontend not built yet"}
