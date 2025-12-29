# MeetMemo Backend API Documentation

Base URL: `http://localhost:8000` (or your configured backend URL)

## Table of Contents
- [Health Check](#health-check)
- [Jobs Management](#jobs-management)
- [Transcripts](#transcripts)
- [Summaries](#summaries)
- [Speaker Management](#speaker-management)
- [Export Functions](#export-functions)

---

## Health Check

### GET /health
Check the health status of the backend service.

**Request:**
```http
GET /health
```

**Response (Success):**
```json
{
  "status": "ok",
  "status_code": "200"
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": ["error message 1", "error message 2"],
  "status_code": "500"
}
```

---

## Jobs Management

### GET /jobs
Retrieve a list of all transcription jobs.

**Request:**
```http
GET /jobs
```

**Response:**
```json
{
  "csv_list": {
    "uuid-1": {
      "file_name": "meeting-recording.wav",
      "status_code": "200"
    },
    "uuid-2": {
      "file_name": "interview-audio.wav",
      "status_code": "202"
    }
  }
}
```

**Status Codes:**
- `200`: Completed successfully
- `202`: Processing in progress
- `404`: Does not exist
- `500`: Error occurred

---

### POST /jobs
Upload an audio file for transcription and speaker diarization.

**Request:**
```http
POST /jobs
Content-Type: multipart/form-data

file: [audio file binary]
model_name: "turbo" (optional, default: "turbo")
```

**Supported Audio Formats:**
- WAV
- MP3
- MP4
- M4A
- FLAC
- WebM

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "file_name": "meeting-recording.wav",
  "transcript": [
    {
      "speaker": "SPEAKER_00",
      "text": "Hello everyone, welcome to the meeting.",
      "start": "0.00",
      "end": "3.45"
    },
    {
      "speaker": "SPEAKER_01",
      "text": "Thank you for having me.",
      "start": "3.50",
      "end": "5.20"
    }
  ]
}
```

**Response (Error):**
```json
{
  "detail": "Internal server error during audio processing"
}
```
*HTTP Status: 500*

---

### GET /jobs/{uuid}/status
Get the processing status of a specific job.

**Request:**
```http
GET /jobs/550e8400-e29b-41d4-a716-446655440000/status
```

**Response:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "file_name": "meeting-recording.wav",
  "status_code": "200",
  "status": "completed"
}
```

**Status Values:**
- `completed`: Transcription finished successfully
- `processing`: Currently transcribing audio
- `deleted`: Job has been deleted
- `does not exist`: UUID not found
- `error`: Processing failed

---

### GET /jobs/{uuid}/filename
Retrieve the filename associated with a specific UUID.

**Request:**
```http
GET /jobs/550e8400-e29b-41d4-a716-446655440000/filename
```

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "file_name": "meeting-recording.wav"
}
```

**Response (Not Found):**
```json
{
  "error": "UUID: 550e8400-e29b-41d4-a716-446655440000 not found",
  "status_code": "404",
  "file_name": "404"
}
```

---

### PATCH /jobs/{uuid}/rename
Rename a job file. Handles filename collisions by appending "(Copy)" if needed.

**Request:**
```http
PATCH /jobs/550e8400-e29b-41d4-a716-446655440000/rename?new_name=quarterly-review.wav
```

**Query Parameters:**
- `new_name`: The new filename (required)

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "new_name": "quarterly-review.wav"
}
```

**Response (Not Found):**
```json
{
  "error": "UUID not found",
  "status_code": "404"
}
```

---

### DELETE /jobs/{uuid}
Delete a job and all associated files (audio, transcript, summary).

**Request:**
```http
DELETE /jobs/550e8400-e29b-41d4-a716-446655440000
```

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "message": "Job with UUID 550e8400-e29b-41d4-a716-446655440000 and associated files deleted successfully.",
  "status_code": "204"
}
```

**Response (Not Found):**
```json
{
  "error": "UUID not found",
  "status_code": "404"
}
```

---

## Transcripts

### GET /jobs/{uuid}/transcript
Retrieve the transcript for a specific job. Returns edited version if available, otherwise returns original.

**Request:**
```http
GET /jobs/550e8400-e29b-41d4-a716-446655440000/transcript
```

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "exists",
  "full_transcript": "[{\"speaker\": \"SPEAKER_00\", \"text\": \"Hello everyone\", \"start\": \"0.00\", \"end\": \"2.00\"}]",
  "file_name": "meeting-recording.wav",
  "status_code": "200",
  "is_edited": false
}
```

**Response Fields:**
- `is_edited`: `true` if edited transcript exists, `false` for original

**Response (Not Found):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "not found",
  "status_code": "404"
}
```

---

### PATCH /jobs/{uuid}/transcript
Update the transcript content. Saves to `transcripts/edited/` directory, preserving the original.

**Request:**
```http
PATCH /jobs/550e8400-e29b-41d4-a716-446655440000/transcript
Content-Type: application/json

{
  "transcript": [
    {
      "speaker": "SPEAKER_00",
      "text": "Corrected text here",
      "start": "0.00",
      "end": "3.45"
    },
    {
      "speaker": "SPEAKER_01",
      "text": "Another corrected segment",
      "start": "3.50",
      "end": "5.20"
    }
  ]
}
```

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "message": "Transcript updated successfully.",
  "status_code": "200",
  "file_name": "meeting-recording.wav"
}
```

**Note:** Updating a transcript invalidates any cached summary.

---

## Summaries

### POST /jobs/{uuid}/summarise
Generate an AI summary of the transcript. Returns cached version if available, otherwise generates new summary.

**Request (Default Prompts):**
```http
POST /jobs/550e8400-e29b-41d4-a716-446655440000/summarise
```

**Request (Custom Prompts):**
```http
POST /jobs/550e8400-e29b-41d4-a716-446655440000/summarise
Content-Type: application/json

{
  "custom_prompt": "Please focus on action items and decisions made.",
  "system_prompt": "You are a professional meeting summarizer focused on extracting actionable insights."
}
```

**Request Body (Optional):**
```json
{
  "custom_prompt": "Optional custom user prompt for summarization",
  "system_prompt": "Optional custom system prompt for LLM behavior"
}
```

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "meeting-recording.wav",
  "status": "success",
  "status_code": "200",
  "summary": "# Quarterly Planning Meeting\n\n## Executive Summary\n\nThe team discussed Q3 goals...\n\n## Key Points\n- Budget allocation\n- Timeline adjustments\n\n## Action Items\n1. Review budget by Friday\n2. Update project timeline"
}
```

**Response (Transcript Not Found):**
```json
{
  "error": "Transcript not found for the given UUID: 550e8400-e29b-41d4-a716-446655440000."
}
```

**Response (LLM Error):**
```json
{
  "detail": "Summary service temporarily unavailable. Please try again later."
}
```
*HTTP Status: 503*

---

### DELETE /jobs/{uuid}/summary
Delete the cached summary for a job. Next summarize request will generate a fresh summary.

**Request:**
```http
DELETE /jobs/550e8400-e29b-41d4-a716-446655440000/summary
```

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "meeting-recording.wav",
  "status": "success",
  "message": "Summary deleted successfully",
  "status_code": "200"
}
```

**Response (Not Found):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "meeting-recording.wav",
  "status": "not_found",
  "message": "No cached summary found",
  "status_code": "404"
}
```

---

## Speaker Management

### PATCH /jobs/{uuid}/speakers
Update speaker names in the transcript. Maps generic speaker IDs to custom names.

**Request:**
```http
PATCH /jobs/550e8400-e29b-41d4-a716-446655440000/speakers
Content-Type: application/json

