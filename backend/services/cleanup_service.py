"""
Cleanup service for background file maintenance.

This service handles scheduled cleanup of old jobs, export files, and orphaned files.
"""
import asyncio
import logging
import os

import aiofiles.os

from config import Settings
from repositories.export_repository import ExportRepository
from repositories.job_repository import JobRepository

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
        self._cleanup_task: asyncio.Task | None = None
        self._running = False

    async def cleanup_expired_files(self) -> None:
        """
        Clean up old jobs and export files.

        Removes jobs older than retention period and their associated files.
        """
        try:
            logger.info("Starting scheduled cleanup")

            # Cleanup old jobs
            try:
                old_jobs = await self.job_repo.cleanup_old(
                    self.settings.job_retention_hours
                )
            except Exception as e:
                logger.error("Failed to query old jobs: %s", e, exc_info=True)
                old_jobs = []

            for job in old_jobs:
                file_name = job.get("file_name", "")
                if file_name:
                    # Remove audio file
                    audio_path = os.path.join(self.settings.upload_dir, file_name)
                    if await aiofiles.os.path.exists(audio_path):
                        try:
                            await aiofiles.os.remove(audio_path)
                            logger.debug("Deleted audio file: %s", audio_path)
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
                            logger.debug("Deleted transcript file: %s", transcript_path)
                        except Exception as e:
                            logger.error("Failed to delete transcript %s: %s", transcript_path, e)

            # Cleanup old export jobs
            try:
                old_exports = await self.export_repo.cleanup_old(
                    self.settings.export_retention_hours
                )
            except Exception as e:
                logger.error("Failed to query old exports: %s", e, exc_info=True)
                old_exports = []

            for export_job in old_exports:
                file_path = export_job.get("file_path", "")
                if file_path and await aiofiles.os.path.exists(file_path):
                    try:
                        await aiofiles.os.remove(file_path)
                        logger.debug("Deleted export file: %s", file_path)
                    except Exception as e:
                        logger.error("Failed to delete export file %s: %s", file_path, e)

            logger.info(
                "Cleanup completed: %d jobs, %d exports removed",
                len(old_jobs),
                len(old_exports)
            )

        except Exception as e:
            logger.error("Error during file cleanup: %s", e, exc_info=True)

    async def _cleanup_worker(self) -> None:
        """Background worker that runs cleanup periodically."""
        logger.info("Cleanup worker started")

        while self._running:
            try:
                await self.cleanup_expired_files()

                # Sleep until next cleanup interval
                interval_seconds = self.settings.cleanup_interval_hours * 3600
                logger.debug("Next cleanup in %d hours", self.settings.cleanup_interval_hours)
                await asyncio.sleep(interval_seconds)

            except asyncio.CancelledError:
                logger.info("Cleanup worker cancelled")
                break
            except Exception as e:
                logger.error("Error in cleanup worker: %s", e, exc_info=True)
                # Sleep for 10 minutes on error before retrying
                await asyncio.sleep(600)

        logger.info("Cleanup worker stopped")

    def start_scheduler(self) -> None:
        """
        Start background cleanup scheduler as an asyncio task.

        Must be called from within the running event loop.
        """
        if self._cleanup_task is not None:
            logger.warning("Cleanup scheduler already running")
            return

        self._running = True
        self._cleanup_task = asyncio.create_task(self._cleanup_worker())
        logger.info("Started file cleanup scheduler")

    async def stop_scheduler(self) -> None:
        """Stop background cleanup scheduler and wait for it to finish."""
        if self._cleanup_task is None:
            logger.warning("Cleanup scheduler not running")
            return

        logger.info("Stopping cleanup scheduler...")
        self._running = False

        # Cancel the task and wait for it to finish
        if not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        self._cleanup_task = None
        logger.info("Cleanup scheduler stopped")
