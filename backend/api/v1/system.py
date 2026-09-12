"""
System information endpoint.

Exposes read-only hardware detection and the resolved ML configuration so the
frontend (and operators) can see which hardware profile is active.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from config import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/system")
async def system_info(settings: Settings = Depends(get_settings)):
    """
    Report detected hardware and the resolved ML configuration.

    Returns:
        dict: Detected GPU/VRAM, the resolved hardware profile, the active
        model/precision/device settings, and any fit warnings.
    """
    try:
        return settings.system_info()
    except Exception as e:
        logger.error("System info lookup failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="System info lookup failed") from e
