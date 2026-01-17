"""
Export jobs router for asynchronous PDF and Markdown exports.

This router handles background export job creation, status checking, and downloads.
Note: PDF generation logic is currently in main.py and needs to be extracted.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from dependencies import get_export_service, get_job_repository
from models import CreateExportRequest, ExportJobResponse, ExportJobStatusResponse
from repositories.job_repository import JobRepository
from services.export_service import ExportService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/jobs/{uuid}/export-jobs", response_model=ExportJobResponse, status_code=202)
async def create_export_job(
    uuid: str,
    request: CreateExportRequest,
    background_tasks: BackgroundTasks,
    export_service: ExportService = Depends(get_export_service),
    job_repo: JobRepository = Depends(get_job_repository)
) -> ExportJobResponse:
    """
    Create async export job for PDF or Markdown.

    Initiates background export generation and returns export job UUID.
    Note: Implementation still in main.py - to be migrated.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # TODO: Extract export job creation from main.py
    # Background task: export_service.process_export_job(export_uuid, uuid, request.format)
    raise HTTPException(
        status_code=501,
        detail="Async export - implementation in main.py to be migrated"
    )


@router.get(
    "/jobs/{uuid}/export-jobs/{export_uuid}",
    response_model=ExportJobStatusResponse
)
async def get_export_job_status(
    uuid: str,
    export_uuid: str,
    job_repo: JobRepository = Depends(get_job_repository)
) -> ExportJobStatusResponse:
    """
    Get status of async export job.

    Returns export job progress, status, and download URL when complete.
    Note: Implementation still in main.py - to be migrated.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # TODO: Implement export job status retrieval
    raise HTTPException(
        status_code=501,
        detail="Export job status - implementation in main.py to be migrated"
    )


@router.get("/jobs/{uuid}/export-jobs/{export_uuid}/download")
async def download_export(
    uuid: str,
    export_uuid: str,
    job_repo: JobRepository = Depends(get_job_repository)
):
    """
    Download completed export file.

    Returns FileResponse with generated PDF or Markdown file.
    Note: Implementation still in main.py - to be migrated.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # TODO: Implement export file download
    # Should return FileResponse with appropriate media_type and filename
    raise HTTPException(
        status_code=501,
        detail="Export download - implementation in main.py to be migrated"
    )