{
  "mapping": {
    "SPEAKER_00": "Alice Johnson",
    "SPEAKER_01": "Bob Smith",
    "SPEAKER_02": "Carol Davis"
  }
}
```

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "message": "Speaker names updated successfully.",
  "status_code": "200",
  "transcript": [
    {
      "speaker": "Alice Johnson",
      "text": "Hello everyone",
      "start": "0.00",
      "end": "2.00"
    }
  ]
}
```

**Note:** Updating speaker names invalidates any cached summary.

---

### POST /jobs/{uuid}/identify-speakers
Use AI to identify and suggest speaker names based on transcript content.

**Request (Without Context):**
```http
POST /jobs/550e8400-e29b-41d4-a716-446655440000/identify-speakers
```

**Request (With Context):**
```http
POST /jobs/550e8400-e29b-41d4-a716-446655440000/identify-speakers
Content-Type: application/json

{
  "context": "This is a product planning meeting with the engineering and design teams."
}
```

**Request Body (Optional):**
```json
{
  "context": "Additional information about the meeting or expected participants"
}
```

**Response (Success):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "suggestions": {
    "Speaker 1": "John Smith (CEO)",
    "Speaker 2": "Cannot be determined",
    "Speaker 3": "Project Manager"
  },
  "status_code": "200"
}
```

**Response (Error):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "error",
  "error": "Failed to parse LLM response as JSON",
  "raw_response": "The raw LLM response text...",
  "status_code": "500"
}
```

