# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MeetMemo is an AI-powered meeting transcription and summarization application with a React frontend and FastAPI backend. It uses OpenAI Whisper for transcription, PyAnnote for speaker diarization, and custom LLMs for generating summaries. The application runs in Docker containers with GPU support for processing.

## Development Commands

### Docker Environment (Recommended)
```bash
# Start the full application stack
docker compose up

# Rebuild and start
docker compose build && docker compose up

# Start only backend or frontend
docker compose up meetmemo-backend
docker compose up meetmemo-frontend
```

### Frontend Development
```bash
cd frontend
npm install
npm start                    # Development server with HTTPS on 0.0.0.0:3000
npm run build               # Production build
npm test                    # Run Jest tests
npm run lint:css            # CSS linting
npm run lint:css:fix        # Fix CSS issues
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Required Environment Setup

Create `.env` file from `example.env`:
```env
HF_TOKEN=your_huggingface_token_here          # Required for PyAnnote models
LLM_API_URL=http://your_llm_host:port/path    # LLM endpoint for summaries
LLM_MODEL_NAME=your_model_name                # LLM model identifier
```

## Core Architecture

### Backend (`main.py`)
- **FastAPI application** serving REST endpoints on port 8000
- **Job system**: CSV-based job tracking with UUIDs (legacy 4-digit IDs supported)
- **Audio processing pipeline**: Upload → WAV conversion → Whisper transcription → PyAnnote diarization → LLM summarization
- **File storage**: `audiofiles/` for uploads, `transcripts/` for JSON results, `summary/` for cached summaries
- **PDF generation**: Uses ReportLab for professional meeting summaries with SVG logo support

### Frontend (`MeetingTranscriptionApp.js`)
- **Single-page React app** with real-time audio recording and file upload
- **Transcript processing**: Maps speaker IDs with color coding and renaming capabilities
- **Summary rendering**: Advanced markdown parser with collapsible sections, icons, and custom styling
- **Meeting management**: Lists past meetings with status indicators and deletion

### Key Components

**Audio Pipeline:**
1. Record audio or upload file → 2. Handle filename collisions (append counter if needed) → 3. Convert to WAV if needed → 4. Whisper transcription → 5. PyAnnote speaker diarization → 6. Format with speaker IDs → 7. Store as JSON

**Summary Pipeline:**
1. Fetch transcript JSON → 2. Send to LLM with custom/default prompts → 3. Parse markdown response → 4. Cache result → 5. Render with ContentRenderer

**UUID System:**
- Backend generates UUID4 for new jobs
- Frontend uses UUID4 for React component keys
- Legacy 4-digit numeric IDs maintained for backward compatibility
- CSV sorting handles both formats (numeric first, then lexicographic)

## File Structure Patterns

**Audio files**: `audiofiles/{filename}.wav` (duplicates get `_1`, `_2`, etc. appended)
**Transcripts**: `transcripts/{filename}.wav.json` 
**Summaries**: `summary/{uuid}.txt`
**Logs**: `logs/app.log`

## API Endpoints

- `POST /jobs` - Upload audio for transcription
- `GET /jobs/{uuid}/transcript` - Get raw transcript JSON
- `POST /jobs/{uuid}/summarise` - Generate/retrieve summary
- `GET /jobs/{uuid}/pdf` - Export professional PDF
- `PATCH /jobs/{uuid}/speakers` - Update speaker names
- `DELETE /jobs/{uuid}` - Delete meeting and files

## Processing Models

**Whisper models**: `tiny`, `medium`, `turbo` (selectable in UI)
**PyAnnote**: `pyannote/speaker-diarization` (requires HF token)
**GPU requirement**: CUDA-enabled GPU for faster processing

## Custom Implementations

**ContentRenderer**: Parses markdown to React components with section-specific icons, collapsible headings, and copy functionality

**Speaker Management**: Dynamic color assignment, renaming interface, persistent mapping in transcript JSON

**PDF Export**: ReportLab-based generation with professional styling, SVG logo integration, and content parity validation

**Filename Collision Prevention**: Both upload and rename operations use `get_unique_filename()` to prevent file overwrites by appending counters (_1, _2, etc.)

## Common Development Tasks

When working with transcription logic, test with the sample files in `sample-files/`. The application expects specific JSON structure for transcripts with `speaker`, `text`, `start`, `end` fields.

When modifying the summary markdown parser, ensure both web and PDF rendering produce identical content - use the debug validation function in development builds.

The UUID system maintains backward compatibility - new UUIDs are proper UUID4 strings while legacy numeric IDs continue to work and sort first in listings.