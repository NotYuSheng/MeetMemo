# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Docker Development
```bash
# Build and run the application
docker compose build
docker compose up

# Run in detached mode
docker compose up -d

# View logs
docker compose logs -f meetmemo-backend
docker compose logs -f meetmemo-frontend
```

### Frontend Development (React)
```bash
cd frontend
npm start          # Start development server with HTTPS
npm run build      # Build for production
npm test           # Run tests
npm run lint:css   # Lint CSS files
npm run lint:css:fix  # Fix CSS linting issues
```

### Backend Development (Python/FastAPI)
```bash
cd backend
pip install -r requirements.txt
python main.py     # Run FastAPI server directly
```

## Architecture Overview

MeetMemo is a containerized application with three main services:

### Backend (`meetmemo-backend`)
- **Framework**: FastAPI with Uvicorn
- **Core Technologies**: 
  - OpenAI Whisper (turbo model) for speech-to-text
  - PyAnnote.audio 3.3.0 with speaker-diarization-3.1 model
  - ReportLab for PDF generation
  - PyTorch 2.7.1+cu118 for ML inference
- **Main Module**: `backend/main.py`
- **Key Features**: Audio transcription, speaker identification, LLM-powered summarization
- **GPU Acceleration**: Uses NVIDIA runtime for ML models (CUDA 11.8 compatible)

### Frontend (`meetmemo-frontend`)  
- **Framework**: React 19 with Create React App
- **Main Component**: `MeetingTranscriptionApp.js`
- **Key Libraries**: Lucide React (icons), jsPDF, React Markdown
- **Component Structure**:
  - `Header.js` - Navigation and controls
  - `AudioControls.js` - Recording/upload interface
  - `TranscriptView.js` - Displays diarized transcripts
  - `SummaryView.js` - Shows AI-generated summaries
  - `MeetingsList.js` - Historical meetings management

### Nginx (`nginx`)
- Reverse proxy serving frontend and backend
- Handles SSL termination (ports 80/443)
- Routes frontend requests and API calls to backend

## Configuration

### Environment Variables
Required in `.env` file:
- `HF_TOKEN`: Hugging Face token for PyAnnote models (requires access to speaker-diarization-3.1)
- `LLM_API_URL`: LLM endpoint for summarization (e.g., OpenAI compatible API)
- `LLM_MODEL_NAME`: LLM model identifier (e.g., qwen2.5-32b-instruct)
- `LLM_API_KEY`: Optional authentication key for LLM service

### Persistent Data
Docker volumes store:
- `audiofiles/` - Uploaded audio files
- `transcripts/` - Generated transcriptions
- `summary/` - AI-generated summaries  
- `logs/` - Application logs
- `whisper_cache/` - Whisper model cache

## Key Technical Details

### Audio Processing Pipeline
1. Audio upload/recording → Backend storage
2. Whisper transcription → Raw text
3. PyAnnote diarization → Speaker-labeled segments
4. LLM summarization → Structured summaries with action items

### API Communication
- Frontend communicates with backend via REST API
- Real-time status updates for long-running transcription jobs
- WebSocket-like polling for job progress

### Speaker Management
- Automatic speaker detection and labeling (SPEAKER_00, SPEAKER_01, etc.)
- Manual speaker name editing and persistence
- Color-coded speaker visualization in UI

## Development Notes

### GPU Requirements
- Backend service requires NVIDIA GPU for model inference
- Uses `runtime: nvidia` in docker-compose
- Fallback CPU processing available but significantly slower

### Frontend State Management
- Uses React hooks for state management (no Redux)
- Local storage for user preferences (dark mode, speaker mappings)
- Component-level state for transcription data

### File Structure Patterns
- Backend follows standard FastAPI structure
- Frontend uses standard CRA component organization
- Utilities separated into `/utils/` directories