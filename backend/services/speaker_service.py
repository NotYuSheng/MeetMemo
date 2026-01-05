"""
Speaker service for managing speaker names in transcripts.

This service handles speaker name updates and transcript formatting.
"""
import json
import logging
import os

import aiofiles

from config import Settings
from utils.formatters import format_speaker_name, format_transcript_for_llm
from utils.file_utils import get_unique_filename

logger = logging.getLogger(__name__)


class SpeakerService:
    """Service for speaker name management."""

    def __init__(self, settings: Settings):
        """
        Initialize SpeakerService.

        Args:
            settings: Application settings
        """
        self.settings = settings

    async def update_speaker_names(
        self,
        job_uuid: str,
        file_name: str,
        mapping: dict[str, str]
    ) -> list[dict]:
        """
        Update speaker names in transcript.

        Args:
            job_uuid: Job UUID
            file_name: Transcript file name
            mapping: Dict mapping old speaker names to new names

        Returns:
            Updated transcript data

        Raises:
            Exception: If update fails
        """
        # Read original transcript
        original_path = os.path.join(self.settings.transcript_dir, f"{file_name}.json")

        async with aiofiles.open(original_path, "r", encoding="utf-8") as f:
            transcript_json = await f.read()

        transcript_data = json.loads(transcript_json)

        # Apply speaker name mapping
        for entry in transcript_data:
            old_name = entry.get("speaker", "")
            if old_name in mapping:
                entry["speaker"] = mapping[old_name]

        # Save to edited directory
        os.makedirs(self.settings.transcript_edited_dir, exist_ok=True)
        edited_path = os.path.join(
            self.settings.transcript_edited_dir,
            f"{file_name}.json"
        )

        updated_json = json.dumps(transcript_data, indent=4)
        async with aiofiles.open(edited_path, "w", encoding="utf-8") as f:
            await f.write(updated_json)

        logger.info("Updated speaker names for job %s", job_uuid)
        return transcript_data

    def format_for_llm(self, transcript_json: str) -> str:
        """
        Format transcript for LLM consumption.

        Args:
            transcript_json: JSON string of transcript

        Returns:
            Formatted transcript text
        """
        return format_transcript_for_llm(transcript_json)

    def format_name(self, speaker_name: str) -> str:
        """
        Format speaker name for display.

        Args:
            speaker_name: Raw speaker name

        Returns:
            Formatted speaker name
        """
        return format_speaker_name(speaker_name)
