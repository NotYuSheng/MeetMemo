"""
Export job repository for data access operations.

This repository wraps database.py functions for managing export jobs.
"""
from typing import Optional

from database import (
    add_export_job,
    get_export_job,
    update_export_status,
    update_export_progress,
    update_export_error,
    update_export_file_path,
    cleanup_old_export_jobs
)


class ExportRepository:
    """Repository for export job data access operations."""

    async def create(
        self,
        export_uuid: str,
        job_uuid: str,
        export_type: str,
        status_code: int = 202
    ) -> None:
        """
        Create a new export job.

        Args:
            export_uuid: Export job UUID
            job_uuid: Parent job UUID
            export_type: Export type ('pdf' or 'markdown')
            status_code: Initial status code (default: 202 for processing)
        """
        await add_export_job(export_uuid, job_uuid, export_type, status_code)

    async def get(self, export_uuid: str) -> Optional[dict]:
        """
        Get export job by UUID.

        Args:
            export_uuid: Export job UUID

        Returns:
            Export job data dict or None if not found
        """
        return await get_export_job(export_uuid)

    async def update_status(self, export_uuid: str, status_code: int) -> None:
        """
        Update export job status code.

        Args:
            export_uuid: Export job UUID
            status_code: HTTP status code (200, 500, etc.)
        """
        await update_export_status(export_uuid, status_code)

    async def update_progress(
        self,
        export_uuid: str,
        progress: int
    ) -> None:
        """
        Update export job progress.

        Args:
            export_uuid: Export job UUID
            progress: Progress percentage (0-100)
        """
        await update_export_progress(export_uuid, progress)

    async def update_error(self, export_uuid: str, error_message: str) -> None:
        """
        Update export job with error message.

        Args:
            export_uuid: Export job UUID
            error_message: Error message
        """
        await update_export_error(export_uuid, error_message)

    async def update_file_path(
        self,
        export_uuid: str,
        file_path: str
    ) -> None:
        """
        Update export job file path.

        Args:
            export_uuid: Export job UUID
            file_path: Path to generated export file
        """
        await update_export_file_path(export_uuid, file_path)

    async def cleanup_old(self, max_age_hours: int) -> list[dict]:
        """
        Clean up old export jobs older than specified age.

        Args:
            max_age_hours: Maximum age in hours

        Returns:
            List of deleted export job dicts
        """
        return await cleanup_old_export_jobs(max_age_hours)
