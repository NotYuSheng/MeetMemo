# Backend API Design Issues & Recommendations

This document summarizes critical issues found in the MeetMemo backend API and provides prioritized recommendations for improvements.

---

## 🔴 Critical Security Issues (Fix Immediately)

### 1. CORS Configuration Vulnerability
**Location:** [main.py:42-48](main.py#L42-L48)

**Issue:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ⚠️ DANGEROUS
    allow_credentials=True,  # ⚠️ WITH CREDENTIALS!
)
```

**Risk:** ANY website can make authenticated requests to your API, leading to CSRF attacks.

**Fix:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Development
        "https://yourdomain.com"   # Production
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)
```

---

### 2. Path Traversal Vulnerability
**Location:** [main.py:1465](main.py#L1465), [main.py:289](main.py#L289)

**Issue:** Filenames are not sanitized, allowing path traversal attacks.

**Attack Example:**
```bash
curl -X PATCH '/jobs/123/rename?new_name=../../etc/passwd'
```

**Fix:**
```python
import re
from pathlib import Path

def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal."""
    # Remove any path components
    filename = Path(filename).name
    # Remove dangerous characters
    filename = re.sub(r'[^\w\s\-.]', '', filename)
    # Limit length
    return filename[:255]

@app.patch("/jobs/{uuid}/rename")
def rename_job(uuid: str, request: RenameRequest) -> dict:
    safe_name = sanitize_filename(request.new_name)
    # ... rest of implementation
```

---

### 3. No Authentication/Authorization
**Location:** All endpoints

**Issue:** Anyone can access, modify, or delete any meeting transcription.

**Recommendation:**
```python
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends, HTTPException

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token."""
    token = credentials.credentials
    # Implement token verification logic
    if not is_valid_token(token):
        raise HTTPException(status_code=401, detail="Invalid authentication")
    return get_user_from_token(token)

@app.get("/jobs")
def get_jobs(user = Depends(verify_token)) -> dict:
    # Only return jobs for authenticated user
    pass
```

---

### 4. CSV Race Conditions
**Location:** [main.py:298-334](main.py#L298-L334), [main.py:1175-1189](main.py#L1175-L1189)

**Issue:** CSV lock protects individual operations but not atomic sequences.

**Example Race Condition:**
```python
# Thread 1: Delete operation
with CSV_LOCK:
    rows = read_csv()  # Reads state A
    # ... Lock released

# Thread 2: Add operation (executes here)
with CSV_LOCK:
    rows = read_csv()  # Reads state A
    rows.append(new_job)
    write_csv(rows)  # Writes state B

# Thread 1 continues:
with CSV_LOCK:
    rows.remove(deleted_row)  # Working on stale state A!
    write_csv(rows)  # Overwrites state B, losing Thread 2's work!
```

**Fix:** Use SQLite database:
```python
import sqlite3
from contextlib import contextmanager

@contextmanager
def get_db():
    conn = sqlite3.connect('meetmemo.db')
    try:
        yield conn
        conn.commit()
    except:
        conn.rollback()
        raise
    finally:
        conn.close()

def add_job(uuid: str, file_name: str, status_code: str):
    with get_db() as db:
        db.execute(
            "INSERT INTO jobs (uuid, file_name, status_code) VALUES (?, ?, ?)",
            (uuid, file_name, status_code)
        )
```

---

### 5. Sensitive Data in Logs
**Location:** [main.py:1322](main.py#L1322), [main.py:1447](main.py#L1447)

**Issue:** Full transcripts and summaries logged to disk.

**Risk:** Meeting content with sensitive business information exposed in log files.

**Fix:**
```python
# BAD:
logging.info(f"{timestamp}: Retrieved transcript: {full_transcript}")

# GOOD:
logging.info(f"{timestamp}: Retrieved transcript for UUID: {uuid}, size: {len(full_transcript)} chars")
```

---

## 🟡 High Priority Design Issues

### 6. Inconsistent HTTP Status Codes
**Location:** Multiple endpoints

**Issue:** Endpoints return error objects with HTTP 200 instead of proper error codes.

**Bad Examples:**
```python
# Returns HTTP 200 with error message - WRONG
return {"error": "UUID not found", "status_code": "404"}

# Returns HTTP 200 with error message - WRONG
return {"error": f"Transcript not found for UUID: {uuid}"}
```

**Fix:**
```python
# Correct approach - use HTTPException
from fastapi import HTTPException

@app.get("/jobs/{uuid}/filename")
def get_file_name(uuid: str) -> dict:
    file_name = find_file_name(uuid)
    if not file_name:
        raise HTTPException(status_code=404, detail=f"UUID {uuid} not found")
    return {"uuid": uuid, "file_name": file_name}
```

---

### 7. Inconsistent Response Formats
**Location:** All endpoints

**Issue:** Mix of camelCase and snake_case, inconsistent field names.

**Examples:**
```python
# Some endpoints use camelCase:
{"fileName": "meeting.wav"}

# Others use snake_case:
{"file_name": "meeting.wav"}

# Some include redundant status codes:
{"status_code": "200", "status": "success"}

# Others don't:
{"status": "success", "new_name": "renamed.wav"}
```

**Fix - Create Standard Response Models:**
```python
from pydantic import BaseModel, Field

class SuccessResponse(BaseModel):
    """Standard success response."""
    success: bool = True
    data: dict
    message: str | None = None

class ErrorResponse(BaseModel):
    """Standard error response."""
    success: bool = False
    error: str
    detail: str | None = None

class JobResponse(BaseModel):
    """Job resource response."""
    uuid: str
    file_name: str = Field(alias="fileName")  # Auto-convert to camelCase
    status_code: int = Field(alias="statusCode")

    class Config:
        populate_by_name = True

@app.get("/jobs/{uuid}/filename", response_model=JobResponse)
def get_file_name(uuid: str) -> JobResponse:
    # FastAPI automatically converts to camelCase in JSON response
    return JobResponse(uuid=uuid, file_name="meeting.wav", status_code=200)
```

---

### 8. Non-RESTful Endpoint Design
**Location:** [main.py:1383](main.py#L1383), [main.py:1751](main.py#L1751), [main.py:1795](main.py#L1795)

**Issues:**

#### Issue A: Summarize Uses POST Instead of GET
```python
# Current (WRONG - POST for retrieval):
POST /jobs/{uuid}/summarise

# Should be:
GET /jobs/{uuid}/summary  # Retrieve cached summary
POST /jobs/{uuid}/summary?regenerate=true  # Force regeneration
```

#### Issue B: Export Endpoints Use POST
```python
# Current (WRONG):
POST /jobs/{uuid}/pdf
POST /jobs/{uuid}/markdown

# Should be (read-only operations):
GET /jobs/{uuid}/exports/pdf
GET /jobs/{uuid}/exports/markdown
```

#### Issue C: Action Verbs in URLs
```python
# Current (WRONG - verbs in URL):
PATCH /jobs/{uuid}/rename?new_name=foo
POST /jobs/{uuid}/identify-speakers

# Should be (resources, not actions):
PATCH /jobs/{uuid}  # With body: {"file_name": "foo"}
POST /jobs/{uuid}/speaker-identifications  # Creates identification resource
```

**Recommended REST-Compliant Structure:**
```python
# Jobs
GET    /api/v1/jobs                    # List all jobs
POST   /api/v1/jobs                    # Create new job (upload audio)
GET    /api/v1/jobs/{uuid}             # Get job details
PATCH  /api/v1/jobs/{uuid}             # Update job (rename, etc.)
DELETE /api/v1/jobs/{uuid}             # Delete job

# Transcripts (sub-resource of jobs)
GET    /api/v1/jobs/{uuid}/transcript  # Get transcript
PATCH  /api/v1/jobs/{uuid}/transcript  # Update transcript

# Summaries (sub-resource of jobs)
GET    /api/v1/jobs/{uuid}/summary     # Get cached summary
POST   /api/v1/jobs/{uuid}/summary     # Generate new summary
DELETE /api/v1/jobs/{uuid}/summary     # Delete cached summary

# Speakers (sub-resource of jobs)
PATCH  /api/v1/jobs/{uuid}/speakers    # Update speaker mappings
POST   /api/v1/jobs/{uuid}/speaker-identifications  # Request AI identification

# Exports (sub-resource of jobs)
GET    /api/v1/jobs/{uuid}/exports/pdf       # Export as PDF
GET    /api/v1/jobs/{uuid}/exports/markdown  # Export as Markdown
GET    /api/v1/jobs/{uuid}/exports/json      # Export as JSON
```

---

### 9. Wrong PATCH Usage
**Location:** [main.py:1465](main.py#L1465), [main.py:1518](main.py#L1518)

**Issue:** PATCH should accept request body, not query parameters.

**Current (WRONG):**
```python
@app.patch("/jobs/{uuid}/rename")
def rename_job(uuid: str, new_name: str) -> dict:  # Query param
    pass
```

**Fixed:**
```python
class UpdateJobRequest(BaseModel):
    file_name: str | None = None
    # Add other updatable fields here

@app.patch("/jobs/{uuid}")
def update_job(uuid: str, request: UpdateJobRequest) -> dict:
    if request.file_name:
        # Update filename
        pass
    return {"uuid": uuid, "file_name": request.file_name}
```

---

### 10. Missing Input Validation
**Location:** Throughout the codebase

**Issues:**
- No UUID format validation
- No filename validation
- No file size limits
- No content type validation

**Fix:**
```python
from pydantic import BaseModel, validator, Field
import uuid as uuid_lib

class JobIdParams(BaseModel):
    uuid: str

    @validator('uuid')
    def validate_uuid(cls, v):
        try:
            uuid_lib.UUID(v)  # Validate UUID format
        except ValueError:
            raise ValueError('Invalid UUID format')
        return v

class RenameRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=255)

    @validator('file_name')
    def validate_filename(cls, v):
        if '..' in v or '/' in v or '\\' in v:
            raise ValueError('Invalid filename: path traversal detected')
        if not re.match(r'^[\w\s\-\.]+$', v):
            raise ValueError('Invalid filename: contains illegal characters')
        return v

@app.post("/jobs", response_model=JobResponse)
async def transcribe(
    file: UploadFile,
    model_name: str = "turbo"
) -> dict:
    # Validate file size
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    file_size = 0
    chunks = []

    async for chunk in file.file:
        file_size += len(chunk)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size: {MAX_FILE_SIZE} bytes"
            )
        chunks.append(chunk)

    # Validate content type
    allowed_types = ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a']
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: {file.content_type}"
        )

    # Process file...
```

---

## 🟢 Performance Issues

### 11. Synchronous LLM Calls Block Server
**Location:** [main.py:480](main.py#L480), [main.py:555](main.py#L555)

**Issue:** `requests.post()` blocks the entire FastAPI event loop.

**Impact:** During a 30-second LLM call, ALL other API requests are blocked.

**Fix:**
```python
import httpx

# Create async client at module level
http_client = httpx.AsyncClient(timeout=60.0)

async def summarise_transcript(
    transcript: str,
    custom_prompt: str = None,
    system_prompt: str = None
) -> str:
    """Async LLM summarization."""
    base_url = str(os.getenv("LLM_API_URL"))
    url = f"{base_url.rstrip('/')}/v1/chat/completions"

    payload = {
        "model": os.getenv("LLM_MODEL_NAME"),
        "temperature": 0.3,
        "max_tokens": 5000,
        "messages": [
            {"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT},
            {"role": "user", "content": custom_prompt or DEFAULT_USER_PROMPT + transcript},
        ],
    }

    headers = {"Content-Type": "application/json"}
    api_key = os.getenv("LLM_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = await http_client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"LLM service error: {e}")

@app.post("/jobs/{uuid}/summary")
async def summarise_job(uuid: str, request: SummarizeRequest = None) -> dict:
    # Now async and won't block other requests
    summary = await summarise_transcript(formatted_transcript, ...)
    return {"summary": summary}
```

---

### 12. Model Loaded on Every Request
**Location:** [main.py:1113](main.py#L1113)

**Issue:**
```python
@app.post("/jobs")
def transcribe(file: UploadFile, model_name: str = "turbo") -> dict:
    model = whisper.load_model(model_name)  # ⚠️ Loads 1.5GB model EVERY REQUEST
    device = DEVICE
    model = model.to(device)
    # ...
```

**Impact:** Each upload takes extra 30+ seconds just loading the model.

**Fix:**
```python
# Load models at startup
from functools import lru_cache

@lru_cache(maxsize=2)
def get_whisper_model(model_name: str):
    """Cache loaded Whisper models."""
    model = whisper.load_model(model_name)
    model = model.to(DEVICE)
    return model

@app.on_event("startup")
async def startup_event():
    """Preload models at startup."""
    logger.info("Preloading Whisper model...")
    get_whisper_model("turbo")
    logger.info("Whisper model loaded successfully")

@app.post("/jobs")
def transcribe(file: UploadFile, model_name: str = "turbo") -> dict:
    model = get_whisper_model(model_name)  # Instant retrieval from cache
    # ...
```

---

### 13. CSV File Performance
**Location:** [main.py:298-334](main.py#L298-L334)

**Issue:** Every job creation reads, sorts, and rewrites entire CSV file - O(n) complexity.

**Impact:** With 1000 jobs, each new upload becomes noticeably slow.

**Fix:** Replace CSV with SQLite:
```python
# migrations/001_create_tables.sql
CREATE TABLE jobs (
    uuid TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_status ON jobs(status_code);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);

# database.py
import sqlite3
from contextlib import contextmanager
from typing import Generator

DATABASE_PATH = "meetmemo.db"

@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Get database connection with automatic commit/rollback."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row  # Return dict-like rows
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def add_job(uuid: str, file_name: str, status_code: int) -> None:
    """Add new job - O(1) complexity."""
    with get_db() as db:
        db.execute(
            "INSERT INTO jobs (uuid, file_name, status_code) VALUES (?, ?, ?)",
            (uuid, file_name, status_code)
        )

def update_status(uuid: str, new_status: int) -> None:
    """Update job status - O(1) complexity with index."""
    with get_db() as db:
        db.execute(
            "UPDATE jobs SET status_code = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?",
            (new_status, uuid)
        )

def get_all_jobs() -> list[dict]:
    """Get all jobs - efficient with proper indexing."""
    with get_db() as db:
        cursor = db.execute(
            "SELECT uuid, file_name, status_code FROM jobs ORDER BY created_at DESC"
        )
        return [dict(row) for row in cursor.fetchall()]
```

---

### 14. No Caching for Transcripts
**Location:** [main.py:1307](main.py#L1307)

**Issue:** Every request reads transcript from disk, even when accessed repeatedly.

**Fix:** Add Redis caching:
```python
import redis
import json
from functools import wraps

redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

def cache_transcript(expire_seconds=3600):
    """Cache transcript for 1 hour."""
    def decorator(func):
        @wraps(func)
        async def wrapper(uuid: str):
            cache_key = f"transcript:{uuid}"

            # Try to get from cache
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)

            # Get from source
            result = await func(uuid)

            # Store in cache
            redis_client.setex(
                cache_key,
                expire_seconds,
                json.dumps(result)
            )

            return result
        return wrapper
    return decorator

@cache_transcript(expire_seconds=3600)
async def get_file_transcript(uuid: str) -> dict:
    # ... existing implementation
    pass
```

---

### 15. Missing Pagination
**Location:** [main.py:1049](main.py#L1049)

**Issue:** `GET /jobs` returns all jobs without limits.

**Fix:**
```python
from fastapi import Query

class PaginationParams(BaseModel):
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=100)

class PaginatedResponse(BaseModel):
    items: list
    total: int
    skip: int
    limit: int
    has_more: bool

@app.get("/jobs", response_model=PaginatedResponse)
def get_jobs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100)
) -> PaginatedResponse:
    """Get paginated list of jobs."""
    with get_db() as db:
        # Get total count
        total = db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]

        # Get paginated items
        cursor = db.execute(
            "SELECT uuid, file_name, status_code FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, skip)
        )
        items = [dict(row) for row in cursor.fetchall()]

        return PaginatedResponse(
            items=items,
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + limit) < total
        )
```

---

## 🔵 Code Quality Issues

### 16. Monolithic Structure
**Location:** [main.py](main.py) - 1861 lines

**Issue:** Everything in one file - routes, business logic, PDF generation, utilities.

**Recommended Structure:**
```
backend/
├── main.py                    # App initialization only
├── config.py                  # Configuration and environment
├── database.py                # Database connection and queries
├── dependencies.py            # FastAPI dependencies (auth, etc.)
├── models/
│   ├── __init__.py
│   ├── job.py                # Job Pydantic models
│   ├── transcript.py         # Transcript models
│   └── summary.py            # Summary models
├── routes/
│   ├── __init__.py
│   ├── jobs.py               # Job endpoints
│   ├── transcripts.py        # Transcript endpoints
│   ├── summaries.py          # Summary endpoints
│   └── exports.py            # Export endpoints
├── services/
│   ├── __init__.py
│   ├── transcription.py      # Whisper transcription logic
│   ├── diarization.py        # Speaker diarization
│   ├── summarization.py      # LLM summarization
│   ├── speaker_id.py         # Speaker identification
│   └── export.py             # PDF/Markdown generation
└── utils/
    ├── __init__.py
    ├── files.py              # File handling utilities
    ├── formatting.py         # Text formatting
    └── security.py           # Security utilities
```

**Example Refactor:**
```python
# main.py
from fastapi import FastAPI
from routes import jobs, transcripts, summaries, exports
from services.transcription import initialize_models

app = FastAPI(title="MeetMemo API", version="1.0.0")

# Include routers
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
app.include_router(transcripts.router, prefix="/api/v1/jobs", tags=["transcripts"])
app.include_router(summaries.router, prefix="/api/v1/jobs", tags=["summaries"])
app.include_router(exports.router, prefix="/api/v1/jobs", tags=["exports"])

@app.on_event("startup")
async def startup():
    """Initialize services on startup."""
    await initialize_models()

# routes/jobs.py
from fastapi import APIRouter, Depends
from services.transcription import transcribe_audio
from models.job import JobResponse, CreateJobRequest

router = APIRouter()

@router.post("", response_model=JobResponse, status_code=201)
async def create_job(
    request: CreateJobRequest,
    user = Depends(get_current_user)
) -> JobResponse:
    """Upload and transcribe audio file."""
    return await transcribe_audio(request.file, request.model_name, user.id)
```

---

### 17. No API Versioning
**Location:** All routes

**Issue:** No version prefix means breaking changes impossible to deploy safely.

**Fix:**
```python
# Add version prefix to all routes
app.include_router(jobs.router, prefix="/api/v1/jobs")

# When you need to make breaking changes:
app.include_router(jobs_v2.router, prefix="/api/v2/jobs")

# Clients can migrate gradually:
# Old clients: POST /api/v1/jobs
# New clients: POST /api/v2/jobs
```

---

### 18. Weak Type Hints
**Location:** Throughout

**Issue:** Functions return generic `dict` instead of typed models.

**Fix:**
```python
# Bad:
def get_file_name(uuid: str) -> dict:
    return {"uuid": uuid, "file_name": "test.wav"}

# Good:
from pydantic import BaseModel

class FileNameResponse(BaseModel):
    uuid: str
    file_name: str

def get_file_name(uuid: str) -> FileNameResponse:
    return FileNameResponse(uuid=uuid, file_name="test.wav")

# Best (with FastAPI):
@app.get("/jobs/{uuid}/filename", response_model=FileNameResponse)
def get_file_name(uuid: str) -> FileNameResponse:
    # FastAPI validates response matches model
    return FileNameResponse(uuid=uuid, file_name="test.wav")
```

---

## 📋 Implementation Priority

### Phase 1: Security (Week 1)
1. ✅ Fix CORS configuration
2. ✅ Add input sanitization for filenames
3. ✅ Remove sensitive data from logs
4. ✅ Add request size limits
5. ✅ Implement basic authentication

### Phase 2: Stability (Week 2)
6. ✅ Replace CSV with SQLite
7. ✅ Fix HTTP status codes
8. ✅ Standardize error responses
9. ✅ Add comprehensive input validation
10. ✅ Fix race conditions

### Phase 3: Performance (Week 3)
11. ✅ Make endpoints async
12. ✅ Preload Whisper model at startup
13. ✅ Add Redis caching for transcripts
14. ✅ Add pagination to list endpoints
15. ✅ Optimize file cleanup process

### Phase 4: API Design (Week 4)
16. ✅ Restructure RESTful endpoints
17. ✅ Add API versioning
18. ✅ Create Pydantic response models
19. ✅ Update API documentation
20. ✅ Add comprehensive tests

### Phase 5: Code Quality (Week 5)
21. ✅ Refactor into modular structure
22. ✅ Extract constants and configuration
23. ✅ Add type hints everywhere
24. ✅ Improve health check endpoint
25. ✅ Add rate limiting

---

## 🧪 Testing Recommendations

Add comprehensive tests for:

```python
# tests/test_security.py
def test_path_traversal_protection():
    """Ensure filenames with .. are rejected."""
    response = client.patch(f"/jobs/{uuid}/rename", json={"file_name": "../../etc/passwd"})
    assert response.status_code == 400

def test_file_size_limit():
    """Ensure files over limit are rejected."""
    large_file = generate_large_audio(200_000_000)  # 200MB
    response = client.post("/jobs", files={"file": large_file})
    assert response.status_code == 413

# tests/test_race_conditions.py
def test_concurrent_job_creation():
    """Ensure concurrent creates don't corrupt data."""
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(create_job) for _ in range(100)]
        results = [f.result() for f in futures]

    # Verify all jobs created successfully
    assert len(results) == 100
    assert len(set(r['uuid'] for r in results)) == 100  # All unique UUIDs

# tests/test_api_design.py
def test_error_response_format():
    """Ensure consistent error format."""
    response = client.get("/jobs/nonexistent-uuid/transcript")
    assert response.status_code == 404
    assert "detail" in response.json()
```

---

## 📚 Additional Resources

- [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices)
- [REST API Design Guidelines](https://restfulapi.net/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Python API Checklist](https://devchecklists.com/api-checklist/)

---

## Summary

The current API has **18 critical issues** across security, design, performance, and code quality. The most urgent fixes are:

1. **Fix CORS wildcard** (Security vulnerability)
2. **Sanitize file paths** (Security vulnerability)
3. **Add authentication** (Security vulnerability)
4. **Replace CSV with database** (Stability and performance)
5. **Fix HTTP status codes** (API correctness)
6. **Make operations async** (Performance)
7. **Restructure REST endpoints** (API design)

These improvements will make the API more secure, scalable, maintainable, and aligned with industry best practices.