**Note:** The LLM uses conservative identification and will return "Cannot be determined" when evidence is insufficient.

---

## Export Functions

### POST /jobs/{uuid}/pdf
Export the summary and transcript as a professionally formatted PDF.

**Request:**
```http
POST /jobs/550e8400-e29b-41d4-a716-446655440000/pdf
Content-Type: application/json

{
  "generated_on": "December 29, 2025 at 3:45 PM"
}
```

**Request Body (Optional):**
```json
{
  "generated_on": "Custom timestamp string for the PDF header"
}
```

**Response:**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename=meeting-recording_summary_2025-12-29.pdf`
- Binary PDF data

**Filename Format:**
- `{meeting-title}_summary_{YYYY-MM-DD}.pdf`

**PDF Contents:**
1. Header with MeetMemo logo
2. Meeting information table
3. AI-generated summary (formatted from markdown)
4. Full transcript with speaker names and timestamps
5. Footer with disclaimer and page numbers

---

### POST /jobs/{uuid}/markdown
Export the summary and transcript as a markdown file.

**Request:**
```http
POST /jobs/550e8400-e29b-41d4-a716-446655440000/markdown
Content-Type: application/json

{
  "generated_on": "December 29, 2025 at 3:45 PM"
}
```

**Request Body (Optional):**
```json
{
  "generated_on": "Custom timestamp string for the markdown header"
}
```

**Response:**
- Content-Type: `text/markdown`
- Content-Disposition: `attachment; filename=meeting-recording_summary_2025-12-29.md`
- Markdown formatted text

**Filename Format:**
- `{meeting-title}_summary_{YYYY-MM-DD}.md`

**Markdown Structure:**
```markdown
# Meeting Title

*Generated on December 29, 2025 at 3:45 PM*

## Summary

[AI-generated summary content]

## Transcript

**Alice Johnson** *(0.00s - 2.50s)*: Hello everyone, welcome to the meeting.

