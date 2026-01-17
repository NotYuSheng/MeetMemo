"""
Speakers router for speaker management operations.

This router handles speaker name updates and LLM-based speaker identification.
"""
import logging
import os

import aiofiles
from fastapi import APIRouter, Depends, HTTPException

from config import Settings, get_settings
from dependencies import get_job_repository, get_speaker_service, get_summary_service
from models import (
    SpeakerIdentificationRequest,
    SpeakerIdentificationResponse,
    SpeakerNameMapping,
    SpeakerUpdateResponse,
)
from repositories.job_repository import JobRepository
from services.speaker_service import SpeakerService
from services.summary_service import SummaryService
from utils.formatters import format_transcript_for_llm

logger = logging.getLogger(__name__)

router = APIRouter()


@router.patch("/jobs/{uuid}/speakers", response_model=SpeakerUpdateResponse)
async def update_speakers(
    uuid: str,
    speaker_map: SpeakerNameMapping,
    job_repo: JobRepository = Depends(get_job_repository),
    speaker_service: SpeakerService = Depends(get_speaker_service),
    summary_service: SummaryService = Depends(get_summary_service),
    settings: Settings = Depends(get_settings)
) -> SpeakerUpdateResponse:
    """Update speaker names in transcript."""
    try:
        job = await job_repo.get(uuid)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

        file_name = job['file_name']
        base_name = os.path.splitext(file_name)[0]

        # Update speaker names
        updated_transcript = await speaker_service.update_speaker_names(
            uuid,
            base_name,
            speaker_map.mapping
        )

        # Invalidate cached summary
        await summary_service.delete_summary(uuid)
        logger.info("Updated speakers for %s, summary cache invalidated", uuid)

        return SpeakerUpdateResponse(
            uuid=uuid,
            status="success",
            message="Speaker names updated successfully",
            transcript=updated_transcript
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating speakers for job %s: %s", uuid, e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error while updating speaker names"
        ) from e


@router.post("/jobs/{uuid}/speaker-identifications", response_model=SpeakerIdentificationResponse)
async def identify_speakers(
    uuid: str,
    request: SpeakerIdentificationRequest = None,
    job_repo: JobRepository = Depends(get_job_repository),
    summary_service: SummaryService = Depends(get_summary_service),
    settings: Settings = Depends(get_settings)
) -> SpeakerIdentificationResponse:
    """Use LLM to identify speakers based on transcript content."""
    try:
        job = await job_repo.get(uuid)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

        file_name = job['file_name']
        base_name = os.path.splitext(file_name)[0]

        # Get transcript
        edited_path = os.path.join(settings.transcript_edited_dir, f"{base_name}.json")
        original_path = os.path.join(settings.transcript_dir, f"{base_name}.json")

        transcript_path = edited_path if await aiofiles.os.path.exists(edited_path) else original_path

        if not await aiofiles.os.path.exists(transcript_path):
            raise HTTPException(status_code=404, detail="Transcript not found")

        async with aiofiles.open(transcript_path, "r", encoding="utf-8") as f:
            transcript_json = await f.read()

        formatted_transcript = format_transcript_for_llm(transcript_json)

        # Get context from request
        context = request.context if request else None

        # Identify speakers
        identification_result = await summary_service.identify_speakers(
            formatted_transcript,
            context
        )

        if identification_result["status"] == "success":
            logger.info("Successfully identified speakers for %s", uuid)
            return SpeakerIdentificationResponse(
                uuid=uuid,
                status="success",
                suggestions=identification_result["suggestions"]
            )

        logger.error("Speaker identification failed for %s", uuid)
        raise HTTPException(
            status_code=500,
            detail=identification_result.get("message", "Speaker identification failed")
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error identifying speakers for job %s: %s", uuid, e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during speaker identification"
        ) from e
