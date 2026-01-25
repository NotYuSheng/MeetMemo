# Architecture

This document provides a detailed overview of MeetMemo's architecture, design patterns, and technical stack.

## System Architecture

MeetMemo is a containerized application with four main services orchestrated via Docker Compose:

```
                              ┌─────────────────────┐
                              │     LLM Server      │
                              │     (External)      │
                              │  • OpenAI-compat.   │
                              │  • Summarization    │
                              └──────────▲──────────┘
                                         │
┌────────────────────────────────────────┼──────────────────────────┐
│                     Nginx (meetmemo-nginx)                        │
│                     Ports 80 (HTTP) → 443 (HTTPS)                 │
│                     • SSL/TLS termination • Reverse proxy         │
└───────────┬────────────────────────────┼──────────────────────────┘
            │                            │
            ▼                            ▼
┌─────────────────────┐         ┌────────┴────────────┐
│   React Frontend    │         │   FastAPI Backend   │
│  (meetmemo-frontend)│         │  (meetmemo-backend) │
│                     │         │                     │
│  • Recording UI     │         │  • faster-whisper   │
│  • Transcript View  │         │  • PyAnnote 3.1     │
│  • Summary Display  │         │  • LLM Integration  │
│  • Export Options   │         │  • PDF Generation   │
└─────────────────────┘         └──────────┬──────────┘
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │     PostgreSQL      │
                                │  (meetmemo-postgres)│
                                │                     │
                                │  • Job metadata     │
                                │  • Export jobs      │
                                │  • Transcriptions   │
                                └─────────────────────┘
```

### Service Overview

| Service | Purpose | Technology |
|---------|---------|------------|
| **nginx** | Reverse proxy, SSL termination, routing | Nginx with self-signed SSL |
| **meetmemo-frontend** | User interface | React 19, Vite |
| **meetmemo-backend** | API server, ML processing | FastAPI, Python 3.10+ |
| **postgres** | Data persistence | PostgreSQL 16 |

## Backend Architecture (v2.0 Modular Design)

The backend follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                            │
│  api/v1/: REST endpoints organized by domain                │
│  • jobs.py          • transcripts.py    • exports.py        │
│  • summaries.py     • speakers.py       • export_jobs.py    │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                      Service Layer                          │
│  services/: Business logic with dependency injection        │
│  • transcription_service  • diarization_service             │
│  • alignment_service      • summary_service                 │
│  • speaker_service        • export_service                  │
│  • audio_service          • cleanup_service                 │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Repository Layer                         │
│  repositories/: Data access abstraction                     │
│  • job_repository         • export_repository               │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                      PostgreSQL Database
```

### Layer Responsibilities

#### API Layer (`api/v1/`)

REST endpoints organized by domain:

| Module | Responsibility |
|--------|----------------|
| `jobs.py` | Job management (create, list, delete, rename) |
| `transcripts.py` | Transcription workflow, transcript CRUD |
| `summaries.py` | Summary generation and management |
| `speakers.py` | Speaker name management, AI identification |
| `exports.py` | Synchronous export generation (PDF, Markdown) |
| `export_jobs.py` | Asynchronous export job management |
| `health.py` | Health checks and system status |

#### Service Layer (`services/`)

Business logic with dependency injection:

| Service | Purpose |
|---------|---------|
| `transcription_service.py` | faster-whisper model management and transcription |
| `diarization_service.py` | PyAnnote pipeline and speaker diarization |
| `alignment_service.py` | Align transcription with diarization data |
| `summary_service.py` | LLM integration for summarization |
| `speaker_service.py` | Speaker name management and persistence |
| `export_service.py` | PDF and Markdown generation |
| `audio_service.py` | Audio file processing and validation |
| `cleanup_service.py` | Background job cleanup scheduler |

#### Repository Layer (`repositories/`)

Data access abstraction:

| Repository | Database Operations |
|-----------|---------------------|
| `job_repository.py` | Jobs table CRUD, workflow state management |
| `export_repository.py` | Export jobs table operations |

#### Utilities Layer (`utils/`)

Shared utilities:

| Utility | Purpose |
|---------|---------|
| `file_utils.py` | File operations, path handling |
| `formatters.py` | Data formatting and transformation |
| `pdf_generator.py` | ReportLab PDF generation |
| `markdown_generator.py` | Markdown document generation |

### Core Modules

| Module | Purpose |
|--------|---------|
| `config.py` | Pydantic Settings for configuration management |
| `dependencies.py` | Dependency injection setup (HTTP client, settings) |
| `database.py` | PostgreSQL connection pooling and queries |
| `models.py` | Pydantic request/response models |
| `security.py` | Input validation and sanitization |
| `main.py` | FastAPI application entry point |

## Design Patterns

### Repository Pattern

All database operations go through repository classes, providing:
- **Abstraction**: Business logic doesn't know about SQL
- **Testability**: Easy to mock repositories in tests
- **Maintainability**: Database changes isolated to repository layer

```python
# Example: Service uses repository
class TranscriptionService:
    def __init__(self, settings: Settings, job_repo: JobRepository):
        self.job_repo = job_repo

    async def transcribe(self, job_uuid: str):
        job = await self.job_repo.get_job(job_uuid)
        # ... transcription logic
        await self.job_repo.save_transcription_data(job_uuid, data)
