"""
Summaries router for AI summary operations.

This router handles summary generation, updates, and deletion.
"""
import logging
import os

import aiofiles
from fastapi import APIRouter, Depends, HTTPException

from config import Settings, get_settings
from dependencies import get_job_repository, get_summary_service
from models import SummarizeRequest, SummaryResponse, UpdateSummaryRequest
from repositories.job_repository import JobRepository
from services.summary_service import SummaryService
from utils.file_utils import get_transcript_path
from utils.formatters import format_transcript_for_llm

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/jobs/{uuid}/summaries", response_model=SummaryResponse)
async def get_summary(
    uuid: str,
    job_repo: JobRepository = Depends(get_job_repository),
    summary_service: SummaryService = Depends(get_summary_service),
    settings: Settings = Depends(get_settings)
) -> SummaryResponse:
    """Get cached summary or generate new one."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # Check for cached summary
    cached_summary = await summary_service.get_cached_summary(uuid)
    if cached_summary:
        logger.info("Returning cached summary for %s", uuid)
        return SummaryResponse(
            uuid=uuid,
            file_name=job['file_name'],
            status="cached",
            status_code=200,
            summary=cached_summary
        )

    # Generate new summary
    file_name = job['file_name']
    base_name = os.path.splitext(file_name)[0]

    # Get transcript
    try:
        transcript_path = await get_transcript_path(
            base_name,
            settings.transcript_dir,
            settings.transcript_edited_dir
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Transcript not found") from exc

    async with aiofiles.open(transcript_path, "r", encoding="utf-8") as f:
        transcript_json = await f.read()

    formatted_transcript = format_transcript_for_llm(transcript_json)
    summary = await summary_service.summarize(formatted_transcript)

    # Cache the summary
    await summary_service.save_summary(uuid, summary)
    logger.info("Generated and cached new summary for %s", uuid)

    return SummaryResponse(
        uuid=uuid,
        file_name=file_name,
        status="generated",
        status_code=200,
        summary=summary
    )


@router.post("/jobs/{uuid}/summaries", response_model=SummaryResponse)
async def create_summary(
    uuid: str,
    request: SummarizeRequest = None,
    job_repo: JobRepository = Depends(get_job_repository),
    summary_service: SummaryService = Depends(get_summary_service),
    settings: Settings = Depends(get_settings)
) -> SummaryResponse:
    """Generate new summary with optional custom prompts."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']
    base_name = os.path.splitext(file_name)[0]

    # Get transcript
    try:
        transcript_path = await get_transcript_path(
            base_name,
            settings.transcript_dir,
            settings.transcript_edited_dir
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Transcript not found") from exc

    async with aiofiles.open(transcript_path, "r", encoding="utf-8") as f:
        transcript_json = await f.read()

    formatted_transcript = format_transcript_for_llm(transcript_json)

    # Generate summary with optional custom prompts
    custom_prompt = request.custom_prompt if request else None
    system_prompt = request.system_prompt if request else None

    summary = await summary_service.summarize(
        formatted_transcript,
        custom_prompt,
        system_prompt
    )

    # Cache the summary
    await summary_service.save_summary(uuid, summary)
    logger.info("Generated new summary for %s", uuid)

    return SummaryResponse(
        uuid=uuid,
        file_name=file_name,
        status="generated",
        status_code=200,
        summary=summary
    )


@router.patch("/jobs/{uuid}/summaries")
async def update_summary(
    uuid: str,
    request: UpdateSummaryRequest,
    job_repo: JobRepository = Depends(get_job_repository),
    summary_service: SummaryService = Depends(get_summary_service)
) -> SummaryResponse:
    """Update cached summary with user-edited content."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # Save updated summary
    await summary_service.save_summary(uuid, request.summary)
    logger.info("Updated summary for %s", uuid)

    return SummaryResponse(
        uuid=uuid,
        file_name=job['file_name'],
        status="updated",
        status_code=200,
        summary=request.summary
    )


@router.delete("/jobs/{uuid}/summaries")
async def delete_summary_cache(
    uuid: str,
    job_repo: JobRepository = Depends(get_job_repository),
    summary_service: SummaryService = Depends(get_summary_service)
):
    """Delete cached summary."""
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    deleted = await summary_service.delete_summary(uuid)
    if deleted:
        logger.info("Deleted cached summary for %s", uuid)
        return {
            "uuid": uuid,
            "status": "success",
            "message": "Summary deleted successfully"
        }

    raise HTTPException(status_code=404, detail="No cached summary found")
