"""
Job repository for data access operations.

This repository wraps database.py functions with a domain-focused interface
for managing transcription jobs.
"""
from typing import Optional

from database import (
    add_job,
    cleanup_old_jobs,
    delete_job,
    get_all_jobs,
    get_diarization_data,
    get_job,
    get_job_by_hash,
    get_jobs_count,
    get_transcription_data,
    save_diarization_data,
    save_transcription_data,
    update_file_name,
    update_status,
    update_step_progress,
    update_workflow_state,
)


class JobRepository:
    """Repository for job data access operations."""

    async def create(
        self,
        uuid: str,
        file_name: str,
        file_hash: Optional[str] = None,
        workflow_state: str = 'uploaded'
    ) -> None:
        """
        Create a new job.

        Args:
            uuid: Job UUID
            file_name: Uploaded file name
            file_hash: Optional file hash for duplicate detection
            workflow_state: Initial workflow state (default: 'uploaded')
        """
        await add_job(uuid, file_name, 200, file_hash, workflow_state)

    async def get(self, uuid: str) -> Optional[dict]:
        """
        Get job by UUID.

        Args:
            uuid: Job UUID

        Returns:
            Job data dict or None if not found
        """
        return await get_job(uuid)

    async def get_all(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> tuple[list[dict], int]:
        """
        Get all jobs with pagination.

        Args:
            limit: Maximum number of jobs to return
            offset: Number of jobs to skip

        Returns:
            Tuple of (jobs list, total count)
        """
        jobs = await get_all_jobs(limit, offset)
        total = await get_jobs_count()
        return jobs, total

    async def update_workflow_state(
        self,
        uuid: str,
        state: str,
        progress: int = 0
    ) -> None:
        """
        Update job workflow state and progress.

        Args:
            uuid: Job UUID
            state: New workflow state
            progress: Progress percentage (0-100)
        """
        await update_workflow_state(uuid, state, progress)

    async def update_step_progress(self, uuid: str, progress: int) -> None:
        """
        Update current step progress.

        Args:
            uuid: Job UUID
            progress: Progress percentage (0-100)
        """
        await update_step_progress(uuid, progress)

    async def save_transcription(self, uuid: str, data: dict) -> None:
        """
        Save raw transcription data.

        Args:
            uuid: Job UUID
            data: Transcription data from Whisper
        """
        await save_transcription_data(uuid, data)

    async def save_diarization(self, uuid: str, data: dict) -> None:
        """
        Save raw diarization data.

        Args:
            uuid: Job UUID
            data: Diarization data from PyAnnote
        """
        await save_diarization_data(uuid, data)

    async def get_transcription(self, uuid: str) -> Optional[dict]:
        """
        Get raw transcription data.

        Args:
            uuid: Job UUID

        Returns:
            Transcription data or None if not found
        """
        return await get_transcription_data(uuid)

    async def get_diarization(self, uuid: str) -> Optional[dict]:
        """
        Get raw diarization data.

        Args:
            uuid: Job UUID

        Returns:
            Diarization data or None if not found
        """
        return await get_diarization_data(uuid)

    async def update_file_name(self, uuid: str, new_file_name: str) -> None:
        """
        Update job file name (rename).

        Args:
            uuid: Job UUID
            new_file_name: New file name
        """
        await update_file_name(uuid, new_file_name)

    async def update_status(self, uuid: str, status_code: int) -> None:
        """
        Update job status code.

        Args:
            uuid: Job UUID
            status_code: HTTP status code (200, 500, etc.)
        """
        await update_status(uuid, status_code)

    async def delete(self, uuid: str) -> Optional[str]:
        """
        Delete job and return its file name.

        Args:
            uuid: Job UUID

        Returns:
            File name of deleted job or None if not found
        """
        return await delete_job(uuid)

    async def find_by_hash(self, file_hash: str) -> Optional[dict]:
        """
        Find job by file hash (for duplicate detection).

        Args:
            file_hash: SHA256 file hash

        Returns:
            Job data dict or None if not found
        """
        return await get_job_by_hash(file_hash)

    async def cleanup_old(self, max_age_hours: int) -> list[dict]:
        """
        Clean up old jobs older than specified age.

        Args:
            max_age_hours: Maximum age in hours

        Returns:
            List of deleted job dicts
        """
        return await cleanup_old_jobs(max_age_hours)
