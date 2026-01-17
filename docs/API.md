# API Reference

Complete API documentation for MeetMemo v2.0.

Base URL: `/api/v1`

## Health

### GET /health

Health check and system status.

**Response:**
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "database": "connected",
  "gpu_available": true
}
```

## Jobs

### GET /jobs

List all transcription jobs.

**Query Parameters:**
- `limit` (integer, optional): Max results (default: 50)
- `offset` (integer, optional): Pagination offset (default: 0)

**Response:**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "file_name": "meeting.wav",
      "status": "completed",
      "created_at": "2026-01-17T12:00:00Z"
    }
  ],
  "total": 10
}
```

### POST /jobs

Create a new job by uploading audio.

**Request:**
- Multipart form data
- Field: `file` (audio file)

**Response:**
```json
{
  "id": "uuid",
  "file_name": "meeting.wav",
  "status": "pending"
}
```

### GET /jobs/{uuid}

Get job details and status.

**Response:**
```json
{
  "id": "uuid",
  "file_name": "meeting.wav",
  "status": "completed",
  "workflow_state": "transcript_ready",
  "created_at": "2026-01-17T12:00:00Z",
  "updated_at": "2026-01-17T12:05:00Z"
}
```

### PATCH /jobs/{uuid}

Rename a job.

**Request:**
```json
{
  "file_name": "new_name.wav"
}
```

### DELETE /jobs/{uuid}

Delete a job and all associated data.

## Transcription Workflow

### POST /jobs/{uuid}/transcriptions

Start Whisper transcription.

**Response:**
```json
{
  "status": "processing",
  "message": "Transcription started"
}
```

### GET /jobs/{uuid}/transcriptions

Get raw transcription data (Whisper output).

### POST /jobs/{uuid}/diarizations

Start PyAnnote speaker diarization.

### GET /jobs/{uuid}/diarizations

Get diarization data (speaker segments).

### POST /jobs/{uuid}/alignments

Align transcription with diarization to create final transcript.

## Transcript

### GET /jobs/{uuid}/transcript

Get the aligned transcript with speaker labels.

**Response:**
```json
{
  "segments": [
    {
      "speaker": "SPEAKER_00",
      "text": "Hello everyone",
      "start": 0.0,
      "end": 2.5
    }
  ]
}
```

### PATCH /jobs/{uuid}/transcript

Update transcript content (manual edits).

## Summary

### GET /jobs/{uuid}/summary

Get or generate summary. If not cached, generates new summary.

**Query Parameters:**
- `custom_prompt` (string, optional): Custom summarization prompt

### POST /jobs/{uuid}/summary

Generate summary with custom prompt.

**Request:**
```json
{
  "custom_prompt": "Summarize focusing on action items"
}
```

### PATCH /jobs/{uuid}/summary

Update cached summary.

### DELETE /jobs/{uuid}/summary

Delete cached summary (will be regenerated on next GET).

## Speakers

### PATCH /jobs/{uuid}/speakers

Update speaker names.

**Request:**
```json
{
  "speaker_names": {
    "SPEAKER_00": "John",
    "SPEAKER_01": "Jane"
  }
}
```

### POST /jobs/{uuid}/speaker-identifications

AI-powered speaker name suggestions based on transcript context.

**Response:**
```json
{
  "suggestions": {
    "SPEAKER_00": ["John", "Michael"],
    "SPEAKER_01": ["Jane", "Sarah"]
  }
}
```

## Exports (Synchronous)

> **Note:** Export endpoints use POST requests (not GET) to support optional request body parameters like `generated_on` timestamp. This is a breaking change from v1.0 which used GET requests.

### POST /jobs/{uuid}/exports/pdf

Download summary as PDF (summary + transcript).

**Request (optional):**
```json
{
  "generated_on": "2026-01-17 14:30:00"
}
```

**Response:** PDF file download

### POST /jobs/{uuid}/exports/markdown

Download summary as Markdown (summary + transcript).

**Request (optional):**
```json
{
  "generated_on": "2026-01-17 14:30:00"
}
```

**Response:** Markdown file download

### POST /jobs/{uuid}/exports/transcript/pdf

Download transcript-only PDF (no AI summary).

**Request (optional):**
```json
{
  "generated_on": "2026-01-17 14:30:00"
}
```

**Response:** PDF file download

### POST /jobs/{uuid}/exports/transcript/markdown

Download transcript-only Markdown (no AI summary).

**Request (optional):**
```json
{
  "generated_on": "2026-01-17 14:30:00"
}
```

**Response:** Markdown file download

## Export Jobs (Asynchronous)

### POST /jobs/{uuid}/exports

Create async export job for large files.

**Request:**
```json
{
  "export_type": "pdf_summary",
  "options": {}
}
```

**Export Types:**
- `pdf_summary`
- `markdown_summary`
- `pdf_transcript`
- `markdown_transcript`

**Response:**
```json
{
  "export_id": "export-uuid",
  "status": "pending"
}
```

### GET /jobs/{uuid}/exports/{export_uuid}

Get export job status.

**Response:**
```json
{
  "id": "export-uuid",
  "status": "completed",
  "progress": 100,
  "file_path": "/exports/file.pdf"
}
```

### GET /jobs/{uuid}/exports/{export_uuid}/download

Download completed export.

### DELETE /jobs/{uuid}/exports/{export_uuid}

Delete export job and file.

## Error Responses

All endpoints return standard error responses:

**400 Bad Request:**
```json
{
  "detail": "Invalid input"
}
```

**404 Not Found:**
```json
{
  "detail": "Job not found"
}
```

**500 Internal Server Error:**
```json
{
  "detail": "Internal server error",
  "error": "Error details"
}
```

## Rate Limiting

Currently no rate limiting is implemented. For production deployments, consider adding nginx rate limiting.

## Authentication

Currently no authentication is required. For multi-user deployments, add an authentication layer via nginx or FastAPI middleware.
