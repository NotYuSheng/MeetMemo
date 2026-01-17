# Development Guide

Guide for developers contributing to MeetMemo.

## Quick Start

```bash
# Clone repository
git clone https://github.com/NotYuSheng/MeetMemo.git
cd MeetMemo

# Set up environment
cp example.env .env
# Edit .env with your credentials

# Start with Docker (recommended)
docker compose up -d

# Access application
open https://localhost
```

## Development Setup

### Frontend Development

```bash
cd frontend
npm install
npm start          # Starts dev server with HTTPS on port 3000
```

**Tech Stack:**
- React 19 with Vite
- Lucide Icons
- jsPDF for client-side PDF generation

**Key Files:**
- `src/App.jsx` - Main application component
- `src/services/api.js` - API client
- `src/hooks/useTranscriptPolling.js` - Real-time job status polling

### Backend Development

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py     # Starts FastAPI server on port 8000
```

**Tech Stack:**
- FastAPI + Uvicorn
- OpenAI Whisper (turbo model)
- PyAnnote.audio 3.1
- PostgreSQL with asyncpg
- Pydantic Settings

**Project Structure:**
```
backend/
├── api/v1/              # REST endpoints by domain
├── services/            # Business logic layer
├── repositories/        # Data access layer
├── utils/               # Shared utilities
├── config.py            # Configuration management
├── dependencies.py      # Dependency injection
├── database.py          # Database operations
├── models.py            # Pydantic models
└── main.py              # Application entry point
```

## Architecture Overview

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

**Key Design Patterns:**
- **Layered Architecture**: API → Service → Repository → Database
- **Repository Pattern**: Database abstraction
- **Service Layer**: Business logic isolation
- **Dependency Injection**: Configuration and HTTP client management

## Code Quality

### Python (Backend)

```bash
cd backend

# Linting and formatting with Ruff
ruff check .
ruff format .

# Type checking (if mypy configured)
mypy .
```

### JavaScript (Frontend)

```bash
cd frontend

# CSS linting
npm run lint:css
npm run lint:css:fix

# Run tests
npm test
```

## Database

### Migrations

Database schema is initialized automatically from `backend/migrations/001_init_schema.sql`.

### Accessing Database

```bash
# Via Docker
docker exec -it meetmemo-postgres psql -U meetmemo meetmemo

# Run query
docker exec meetmemo-postgres psql -U meetmemo meetmemo -c "SELECT * FROM jobs LIMIT 5;"

# Backup
docker exec meetmemo-postgres pg_dump -U meetmemo meetmemo > backup.sql

# Restore
docker exec -i meetmemo-postgres psql -U meetmemo meetmemo < backup.sql
```

## Testing

### Manual Testing Workflow

1. Upload audio file or record
2. Start transcription
3. Verify speaker diarization
4. Edit speaker names
5. Generate summary
6. Export to PDF/Markdown

### API Testing

```bash
# Health check
curl https://localhost/api/v1/health -k

# Create job (upload audio)
curl -X POST https://localhost/api/v1/jobs \
  -F "file=@audio.wav" -k

# Get job status
curl https://localhost/api/v1/jobs/{uuid} -k

# Start transcription
curl -X POST https://localhost/api/v1/jobs/{uuid}/transcriptions -k
```

## Docker Development

### Rebuild Specific Service

```bash
# Backend only
docker compose build meetmemo-backend
docker compose up -d meetmemo-backend

# Frontend only
docker compose build meetmemo-frontend
docker compose up -d meetmemo-frontend
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f meetmemo-backend
```

### Shell Access

```bash
# Backend container
docker exec -it meetmemo-backend sh

# Run Python commands
docker exec -it meetmemo-backend python -c "import whisper; print(whisper.__version__)"
```

## Adding New Features

### Adding a New API Endpoint

1. **Create endpoint in appropriate router** (`backend/api/v1/`)
2. **Implement business logic in service** (`backend/services/`)
3. **Add database operations in repository** (`backend/repositories/` if needed)
4. **Update Pydantic models** (`backend/models.py`)
5. **Test endpoint** via curl or Postman

Example:
```python
# backend/api/v1/custom.py
from fastapi import APIRouter, Depends
from services.custom_service import CustomService

router = APIRouter()

@router.get("/custom/{job_id}")
async def get_custom_data(job_id: str, service: CustomService = Depends()):
    return await service.process(job_id)
```

### Adding a New Service

1. **Create service file** (`backend/services/my_service.py`)
2. **Implement service class with dependency injection**
3. **Register in** `backend/services/__init__.py`
4. **Use in API endpoints**

Example:
```python
# backend/services/my_service.py
from config import Settings

class MyService:
    def __init__(self, settings: Settings):
        self.settings = settings
    
    async def process(self, data):
        # Business logic here
        return result
```

## Performance Profiling

### Backend Profiling

Use FastAPI's built-in middleware or add custom profiling:

```python
import time
from fastapi import Request

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response
```

### GPU Profiling

```bash
# Monitor GPU usage during transcription
watch -n 1 nvidia-smi
```

## Debugging

### Backend Debugging

Enable debug logs:
```python
# backend/config.py
log_level: str = "DEBUG"
```

### Frontend Debugging

Use browser DevTools:
- Console: Check for errors
- Network tab: Monitor API calls
- React DevTools: Inspect component state

### Database Queries

Log all SQL queries:
```python
# In database.py, add logging
import logging
logging.basicConfig()
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
```

## Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make changes and test**
4. **Commit**: `git commit -m "Add my feature"`
5. **Push**: `git push origin feature/my-feature`
6. **Create Pull Request**

### Commit Message Guidelines

```
<type>: <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

Example:
```
feat: add speaker name suggestions using LLM

Implement AI-powered speaker identification that suggests
possible names based on conversation context.

Closes #123
```

## Release Process

1. Update version in `backend/main.py`
2. Update CHANGELOG
3. Create git tag: `git tag -a v2.1.0 -m "Release v2.1.0"`
4. Push tag: `git push origin v2.1.0`
5. Create GitHub release

## Useful Commands

```bash
# View Docker resource usage
docker stats

# Clean up everything (WARNING: deletes all data)
docker compose down -v

# Rebuild from scratch
docker compose build --no-cache
docker compose up -d

# Export Docker logs
docker compose logs > logs.txt

# Check container health
docker compose ps

# Restart single service
docker compose restart meetmemo-backend
```

## Common Development Issues

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for solutions to common issues.
