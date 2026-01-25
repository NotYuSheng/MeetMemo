"""
Transcription service using faster-whisper.

This service handles Whisper model loading, caching, and transcription processing
with progress tracking. Uses faster-whisper with CTranslate2 for 4x performance
improvement over openai-whisper.
"""
import asyncio
import logging

from faster_whisper import WhisperModel

from config import Settings
from database import update_error
from repositories.job_repository import JobRepository

logger = logging.getLogger(__name__)


class TranscriptionService:
    """Service for audio transcription using faster-whisper."""

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
        Get cached faster-whisper model.

        Args:
            model_name: Name of the Whisper model (turbo, large-v3, base, small, etc.)

        Returns:
            Loaded WhisperModel instance
        """
        if model_name not in self._model_cache:
            logger.info("Loading faster-whisper model: %s", model_name)

            # Determine compute type based on device
            compute_type = self.settings.compute_type if hasattr(self.settings, 'compute_type') else None
            if compute_type is None:
                compute_type = "float16" if "cuda" in self.settings.device else "int8"

            # Load model with faster-whisper
            model = WhisperModel(
                model_name,
                device=self.settings.device.split(':')[0],  # Extract 'cuda' or 'cpu'
                compute_type=compute_type
            )
            self._model_cache[model_name] = model
            logger.info(
                "faster-whisper model %s loaded successfully on %s with %s precision",
                model_name,
                self.settings.device,
                compute_type
            )
        return self._model_cache[model_name]

    async def transcribe(
        self,
        job_uuid: str,
        file_path: str,
        model_name: str = "turbo",
        language: str = None
    ) -> dict:
        """
        Transcribe audio file with progress tracking using faster-whisper.

        Args:
            job_uuid: Job UUID
            file_path: Path to audio file
            model_name: Whisper model to use
            language: Language code (ISO 639-1) or None for auto-detection

        Returns:
            Transcription data dict with text, segments, and language

        Raises:
            Exception: If transcription fails
        """
        try:
            await self.job_repo.update_workflow_state(job_uuid, 'transcribing', 0)
            logger.info("Starting transcription for job %s with language: %s", job_uuid, language or "auto")

            # Get cached model
            model = self.get_model(model_name)

            # Transcribe with faster-whisper - run in executor to avoid blocking event loop
            await self.job_repo.update_step_progress(job_uuid, 10)
            loop = asyncio.get_event_loop()

            # faster-whisper returns (segments_generator, info) instead of dict
            segments_gen, info = await loop.run_in_executor(
                None,
                lambda: model.transcribe(
                    file_path,
                    language=language,
                    beam_size=1,
                    best_of=1,
                    temperature=0.0,
                    vad_filter=False,  # Disable VAD to match openai-whisper behavior
                    condition_on_previous_text=False,
                    no_speech_threshold=0.6,
                    log_prob_threshold=-1.0,
                    compression_ratio_threshold=2.4
                )
            )

            await self.job_repo.update_step_progress(job_uuid, 50)

            # Convert generator to list and build compatible output format
            segments_list = []
            full_text = []

            for segment in segments_gen:
                # Build segment dict matching openai-whisper format
                segment_dict = {
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                    "id": segment.id,
                    "seek": segment.seek,
                    "tokens": segment.tokens,
                    "temperature": segment.temperature,
                    "avg_logprob": segment.avg_logprob,
                    "compression_ratio": segment.compression_ratio,
                    "no_speech_prob": segment.no_speech_prob
                }
                segments_list.append(segment_dict)
                full_text.append(segment.text)

            await self.job_repo.update_step_progress(job_uuid, 90)
            logger.info("Transcription complete for job %s", job_uuid)

            # Build transcription data matching openai-whisper output format
            transcription_data = {
                "text": "".join(full_text),
                "segments": segments_list,
                "language": info.language if info.language else (language or "auto")
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
