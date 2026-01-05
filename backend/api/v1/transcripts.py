"""
Transcripts router for transcript operations.

This router handles getting and updating transcript content.
"""
import json
import logging
import os

import aiofiles
from fastapi import APIRouter, Depends, HTTPException

from config import Settings, get_settings
from dependencies import get_job_repository, get_summary_service
from models import TranscriptResponse, TranscriptUpdateRequest
from repositories.job_repository import JobRepository
from services.summary_service import SummaryService
from security import sanitize_log_data

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/jobs/{uuid}/transcript", response_model=TranscriptResponse)
async def get_transcript(
    uuid: str,
    job_repo: JobRepository = Depends(get_job_repository),
    settings: Settings = Depends(get_settings)
) -> TranscriptResponse:
    """Get transcript for a job (checks edited version first)."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']
    base_name = os.path.splitext(file_name)[0]

    # Check for edited transcript first
    edited_path = os.path.join(settings.transcript_edited_dir, f"{base_name}.json")
    original_path = os.path.join(settings.transcript_dir, f"{base_name}.json")

    if await aiofiles.os.path.exists(edited_path):
        async with aiofiles.open(edited_path, "r", encoding="utf-8") as f:
            full_transcript = await f.read()
        logger.info(
            "Retrieved edited transcript for %s: %s",
            uuid,
            sanitize_log_data(full_transcript)
        )
        return TranscriptResponse(
            uuid=uuid,
            status="exists",
            full_transcript=full_transcript,
            file_name=file_name,
            status_code=200,
            is_edited=True
        )

    if await aiofiles.os.path.exists(original_path):
        async with aiofiles.open(original_path, "r", encoding="utf-8") as f:
            full_transcript = await f.read()
        logger.info(
            "Retrieved original transcript for %s: %s",
            uuid,
            sanitize_log_data(full_transcript)
        )
        return TranscriptResponse(
            uuid=uuid,
            status="exists",
            full_transcript=full_transcript,
            file_name=file_name,
            status_code=200,
            is_edited=False
        )

    raise HTTPException(status_code=404, detail=f"Transcript not found for job {uuid}")


@router.patch("/jobs/{uuid}/transcript")
async def update_transcript(
    uuid: str,
    request: TranscriptUpdateRequest,
    job_repo: JobRepository = Depends(get_job_repository),
    summary_service: SummaryService = Depends(get_summary_service),
    settings: Settings = Depends(get_settings)
):
    """Update transcript content (creates edited version)."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']
    base_name = os.path.splitext(file_name)[0]

    # Save to edited directory
    os.makedirs(settings.transcript_edited_dir, exist_ok=True)
    edited_path = os.path.join(settings.transcript_edited_dir, f"{base_name}.json")

    transcript_json = json.dumps(request.transcript, indent=4)
    async with aiofiles.open(edited_path, "w", encoding="utf-8") as f:
        await f.write(transcript_json)

    # Invalidate cached summary
    await summary_service.delete_summary(uuid)
    logger.info("Transcript updated for job %s, summary cache invalidated", uuid)

    return {
        "uuid": uuid,
        "status": "success",
        "message": "Transcript updated successfully"
    }
