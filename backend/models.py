"""Pydantic models for request/response validation."""
from pydantic import BaseModel, Field, validator
from typing import Optional
from security import sanitize_filename, validate_uuid_format


# Request Models
class SpeakerNameMapping(BaseModel):
    """Model for mapping old speaker names to new ones."""
    mapping: dict[str, str]


class TranscriptUpdateRequest(BaseModel):
    """Model for updating transcript content."""
    transcript: list[dict]


class SummarizeRequest(BaseModel):
    """Model for summarization requests with optional custom prompts."""
    custom_prompt: Optional[str] = None
    system_prompt: Optional[str] = None


class SpeakerIdentificationRequest(BaseModel):
    """Model for LLM-based speaker identification requests."""
    context: Optional[str] = None


class RenameJobRequest(BaseModel):
    """Model for renaming a job."""
    file_name: str = Field(..., min_length=1, max_length=255)

    @validator('file_name')
    def validate_filename(cls, v):
        return sanitize_filename(v)


class ExportRequest(BaseModel):
    """Model for export requests with optional timestamp."""
    generated_on: Optional[str] = None


# Response Models
class TranscriptSegment(BaseModel):
    """Model for a single transcript segment."""
    speaker: str
    text: str
    start: str
    end: str


class JobResponse(BaseModel):
    """Model for job information."""
    uuid: str
    file_name: str
    status_code: int

    class Config:
        json_schema_extra = {
            "example": {
                "uuid": "550e8400-e29b-41d4-a716-446655440000",
                "file_name": "meeting-recording.wav",
                "status_code": 200
            }
        }


class JobStatusResponse(BaseModel):
    """Model for job status information."""
    uuid: str
    file_name: str
    status_code: int
    status: str
    progress_percentage: Optional[int] = 0
    processing_stage: Optional[str] = "pending"
    error_message: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "uuid": "550e8400-e29b-41d4-a716-446655440000",
                "file_name": "meeting-recording.wav",
                "status_code": 200,
                "status": "completed",
                "progress_percentage": 100,
                "processing_stage": "completed",
                "error_message": None
            }
        }


class FileNameResponse(BaseModel):
    """Model for file name response."""
    uuid: str
    file_name: str


class TranscriptResponse(BaseModel):
    """Model for transcript response."""
    uuid: str
    status: str
    full_transcript: str
    file_name: str
    status_code: int
    is_edited: bool


class SummaryResponse(BaseModel):
    """Model for summary response."""
    uuid: str
    file_name: str
    status: str
    status_code: int
    summary: str


class DeleteResponse(BaseModel):
    """Model for delete operation response."""
    uuid: str
    status: str
    message: str


class RenameResponse(BaseModel):
    """Model for rename operation response."""
    uuid: str
    status: str
    new_name: str


class SpeakerUpdateResponse(BaseModel):
    """Model for speaker update response."""
    uuid: str
    status: str
    message: str
    transcript: list[dict]


class SpeakerIdentificationResponse(BaseModel):
    """Model for speaker identification response."""
    uuid: str
    status: str
    suggestions: dict[str, str]


class JobListResponse(BaseModel):
    """Model for paginated job list."""
    jobs: dict[str, dict]
    total: int
    limit: int
    offset: int


class ErrorResponse(BaseModel):
    """Model for error responses."""
    detail: str
    status_code: Optional[int] = None

    class Config:
        json_schema_extra = {
            "example": {
                "detail": "Resource not found",
                "status_code": 404
            }
        }
