"""
Live transcription service for real-time audio processing.
"""

import asyncio
import logging
import numpy as np
from typing import Optional, Dict

from config import Settings
from services.transcription_service import TranscriptionService

logger = logging.getLogger(__name__)

# Global lock for Whisper inference to ensure serialized access
inference_lock = asyncio.Lock()


class LiveService:
    """Service for handling live audio transcription via WebSockets."""

    def __init__(self, settings: Settings, transcription_service: TranscriptionService):
        self.settings = settings
        self.transcription_service = transcription_service
        self.audio_buffer = bytearray()
        self.sample_rate = 16000
        self.channels = 1
        self.sample_width = 2  # 16-bit PCM

        # Minimum audio duration for inference (in seconds)
        self.min_chunk_duration = 0.5
        self.min_chunk_bytes = int(
            self.sample_rate
            * self.channels
            * self.sample_width
            * self.min_chunk_duration
        )

        # State for incremental transcription
        self.full_transcript = []
        self.current_model_name = "small"  # Default for live mode
        self.current_language = None

    async def process_audio(self, pcm_bytes: bytes) -> Optional[Dict]:
        """
        Process incoming PCM audio bytes and return transcript updates if available.
        """
        self.audio_buffer.extend(pcm_bytes)

        if len(self.audio_buffer) < self.min_chunk_bytes:
            return None

        # If we have enough audio, trigger inference
        return await self._run_inference()

    async def _run_inference(self) -> Optional[Dict]:
        """
        Run Whisper inference on the current audio buffer.
        """
        if not self.audio_buffer:
            return None

        # Convert bytearray to numpy array (float32 normalized to [-1, 1])
        audio_np = (
            np.frombuffer(self.audio_buffer, dtype=np.int16).astype(np.float32)
            / 32768.0
        )

        async with inference_lock:
            try:
                loop = asyncio.get_event_loop()
                model = self.transcription_service.get_model(self.current_model_name)

                # Run inference in executor
                segments, info = await loop.run_in_executor(
                    None,
                    lambda: model.transcribe(
                        audio_np,
                        language=self.current_language,
                        beam_size=1,
                        best_of=1,
                        temperature=0.0,
                        vad_filter=True,  # Use VAD for live mode to filter silence
                        condition_on_previous_text=True,
                    ),
                )

                # Process segments
                # For live mode, we usually care about the most recent segments
                # faster-whisper returns a generator
                new_text = ""
                for segment in segments:
                    new_text += segment.text

                if new_text.strip():
                    return {"type": "partial", "text": new_text.strip()}

            except Exception as e:
                logger.error(f"Error during live inference: {e}", exc_info=True)
                return {"type": "error", "message": f"Inference failed: {str(e)}"}

        return None

    def set_config(self, model: str = None, language: str = None):
        """Update session configuration."""
        if model:
            self.current_model_name = model
        if language:
            self.current_language = language
        logger.info(
            f"LiveService config updated: model={self.current_model_name}, language={self.current_language}"
        )

    def cleanup(self):
        """Clean up resources."""
        self.audio_buffer.clear()
        self.full_transcript.clear()
