# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Frontend (React)
- `cd frontend && npm ci` - Install frontend dependencies
- `cd frontend && npm start` - Start development server with HTTPS on port 3000 (required for microphone access)
- `cd frontend && npm run build` - Build production frontend
- `cd frontend && npm test` - Run tests
- `cd frontend && npm run lint:css` - Lint CSS files
- `cd frontend && npm run lint:css:fix` - Auto-fix CSS linting issues
- `cd frontend && npx eslint src --fix` - Auto-fix ESLint issues
- `cd frontend && npx prettier --write .` - Format code with Prettier

### Backend (Python/FastAPI)
- `cd backend && pip install -r requirements.txt` - Install backend dependencies
- `cd backend && python main.py` - Run FastAPI server on port 8000
- `ruff check .` - Lint Python code
- `ruff check . --fix` - Auto-fix Python linting issues

### Docker
- `docker compose build` - Build all services
- `docker compose up` - Start all services (frontend on :3000, backend on :8000)
- `docker compose down` - Stop all services

## Project Architecture

### High-Level Structure
MeetMemo is a meeting transcription and summarization application with:
- **Frontend**: React SPA that handles audio recording, file uploads, and displays transcripts/summaries
- **Backend**: FastAPI service that processes audio using Whisper + PyAnnote for transcription and speaker diarization
- **LLM Integration**: External LLM API for generating meeting summaries

### Key Components

#### Backend (/backend/main.py)
- FastAPI app with CORS middleware for frontend communication
- Audio processing pipeline: Whisper (transcription) + PyAnnote (speaker diarization)
- Job management system using CSV files to track processing status
- File storage in organized directories (audiofiles/, transcripts/, summary/)
- RESTful API endpoints for job CRUD operations and summary generation

#### Frontend (/frontend/src/MeetingTranscriptionApp.js)
- Main React component handling recording, upload, and display logic
- Audio recording using MediaRecorder API
- Real-time job status polling for async processing
- Speaker name editing and transcript management
- Summary generation with custom prompts support
- Export functionality (PDF summaries, TXT transcripts)

#### Data Flow
1. Audio input (recording/upload) → FormData to backend
2. Backend processes with Whisper/PyAnnote → JSON transcript stored
3. Frontend polls job status → displays transcript with speaker diarization
4. Summary generation via external LLM → cached as text files

### Environment Configuration
- `.env` file required with HF_TOKEN, LLM_API_URL, LLM_MODEL_NAME
- Backend requires NVIDIA GPU for fast processing
- Hugging Face model licenses must be accepted for PyAnnote models

### Storage Structure
- `audiofiles/` - Uploaded audio files
- `transcripts/` - JSON files with diarized transcripts
- `summary/` - Cached summary text files
- `logs/` - Application logs
- `audiofiles.csv` - Job tracking database

### API Key Patterns
- GET `/jobs` - List all transcription jobs
- POST `/jobs` - Create new transcription job
- GET `/jobs/{uuid}/transcript` - Get transcript for job
- POST `/jobs/{uuid}/summarise` - Generate/get summary
- PATCH `/jobs/{uuid}/speakers` - Update speaker names
- DELETE `/jobs/{uuid}` - Delete job and associated files

### GitHub Actions
- `deploy-gh-pages.yml` - Builds and deploys frontend to GitHub Pages with SPA routing support
- `lint-frontend.yml` - Auto-fixes ESLint, Prettier, and Stylelint issues
- `ruff.yaml` - Lints Python code with Ruff

### GitHub Pages Deployment
- Frontend deployed to `https://notyusheng.github.io/MeetMemo`
- Supports client-side routing with 404.html fallback
- Uses Node.js 20 for build process
- Includes `.nojekyll` file to prevent Jekyll processing

## Development Notes

### Audio Processing
- Supports multiple Whisper models (tiny, medium, turbo)
- Automatic WAV conversion for non-WAV files
- GPU acceleration required for reasonable processing times
- Speaker diarization assigns SPEAKER_00, SPEAKER_01, etc. labels

### Frontend State Management
- Uses React hooks for state management
- Real-time polling for job status updates
- Speaker color mapping for UI consistency
- Dark/light mode support with system preference detection
- Microphone access requires HTTPS (automatically enabled in dev server)

### Error Handling
- Backend logs errors with timestamps to logs/app.log
- Frontend displays user-friendly error messages
- Job status tracking (pending/processing/completed/error)
- Graceful handling of missing files and API failures