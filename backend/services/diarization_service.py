"""
Diarization service using PyAnnote.

This service handles PyAnnote pipeline loading, caching, and speaker diarization
processing with progress tracking.
"""
import asyncio
import logging
from typing import Optional

import torch
from pyannote.audio import Pipeline

from config import Settings
from database import update_error
from repositories.job_repository import JobRepository

logger = logging.getLogger(__name__)


class DiarizationService:
    """Service for speaker diarization using PyAnnote."""

    def __init__(self, settings: Settings, job_repo: JobRepository):
        """
        Initialize DiarizationService.

        Args:
            settings: Application settings
            job_repo: Job repository for database operations
        """
        self.settings = settings
        self.job_repo = job_repo
        self._pipeline_cache: Optional[Pipeline] = None

    def get_pipeline(self) -> Pipeline:
        """
        Get cached PyAnnote speaker diarization pipeline.

        Returns:
            PyAnnote pipeline instance
        """
        if self._pipeline_cache is None:
            logger.info("Loading PyAnnote speaker diarization pipeline")
            self._pipeline_cache = Pipeline.from_pretrained(
                self.settings.pyannote_model_name,
                use_auth_token=self.settings.hf_token
            )
            self._pipeline_cache = self._pipeline_cache.to(
                torch.device(self.settings.device)
            )
            logger.info("PyAnnote pipeline loaded successfully")

        return self._pipeline_cache

    async def diarize(self, job_uuid: str, file_path: str) -> dict:
        """
        Perform speaker diarization with progress tracking.

        Args:
            job_uuid: Job UUID
            file_path: Path to audio file

        Returns:
            Diarization data dict with speaker segments

        Raises:
            Exception: If diarization fails
        """
        try:
            await self.job_repo.update_workflow_state(job_uuid, 'diarizing', 0)
            logger.info("Starting diarization for job %s", job_uuid)

            # Get cached pipeline
            pipeline = self.get_pipeline()

            # Diarize audio - run in executor to avoid blocking event loop
            await self.job_repo.update_step_progress(job_uuid, 10)
            loop = asyncio.get_event_loop()
            diarization = await loop.run_in_executor(None, pipeline, file_path)

            await self.job_repo.update_step_progress(job_uuid, 90)
            logger.info("Diarization complete for job %s", job_uuid)

            # Convert diarization to serializable format
            diarization_data = {
                "segments": []
            }

            for turn, _, speaker in diarization.itertracks(yield_label=True):
                diarization_data["segments"].append({
                    "start": turn.start,
                    "end": turn.end,
                    "speaker": speaker
                })

            # Save diarization data to database
            await self.job_repo.save_diarization(job_uuid, diarization_data)

            # Update state to diarized
            await self.job_repo.update_step_progress(job_uuid, 100)
            await self.job_repo.update_workflow_state(job_uuid, 'diarized', 100)
            logger.info("Diarization step completed for job %s", job_uuid)

            return diarization_data

        except Exception as e:
            error_msg = str(e)
            logger.error(
                "Diarization failed for job %s: %s",
                job_uuid,
                error_msg,
                exc_info=True
            )
            await update_error(job_uuid, f"Diarization failed: {error_msg}")
            await self.job_repo.update_workflow_state(job_uuid, 'error', 0)
            raise
