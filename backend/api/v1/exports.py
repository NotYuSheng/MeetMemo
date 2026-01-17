"""
Exports router for synchronous PDF and Markdown exports.

This router handles direct export generation for summaries and transcripts.
"""
import logging
import os
from io import BytesIO

import aiofiles
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from config import Settings, get_settings
from dependencies import get_export_service, get_job_repository, get_summary_service
from models import ExportRequest
from repositories.job_repository import JobRepository
from services.export_service import ExportService
from services.summary_service import SummaryService
from utils.formatters import format_transcript_for_llm

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_transcript_json(
    uuid: str,
    job: dict,
    settings: Settings
) -> str:
    """
    Get transcript JSON for a job (checks edited version first).

    Args:
        uuid: Job UUID
        job: Job data dictionary
        settings: Application settings

    Returns:
        Transcript JSON string

    Raises:
        HTTPException: If transcript not found
    """
    file_name = job['file_name']
    base_name = os.path.splitext(file_name)[0]

    edited_path = os.path.join(settings.transcript_edited_dir, f"{base_name}.json")
    original_path = os.path.join(settings.transcript_dir, f"{base_name}.json")

    # Check edited first, then original
    if await aiofiles.os.path.exists(edited_path):
        async with aiofiles.open(edited_path, "r", encoding="utf-8") as f:
            return await f.read()

    if await aiofiles.os.path.exists(original_path):
        async with aiofiles.open(original_path, "r", encoding="utf-8") as f:
            return await f.read()

    raise HTTPException(status_code=404, detail=f"Transcript not found for job {uuid}")


async def _get_summary_content(
    uuid: str,
    job: dict,
    summary_service: SummaryService,
    settings: Settings
) -> str:
    """
    Get summary content for a job (cached or generate new).

    Args:
        uuid: Job UUID
        job: Job data dictionary
        summary_service: Summary service instance
        settings: Application settings

    Returns:
        Summary content string

    Raises:
        HTTPException: If unable to get or generate summary
    """
    # Check for cached summary first
    cached_summary = await summary_service.get_cached_summary(uuid)
    if cached_summary:
        return cached_summary

    # Generate new summary
    transcript_json = await _get_transcript_json(uuid, job, settings)
    formatted_transcript = format_transcript_for_llm(transcript_json)
    summary = await summary_service.summarize(formatted_transcript)

    # Cache for future use
    await summary_service.save_summary(uuid, summary)

    return summary


@router.post("/jobs/{uuid}/exports/pdf", status_code=200)
async def export_pdf(
    uuid: str,
    request: ExportRequest = None,
    job_repo: JobRepository = Depends(get_job_repository),
    export_service: ExportService = Depends(get_export_service),
    summary_service: SummaryService = Depends(get_summary_service),
    settings: Settings = Depends(get_settings)
):
    """
    Export job as PDF (summary + transcript).

    Args:
        uuid: Job UUID
        request: Optional export parameters (generated_on timestamp)

    Returns:
        PDF file as streaming response
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    try:
        # Get data
        meeting_title = job['file_name']
        summary_content = await _get_summary_content(uuid, job, summary_service, settings)
        transcript_json = await _get_transcript_json(uuid, job, settings)

        # Get optional timestamp
        generated_on = request.generated_on if request else None

        # Generate PDF
        pdf_buffer = export_service.generate_summary_pdf_export(
            meeting_title,
            summary_content,
            transcript_json,
            generated_on
        )

        # Generate filename
        filename = export_service.generate_filename(meeting_title, 'pdf')

        logger.info("Generated PDF export for job %s", uuid)

        return StreamingResponse(
            BytesIO(pdf_buffer.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating PDF for job %s: %s", uuid, e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during PDF generation"
        ) from e


@router.post("/jobs/{uuid}/exports/markdown", status_code=200)
async def export_markdown(
    uuid: str,
    request: ExportRequest = None,
    job_repo: JobRepository = Depends(get_job_repository),
    export_service: ExportService = Depends(get_export_service),
    summary_service: SummaryService = Depends(get_summary_service),
    settings: Settings = Depends(get_settings)
):
    """
    Export job as Markdown (summary + transcript).

    Args:
        uuid: Job UUID
        request: Optional export parameters (generated_on timestamp)

    Returns:
        Markdown file as streaming response
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    try:
        # Get data
        meeting_title = job['file_name']
        summary_content = await _get_summary_content(uuid, job, summary_service, settings)
        transcript_json = await _get_transcript_json(uuid, job, settings)

        # Get optional timestamp
        generated_on = request.generated_on if request else None

        # Generate Markdown
        markdown_buffer = export_service.generate_summary_markdown_export(
            meeting_title,
            summary_content,
            transcript_json,
            generated_on
        )

        # Generate filename
        filename = export_service.generate_filename(meeting_title, 'md')

        logger.info("Generated Markdown export for job %s", uuid)

        return StreamingResponse(
            markdown_buffer,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating Markdown for job %s: %s", uuid, e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during Markdown generation"
        ) from e


@router.post("/jobs/{uuid}/exports/transcript/pdf", status_code=200)
async def export_transcript_pdf(
    uuid: str,
    request: ExportRequest = None,
    job_repo: JobRepository = Depends(get_job_repository),
    export_service: ExportService = Depends(get_export_service),
    settings: Settings = Depends(get_settings)
):
    """
    Export transcript-only PDF (no AI summary).

    Args:
        uuid: Job UUID
        request: Optional export parameters (generated_on timestamp)

    Returns:
        PDF file as streaming response
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    try:
        # Get data
        meeting_title = job['file_name']
        transcript_json = await _get_transcript_json(uuid, job, settings)

        # Get optional timestamp
        generated_on = request.generated_on if request else None

        # Generate PDF
        pdf_buffer = export_service.generate_transcript_pdf_export(
            meeting_title,
            transcript_json,
            generated_on
        )

        # Generate filename
        filename = export_service.generate_filename(
            meeting_title,
            'pdf',
            is_transcript_only=True
        )

        logger.info("Generated transcript PDF export for job %s", uuid)

        return StreamingResponse(
            BytesIO(pdf_buffer.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating transcript PDF for job %s: %s", uuid, e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during transcript PDF generation"
        ) from e


@router.post("/jobs/{uuid}/exports/transcript/markdown", status_code=200)
async def export_transcript_markdown(
    uuid: str,
    request: ExportRequest = None,
    job_repo: JobRepository = Depends(get_job_repository),
    export_service: ExportService = Depends(get_export_service),
    settings: Settings = Depends(get_settings)
):
    """
    Export transcript-only Markdown (no AI summary).

    Args:
        uuid: Job UUID
        request: Optional export parameters (generated_on timestamp)

    Returns:
        Markdown file as streaming response
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    try:
        # Get data
        meeting_title = job['file_name']
        transcript_json = await _get_transcript_json(uuid, job, settings)

        # Get optional timestamp
        generated_on = request.generated_on if request else None

        # Generate Markdown
        markdown_buffer = export_service.generate_transcript_markdown_export(
            meeting_title,
            transcript_json,
            generated_on
        )

        # Generate filename
        filename = export_service.generate_filename(
            meeting_title,
            'md',
            is_transcript_only=True
        )

        logger.info("Generated transcript Markdown export for job %s", uuid)

        return StreamingResponse(
            markdown_buffer,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating transcript Markdown for job %s: %s", uuid, e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during transcript Markdown generation"
        ) from e