**Bob Smith** *(2.55s - 5.10s)*: Thank you for having me.
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "detail": "Invalid transcript file format"
}
```

### 404 Not Found
```json
{
  "error": "UUID not found",
  "status_code": "404"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Internal server error during audio processing. Please try again or contact support if the issue persists."
}
```

### 503 Service Unavailable
```json
{
  "detail": "Summary service temporarily unavailable. Please try again later."
}
```

---

## Data Models

### Transcript Entry
```json
{
  "speaker": "SPEAKER_00",
  "text": "The spoken text content",
  "start": "0.00",
  "end": "3.45"
}
```

**Fields:**
- `speaker` (string): Speaker identifier (SPEAKER_XX format or custom name)
- `text` (string): Transcribed text
- `start` (string): Start time in seconds
- `end` (string): End time in seconds

---

## Background Processes

### File Cleanup
The backend automatically cleans up files older than 12 hours:
- Audio files in `audiofiles/`
- Transcripts in `transcripts/` and `transcripts/edited/`
- Summaries in `summary/`
- CSV entries in `audiofiles.csv`

**Schedule:** Runs every hour

---

## Notes

1. **UUID Format:** The API supports both legacy 4-digit numeric UUIDs (e.g., "0001") and full UUID4 format (e.g., "550e8400-e29b-41d4-a716-446655440000")

2. **Edited Transcripts:** When a transcript is edited, the original is preserved in `transcripts/` and the edited version is saved in `transcripts/edited/`. The GET endpoint automatically returns the edited version if available.

3. **Summary Caching:** Summaries are cached in `summary/{uuid}.txt`. They are automatically invalidated when:
   - Speaker names are updated
   - Transcript content is edited

4. **Speaker Name Formatting:** Generic speaker names (SPEAKER_00, SPEAKER_01) are automatically formatted as "Speaker 1", "Speaker 2" in summaries and exports. Manual renames are preserved.

5. **Filename Collisions:** When renaming or uploading files, the system automatically appends "(Copy)" or "(Copy N)" to prevent overwrites.

6. **LLM Configuration:** The summarization and speaker identification features require proper `.env` configuration:
   - `LLM_API_URL`: LLM endpoint
   - `LLM_MODEL_NAME`: Model identifier
   - `LLM_API_KEY`: Optional authentication key
   - `HF_TOKEN`: Required for PyAnnote speaker diarization models

7. **Audio Processing:** All uploaded audio is converted to 16kHz mono WAV format for processing with Whisper and PyAnnote models.

---

## Example Workflows

### Complete Transcription Workflow
```bash
# 1. Upload audio file
curl -X POST http://localhost:8000/jobs \
  -F "file=@meeting.mp3" \
  -F "model_name=turbo"
# Returns: {"uuid": "550e8400...", "file_name": "meeting.wav", "transcript": [...]}

# 2. Check status
curl http://localhost:8000/jobs/550e8400.../status
# Returns: {"status": "completed", "status_code": "200"}

# 3. Get transcript
curl http://localhost:8000/jobs/550e8400.../transcript
# Returns: Full transcript JSON

# 4. Identify speakers with AI
curl -X POST http://localhost:8000/jobs/550e8400.../identify-speakers \
  -H "Content-Type: application/json" \
  -d '{"context": "Engineering team meeting"}'
# Returns: {"suggestions": {"Speaker 1": "John (Engineer)", ...}}

# 5. Update speaker names
curl -X PATCH http://localhost:8000/jobs/550e8400.../speakers \
  -H "Content-Type: application/json" \
  -d '{"mapping": {"SPEAKER_00": "John", "SPEAKER_01": "Sarah"}}'

# 6. Generate summary
curl -X POST http://localhost:8000/jobs/550e8400.../summarise
# Returns: {"summary": "# Meeting Summary\n..."}

# 7. Export as PDF
curl -X POST http://localhost:8000/jobs/550e8400.../pdf \
  --output meeting-summary.pdf

# 8. Export as Markdown
curl -X POST http://localhost:8000/jobs/550e8400.../markdown \
  --output meeting-summary.md
```

### Edit and Regenerate Workflow
```bash
# 1. Get original transcript
curl http://localhost:8000/jobs/550e8400.../transcript

# 2. Edit transcript content
curl -X PATCH http://localhost:8000/jobs/550e8400.../transcript \
  -H "Content-Type: application/json" \
  -d '{"transcript": [{"speaker": "John", "text": "Edited text", ...}]}'

# 3. Delete cached summary (optional - happens automatically)
curl -X DELETE http://localhost:8000/jobs/550e8400.../summary

# 4. Regenerate summary with edited transcript
curl -X POST http://localhost:8000/jobs/550e8400.../summarise

# 5. Export updated PDF
curl -X POST http://localhost:8000/jobs/550e8400.../pdf \
  --output updated-meeting-summary.pdf
```
