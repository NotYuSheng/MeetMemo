"""
Dependency injection factories for FastAPI.

This module provides factory functions that create and manage service instances
with proper lifecycle management and dependency injection.

Note: Imports are intentionally placed inside functions to avoid circular dependencies.
"""
# pylint: disable=import-outside-toplevel
from typing import Optional

import httpx
from fastapi import Depends

from config import Settings, get_settings

# Global HTTP client for LLM calls
_http_client: Optional[httpx.AsyncClient] = None  # pylint: disable=invalid-name


async def get_http_client() -> httpx.AsyncClient:
    """
    Get shared HTTP client for LLM API calls.

    Returns:
        httpx.AsyncClient: Shared async HTTP client

    Raises:
        RuntimeError: If HTTP client not initialized (call init_http_client first)

    Example:
        >>> client = await get_http_client()
        >>> response = await client.post(url, json=data)
    """
    global _http_client  # pylint: disable=global-statement,global-variable-not-assigned
    if _http_client is None:
        raise RuntimeError(
            "HTTP client not initialized. "
            "Call init_http_client() during app startup."
        )
    return _http_client


async def init_http_client(settings: Optional[Settings] = None) -> None:
    """
    Initialize HTTP client during application startup.

    Args:
        settings: Optional settings instance (uses get_settings() if not provided)

    Example:
        >>> # In FastAPI lifespan
        >>> await init_http_client()
    """
    global _http_client  # pylint: disable=global-statement
    if settings is None:
        settings = get_settings()

    _http_client = httpx.AsyncClient(timeout=settings.llm_timeout)


async def close_http_client() -> None:
    """
    Close HTTP client during application shutdown.

    Example:
        >>> # In FastAPI lifespan
        >>> await close_http_client()
    """
    global _http_client  # pylint: disable=global-statement
    if _http_client:
        await _http_client.aclose()
        _http_client = None


# ============================================================================
# Repository Factories
# ============================================================================

def get_job_repository():
    """Get JobRepository instance."""
    from repositories.job_repository import JobRepository
    return JobRepository()


def get_export_repository():
    """Get ExportRepository instance."""
    from repositories.export_repository import ExportRepository
    return ExportRepository()


# ============================================================================
# Service Factories
# ============================================================================


def get_audio_service(
    settings: Settings = Depends(get_settings),
    job_repo = Depends(get_job_repository)
):
    """Get AudioService instance."""
    from services.audio_service import AudioService
    return AudioService(settings, job_repo)


def get_transcription_service(
    settings: Settings = Depends(get_settings),
    job_repo = Depends(get_job_repository)
):
    """Get TranscriptionService instance."""
    from services.transcription_service import TranscriptionService
    return TranscriptionService(settings, job_repo)


def get_diarization_service(
    settings: Settings = Depends(get_settings),
    job_repo = Depends(get_job_repository)
):
    """Get DiarizationService instance."""
    from services.diarization_service import DiarizationService
    return DiarizationService(settings, job_repo)


def get_alignment_service(
    settings: Settings = Depends(get_settings),
    job_repo = Depends(get_job_repository)
):
    """Get AlignmentService instance."""
    from services.alignment_service import AlignmentService
    return AlignmentService(settings, job_repo)


async def get_summary_service(
    http_client: httpx.AsyncClient = Depends(get_http_client),
    settings: Settings = Depends(get_settings)
):
    """Get SummaryService instance."""
    from services.summary_service import SummaryService
    return SummaryService(http_client, settings)


def get_speaker_service(
    settings: Settings = Depends(get_settings)
):
    """Get SpeakerService instance."""
    from services.speaker_service import SpeakerService
    return SpeakerService(settings)


def get_export_service(
    settings: Settings = Depends(get_settings),
    export_repo = Depends(get_export_repository)
):
    """Get ExportService instance."""
    from services.export_service import ExportService
    return ExportService(settings, export_repo)


def get_live_service(
    settings: Settings = Depends(get_settings),
    transcription_service=Depends(get_transcription_service),
):
    """Get LiveService instance."""
    from services.live_service import LiveService
    return LiveService(settings, transcription_service)


def get_cleanup_service(
    settings: Settings = Depends(get_settings),
    job_repo = Depends(get_job_repository),
    export_repo = Depends(get_export_repository)
):
    """Get CleanupService instance."""
    from services.cleanup_service import CleanupService
    return CleanupService(settings, job_repo, export_repo)
