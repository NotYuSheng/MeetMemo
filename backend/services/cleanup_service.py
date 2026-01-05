"""
Cleanup service for background file maintenance.

This service handles scheduled cleanup of old jobs, export files, and orphaned files.
"""
import asyncio
import logging
import os
from threading import Thread

import aiofiles.os

from config import Settings
from repositories.job_repository import JobRepository
from repositories.export_repository import ExportRepository

logger = logging.getLogger(__name__)


class CleanupService:
    """Service for background file cleanup and maintenance."""

    def __init__(
        self,
        settings: Settings,
        job_repo: JobRepository,
        export_repo: ExportRepository
    ):
        """
        Initialize CleanupService.

        Args:
            settings: Application settings
            job_repo: Job repository
            export_repo: Export repository
        """
        self.settings = settings
        self.job_repo = job_repo
        self.export_repo = export_repo
        self._cleanup_thread: Thread | None = None
        self._running = False

    async def cleanup_expired_files(self) -> None:
        """
        Clean up old jobs and export files.

        Removes jobs older than retention period and their associated files.
        """
        try:
            logger.info("Starting scheduled cleanup")

            # Cleanup old jobs
            old_jobs = await self.job_repo.cleanup_old(
                self.settings.job_retention_hours
            )

            for job in old_jobs:
                file_name = job.get("file_name", "")
                if file_name:
                    # Remove audio file
                    audio_path = os.path.join(self.settings.upload_dir, file_name)
                    if await aiofiles.os.path.exists(audio_path):
                        try:
                            await aiofiles.os.remove(audio_path)
                        except Exception as e:
                            logger.error("Failed to delete audio file %s: %s", audio_path, e)

                    # Remove transcript files
                    base_name = os.path.splitext(file_name)[0]
                    transcript_path = os.path.join(
                        self.settings.transcript_dir,
                        f"{base_name}.json"
                    )
                    if await aiofiles.os.path.exists(transcript_path):
                        try:
                            await aiofiles.os.remove(transcript_path)
                        except Exception as e:
                            logger.error("Failed to delete transcript %s: %s", transcript_path, e)

            # Cleanup old export jobs
            old_exports = await self.export_repo.cleanup_old(
                self.settings.export_retention_hours
            )

            for export_job in old_exports:
                file_path = export_job.get("file_path", "")
                if file_path and await aiofiles.os.path.exists(file_path):
                    try:
                        await aiofiles.os.remove(file_path)
                    except Exception as e:
                        logger.error("Failed to delete export file %s: %s", file_path, e)

            logger.info(
                "Cleanup completed: %d jobs, %d exports removed",
                len(old_jobs),
                len(old_exports)
            )

        except Exception as e:
            logger.error("Error during file cleanup: %s", e, exc_info=True)

    def start_scheduler(self) -> None:
        """Start background cleanup scheduler thread."""
        async def cleanup_worker():
            while self._running:
                try:
                    await self.cleanup_expired_files()
                    await asyncio.sleep(self.settings.cleanup_interval_hours * 3600)
                except Exception as e:
                    logger.error("Error in cleanup worker: %s", e, exc_info=True)
                    await asyncio.sleep(600)  # Sleep for 10 minutes on error

        def run_async_cleanup():
            asyncio.run(cleanup_worker())

        self._running = True
        self._cleanup_thread = Thread(target=run_async_cleanup, daemon=True)
        self._cleanup_thread.start()
        logger.info("Started file cleanup scheduler")

    def stop_scheduler(self) -> None:
        """Stop background cleanup scheduler."""
        self._running = False
        logger.info("Cleanup scheduler stopped")
