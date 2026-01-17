"""
Health check endpoint.

Simple health check for monitoring application status.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from config import Settings, get_settings
from database import get_jobs_count

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check(settings: Settings = Depends(get_settings)):
    """
    Health check endpoint.

    Returns application status, version, and basic statistics.

    Returns:
        dict: Health check response with status, version, job count, and device
    """
    try:
        # Check database connection
        total_jobs = await get_jobs_count()

        return {
            "status": "ok",
            "version": "2.0.0",
            "jobs_count": total_jobs,
            "device": settings.device
        }
    except Exception as e:
        logger.error("Health check failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Health check failed") from e