```

### Service Layer Pattern

Business logic is encapsulated in service classes:
- **Single Responsibility**: Each service has one domain
- **Dependency Injection**: Services receive dependencies via constructor
- **Reusability**: Services can be used by multiple API endpoints

### Dependency Injection

Configuration and shared resources are injected:
- `get_settings()`: Cached settings instance
- `get_http_client()`: Shared async HTTP client for LLM calls
- Repository instances passed to services

### Modern Lifespan Management

Uses FastAPI's `@asynccontextmanager` pattern (replaces deprecated `@app.on_event`):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_database()
    await init_http_client()
    cleanup_service.start_scheduler()

    yield

    # Shutdown
    await cleanup_service.stop_scheduler()
    await close_http_client()
    await close_database()
```

## Frontend Architecture

### Component Structure

```
src/
├── components/
│   ├── Common/              # Shared components
│   ├── Upload/              # Audio upload and recent jobs
│   ├── Transcript/          # Transcript display and editing
│   └── Summary/             # Summary display
├── hooks/                   # Custom React hooks
├── services/                # API client
└── App.jsx                  # Main application
```

### State Management

- **React Hooks**: `useState`, `useEffect`, `useCallback`
- **Local Storage**: User preferences, speaker mappings
- **Component State**: Transcription data, UI state
- **No Redux**: Simple hook-based state management

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | FastAPI, Python 3.10+, Uvicorn, Pydantic Settings |
| **Architecture** | Layered architecture with Repository and Service patterns |
| **Frontend** | React 19, Vite, Lucide Icons, jsPDF |
| **Reverse Proxy** | Nginx with SSL/TLS (self-signed certs included) |
| **ML Models** | faster-whisper with CTranslate2 (4x speedup), PyAnnote.audio 3.1 |
| **Database** | PostgreSQL 16 with asyncpg |
| **Containerization** | Docker, Docker Compose, NVIDIA Container Toolkit |
| **PDF Generation** | ReportLab, svglib |

## Data Flow

### Audio Processing Pipeline

```
1. Upload/Record
   ↓
2. Audio Validation (format, size)
   ↓
3. Store in Docker volume (audiofiles)
   ↓
4. Create job in PostgreSQL
   ↓
5. faster-whisper Transcription (CTranslate2)
   ↓
6. PyAnnote Diarization
   ↓
7. Alignment (merge transcription + diarization)
   ↓
8. Store transcript in PostgreSQL
   ↓
9. [Optional] LLM Summarization
   ↓
10. [Optional] Export to PDF/Markdown
```

### Database Schema

#### Jobs Table
- `id`: UUID primary key
- `file_name`: Original filename
- `file_path`: Path to audio file
- `file_hash`: SHA256 hash for deduplication
- `status`: Job status (pending, processing, completed, failed)
- `workflow_state`: Current workflow step
- `created_at`, `updated_at`: Timestamps

#### Export Jobs Table
- `id`: UUID primary key
- `job_id`: Foreign key to jobs table
- `export_type`: Type of export (pdf_summary, markdown_summary, etc.)
- `status`: Export status
- `file_path`: Path to generated export
- `created_at`, `updated_at`: Timestamps

## Storage

### Docker Volumes

All runtime data is stored in Docker volumes (not local directories):

| Volume | Purpose | Mounted At |
|--------|---------|------------|
| `meetmemo_audiofiles` | Uploaded audio files | `/app/audiofiles` |
| `meetmemo_transcripts` | Generated transcriptions | `/app/transcripts` |
| `meetmemo_summary` | AI summaries | `/app/summary` |
| `meetmemo_exports` | PDF/Markdown exports | `/app/exports` |
| `meetmemo_logs` | Application logs | `/app/logs` |
| `meetmemo_whisper_cache` | Legacy cache (unused) | `/root/.cache/whisper` |
| `meetmemo_huggingface_cache` | Whisper + PyAnnote models | `/root/.cache/huggingface` |
| `meetmemo_torch_cache` | PyTorch cache | `/root/.cache/torch` |
| `meetmemo_postgres_data` | PostgreSQL data | `/var/lib/postgresql/data` |

## Security Considerations

- **Input Validation**: All user inputs sanitized (filenames, UUIDs, speaker names)
- **SQL Injection Protection**: Parameterized queries via asyncpg
- **File Deduplication**: SHA256 hash prevents duplicate uploads
- **HTTPS**: SSL/TLS for production deployments
- **Local Processing**: Audio never leaves your server (except for LLM summarization)
- **Docker Isolation**: Services run in isolated containers

## Performance Optimizations

- **Connection Pooling**: PostgreSQL connection pool (5-20 connections)
- **Async I/O**: All I/O operations use async/await
- **Model Caching**: ML models loaded once at startup
- **HTTP Client Reuse**: Single shared HTTP client for LLM calls
- **Background Cleanup**: Scheduled cleanup of old jobs and exports
- **GPU Acceleration**: CUDA support with CTranslate2 optimization (4x faster than openai-whisper)
- **Quantization**: Configurable FP16/INT8 precision for memory/speed trade-offs

## Scalability Considerations

Current limitations and future improvements:

| Aspect | Current | Future Improvement |
|--------|---------|-------------------|
| **Concurrency** | Single GPU, sequential processing | Task queue (Celery/RQ) for parallel jobs |
| **Storage** | Local Docker volumes | Object storage (S3, MinIO) |
| **Database** | Single PostgreSQL instance | Read replicas, connection pooling |
| **Frontend** | Single-page app | CDN for static assets |
| **ML Models** | Loaded at startup | Model server (Triton, TorchServe) |
