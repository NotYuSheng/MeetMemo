"""
Export jobs router for asynchronous PDF and Markdown exports.

This router handles background export job creation, status checking, and downloads.
"""
import logging
import os
import uuid as uuid_lib
from io import BytesIO

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse

from config import Settings, get_settings
from dependencies import (
    get_export_repository,
    get_export_service,
    get_job_repository,
    get_summary_service,
)
from models import CreateExportRequest, ExportJobResponse, ExportJobStatusResponse
from repositories.export_repository import ExportRepository
from repositories.job_repository import JobRepository
from services.export_service import ExportService
from services.summary_service import SummaryService
from utils.file_utils import get_transcript_path
from utils.formatters import format_transcript_for_llm

logger = logging.getLogger(__name__)

router = APIRouter()


async def _process_export_job_task(  # pylint: disable=too-many-arguments,too-many-positional-arguments,too-many-locals,too-many-statements
    export_uuid: str,
    job_uuid: str,
    export_type: str,
    job_repo: JobRepository,
    export_repo: ExportRepository,
    export_service: ExportService,
    summary_service: SummaryService,
    settings: Settings
) -> None:
    """
    Background task to process export job.

    Args:
        export_uuid: Export job UUID
        job_uuid: Parent job UUID
        export_type: Export type (pdf, markdown, transcript_pdf, transcript_markdown)
        job_repo: Job repository instance
        export_repo: Export repository instance
        export_service: Export service instance
        summary_service: Summary service instance
        settings: Application settings
    """
    try:
        await export_repo.update_progress(export_uuid, 10)
        logger.info("Processing export job %s (type: %s)", export_uuid, export_type)

        # Get job data
        job = await job_repo.get(job_uuid)
        if not job:
            await export_repo.update_error(export_uuid, "Parent job not found")
            await export_repo.update_status(export_uuid, 404)
            return

        meeting_title = job['file_name']
        base_name = os.path.splitext(meeting_title)[0]

        # Get transcript
        try:
            transcript_path = await get_transcript_path(
                base_name,
                settings.transcript_dir,
                settings.transcript_edited_dir
            )
        except FileNotFoundError:
            await export_repo.update_error(export_uuid, "Transcript not found")
            await export_repo.update_status(export_uuid, 404)
            return

        async with aiofiles.open(transcript_path, "r", encoding="utf-8") as f:
            transcript_json = await f.read()

        await export_repo.update_progress(export_uuid, 30)

        # Generate export based on type
        needs_summary = export_type in ['pdf', 'markdown']
        summary_content = None

        if needs_summary:
            # Get or generate summary
            cached_summary = await summary_service.get_cached_summary(job_uuid)
            if cached_summary:
                summary_content = cached_summary
            else:
                formatted_transcript = format_transcript_for_llm(transcript_json)
                summary_content = await summary_service.summarize(formatted_transcript)
                await summary_service.save_summary(job_uuid, summary_content)

        await export_repo.update_progress(export_uuid, 50)

        # Generate file
        file_buffer: BytesIO
        file_ext: str

        if export_type == 'pdf':
            file_buffer = export_service.generate_summary_pdf_export(
                meeting_title, summary_content, transcript_json
            )
            file_ext = 'pdf'
        elif export_type == 'markdown':
            file_buffer = export_service.generate_summary_markdown_export(
                meeting_title, summary_content, transcript_json
            )
            file_ext = 'md'
        elif export_type == 'transcript_pdf':
            file_buffer = export_service.generate_transcript_pdf_export(
                meeting_title, transcript_json
            )
            file_ext = 'pdf'
        elif export_type == 'transcript_markdown':
            file_buffer = export_service.generate_transcript_markdown_export(
                meeting_title, transcript_json
            )
            file_ext = 'md'
        else:
            await export_repo.update_error(export_uuid, f"Invalid export type: {export_type}")
            await export_repo.update_status(export_uuid, 400)
            return

        await export_repo.update_progress(export_uuid, 80)

        # Save to disk
        os.makedirs(settings.export_dir, exist_ok=True)
        export_filename = f"{export_uuid}.{file_ext}"
        export_path = os.path.join(settings.export_dir, export_filename)

        async with aiofiles.open(export_path, "wb") as f:
            await f.write(file_buffer.getvalue())

        # Update export job with file path
        await export_repo.update_file_path(export_uuid, export_path)
        await export_repo.update_progress(export_uuid, 100)
        await export_repo.update_status(export_uuid, 200)

        logger.info("Export job %s completed successfully", export_uuid)

    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.error("Export job %s failed: %s", export_uuid, str(e), exc_info=True)
        await export_repo.update_error(export_uuid, str(e))
        await export_repo.update_status(export_uuid, 500)


