"""
Exports router for synchronous PDF and Markdown exports.

This router handles direct export generation (not background jobs).
Note: PDF generation logic is currently in main.py and needs to be extracted.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from dependencies import get_job_repository
from models import ExportRequest
from repositories.job_repository import JobRepository

logger = logging.getLogger(__name__)

router = APIRouter()


# Note: These endpoints reference PDF/Markdown generation functions
# that are still in main.py. They will be extracted to utils/pdf_generator.py
# in a future iteration.

@router.get("/jobs/{uuid}/exports/pdf")
async def export_pdf(
    uuid: str,
    request: ExportRequest = None,
    job_repo: JobRepository = Depends(get_job_repository)
):
    """
    Export job as PDF (summary + transcript).

    Note: Implementation still in main.py - to be migrated.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # TODO: Extract PDF generation from main.py to utils/pdf_generator.py
    raise HTTPException(
        status_code=501,
        detail="PDF export - implementation in main.py to be migrated"
    )


@router.get("/jobs/{uuid}/exports/markdown")
async def export_markdown(
    uuid: str,
    request: ExportRequest = None,
    job_repo: JobRepository = Depends(get_job_repository)
):
    """
    Export job as Markdown (summary + transcript).

    Note: Implementation still in main.py - to be migrated.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # TODO: Extract Markdown generation from main.py
    raise HTTPException(
        status_code=501,
        detail="Markdown export - implementation in main.py to be migrated"
    )


@router.get("/jobs/{uuid}/exports/transcript/pdf")
async def export_transcript_pdf(
    uuid: str,
    request: ExportRequest = None,
    job_repo: JobRepository = Depends(get_job_repository)
):
    """
    Export transcript-only PDF.

    Note: Implementation still in main.py - to be migrated.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # TODO: Extract PDF generation from main.py
    raise HTTPException(
        status_code=501,
        detail="Transcript PDF export - implementation in main.py to be migrated"
    )


@router.get("/jobs/{uuid}/exports/transcript/markdown")
async def export_transcript_markdown(
    uuid: str,
    request: ExportRequest = None,
    job_repo: JobRepository = Depends(get_job_repository)
):
    """
    Export transcript-only Markdown.

    Note: Implementation still in main.py - to be migrated.
    """
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # TODO: Extract Markdown generation from main.py
    raise HTTPException(
        status_code=501,
        detail="Transcript Markdown export - implementation in main.py to be migrated"
    )
