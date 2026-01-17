"""
Transcription service using OpenAI Whisper.

This service handles Whisper model loading, caching, and transcription processing
with progress tracking.
"""
import asyncio
import logging

import whisper

from config import Settings
from database import update_error
from repositories.job_repository import JobRepository

logger = logging.getLogger(__name__)


class TranscriptionService:
    """Service for audio transcription using Whisper."""

    def __init__(self, settings: Settings, job_repo: JobRepository):
        """
        Initialize TranscriptionService.

        Args:
            settings: Application settings
            job_repo: Job repository for database operations
        """
        self.settings = settings
        self.job_repo = job_repo
        self._model_cache = {}

    def get_model(self, model_name: str = "turbo"):
        """
        Get cached Whisper model.

        Args:
            model_name: Name of the Whisper model (turbo, base, small, etc.)

        Returns:
            Loaded Whisper model
        """
        if model_name not in self._model_cache:
            logger.info("Loading Whisper model: %s", model_name)
            model = whisper.load_model(model_name)
            model = model.to(self.settings.device)
            self._model_cache[model_name] = model
            logger.info(
                "Whisper model %s loaded successfully on %s",
                model_name,
                self.settings.device
            )
        return self._model_cache[model_name]

    async def transcribe(
        self,
        job_uuid: str,
        file_path: str,
        model_name: str = "turbo"
    ) -> dict:
        """
        Transcribe audio file with progress tracking.

        Args:
            job_uuid: Job UUID
            file_path: Path to audio file
            model_name: Whisper model to use

        Returns:
            Transcription data dict with text, segments, and language

        Raises:
            Exception: If transcription fails
        """
        try:
            await self.job_repo.update_workflow_state(job_uuid, 'transcribing', 0)
            logger.info("Starting transcription for job %s", job_uuid)

            # Get cached model
            model = self.get_model(model_name)

            # Transcribe with optimized settings - run in executor to avoid blocking event loop
            await self.job_repo.update_step_progress(job_uuid, 10)
            loop = asyncio.get_event_loop()
            asr = await loop.run_in_executor(
                None,
                lambda: model.transcribe(
                    file_path,
                    language="en",
                    fp16=True,
                    beam_size=1,
                    best_of=1,
                    temperature=0.0,
                    no_speech_threshold=0.6,
                    logprob_threshold=-1.0,
                    compression_ratio_threshold=2.4,
                    condition_on_previous_text=False
                )
            )

            await self.job_repo.update_step_progress(job_uuid, 90)
            logger.info("Transcription complete for job %s", job_uuid)

            # Save transcription data to database
            transcription_data = {
                "text": asr.get("text", ""),
                "segments": asr.get("segments", []),
                "language": asr.get("language", "en")
            }
            await self.job_repo.save_transcription(job_uuid, transcription_data)

            # Update state to transcribed
            await self.job_repo.update_step_progress(job_uuid, 100)
            await self.job_repo.update_workflow_state(job_uuid, 'transcribed', 100)
            logger.info("Transcription step completed for job %s", job_uuid)

            return transcription_data

        except Exception as e:
            error_msg = str(e)
            logger.error(
                "Transcription failed for job %s: %s",
                job_uuid,
                error_msg,
                exc_info=True
            )
            await update_error(job_uuid, f"Transcription failed: {error_msg}")
            await self.job_repo.update_workflow_state(job_uuid, 'error', 0)
            raise