@router.post("/jobs/{uuid}/export-jobs", response_model=ExportJobResponse, status_code=202)
async def create_export_job(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    uuid: str,
    request: CreateExportRequest,
    background_tasks: BackgroundTasks,
    job_repo: JobRepository = Depends(get_job_repository),
    export_repo: ExportRepository = Depends(get_export_repository),
    export_service: ExportService = Depends(get_export_service),
    summary_service: SummaryService = Depends(get_summary_service),
    settings: Settings = Depends(get_settings)
) -> ExportJobResponse:
    """
    Create async export job for PDF or Markdown.

    Initiates background export generation and returns export job UUID.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # Create export job UUID
    export_uuid = str(uuid_lib.uuid4())

    # Create export job in database
    await export_repo.create(export_uuid, uuid, request.format, status_code=202)

    # Add background task
    background_tasks.add_task(
        _process_export_job_task,
        export_uuid,
        uuid,
        request.format,
        job_repo,
        export_repo,
        export_service,
        summary_service,
        settings
    )

    logger.info("Created export job %s for job %s (type: %s)", export_uuid, uuid, request.format)

    return ExportJobResponse(
        export_uuid=export_uuid,
        job_uuid=uuid,
        status="processing",
        status_code=202,
        message="Export job created successfully"
    )


@router.get(
    "/jobs/{uuid}/export-jobs/{export_uuid}",
    response_model=ExportJobStatusResponse
)
async def get_export_job_status(
    uuid: str,
    export_uuid: str,
    job_repo: JobRepository = Depends(get_job_repository),
    export_repo: ExportRepository = Depends(get_export_repository)
) -> ExportJobStatusResponse:
    """
    Get status of async export job.

    Returns export job progress, status, and download URL when complete.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    export_job = await export_repo.get(export_uuid)
    if not export_job:
        raise HTTPException(status_code=404, detail=f"Export job {export_uuid} not found")

    # Determine status text
    status_code = export_job.get('status_code', 202)
    if status_code == 200:
        status = "completed"
    elif status_code >= 400:
        status = "failed"
    else:
        status = "processing"

    # Build download URL if completed
    download_url = None
    if status_code == 200:
        download_url = f"/api/v1/jobs/{uuid}/export-jobs/{export_uuid}/download"

    return ExportJobStatusResponse(
        export_uuid=export_uuid,
        job_uuid=uuid,
        status=status,
        status_code=status_code,
        progress=export_job.get('progress', 0),
        error_message=export_job.get('error_message'),
        download_url=download_url
    )


@router.get("/jobs/{uuid}/export-jobs/{export_uuid}/download")
async def download_export(
    uuid: str,
    export_uuid: str,
    job_repo: JobRepository = Depends(get_job_repository),
    export_repo: ExportRepository = Depends(get_export_repository),
    export_service: ExportService = Depends(get_export_service)
):
    """
    Download completed export file.

    Returns FileResponse with generated PDF or Markdown file.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    export_job = await export_repo.get(export_uuid)
    if not export_job:
        raise HTTPException(status_code=404, detail=f"Export job {export_uuid} not found")

    # Check if export is complete
    if export_job.get('status_code') != 200:
        raise HTTPException(
            status_code=400,
            detail="Export job is not complete or failed"
        )

    file_path = export_job.get('file_path')
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Export file not found")

    # Determine media type and filename
    export_type = export_job.get('export_type', 'pdf')
    meeting_title = job['file_name']

    is_transcript_only = 'transcript' in export_type
    file_ext = 'pdf' if 'pdf' in export_type else 'md'
    media_type = 'application/pdf' if file_ext == 'pdf' else 'text/markdown'

    filename = export_service.generate_filename(
        meeting_title,
        file_ext,
        is_transcript_only=is_transcript_only
    )

    logger.info("Serving export file %s for job %s", export_uuid, uuid)

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
