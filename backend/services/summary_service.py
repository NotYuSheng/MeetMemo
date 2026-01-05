"""
Summary service for LLM-powered summarization and speaker identification.

This service handles LLM API calls for transcript summarization, speaker identification,
and summary caching.
"""
import logging
import os
from pathlib import Path
from typing import Optional

import aiofiles
import httpx
from fastapi import HTTPException

from config import Settings

logger = logging.getLogger(__name__)


class SummaryService:
    """Service for LLM-based summarization and speaker identification."""

    def __init__(self, http_client: httpx.AsyncClient, settings: Settings):
        """
        Initialize SummaryService.

        Args:
            http_client: Async HTTP client for LLM API calls
            settings: Application settings
        """
        self.http_client = http_client
        self.settings = settings

    async def summarize(
        self,
        transcript: str,
        custom_prompt: Optional[str] = None,
        system_prompt: Optional[str] = None
    ) -> str:
        """
        Summarize transcript using LLM.

        Args:
            transcript: The transcript text to summarize
            custom_prompt: Optional custom user prompt
            system_prompt: Optional custom system prompt

        Returns:
            Summary text in markdown format

        Raises:
            HTTPException: If LLM service is unavailable
        """
        # Validate transcript content quality
        transcript_text = transcript.strip()
        if not transcript_text:
            return (
                "# No Content Available\n\n"
                "The recording appears to be empty or could not be transcribed."
            )

        # Check for meaningful content
        words = transcript_text.split()
        unique_words = set(word.lower().strip('.,!?;:') for word in words)

        if len(words) < 10 or len(unique_words) < 5:
            spoken_content = ' '.join(words)
            return f"""# Brief Recording Summary

## Content
This appears to be a very short recording with limited content.

**Transcribed content:** "{spoken_content}"

## Note
The recording was too brief to generate a detailed meeting summary."""

        base_url = self.settings.llm_api_url
        url = f"{base_url.rstrip('/')}/v1/chat/completions"
        model_name = self.settings.llm_model_name

        # Default prompts
        default_system_prompt = (
            "You are a helpful assistant that summarizes meeting transcripts. "
            "You will give a concise summary of the key points, decisions made, "
            "and any action items, outputting it in markdown format. "
            "IMPORTANT: Always use the exact speaker names provided in the transcript. "
            "Never change, substitute, or invent different names for speakers. "
            "CRITICAL: Only summarize what is actually present in the transcript. "
            "Do not invent or hallucinate content, participants, decisions, or action items."
        )

        default_user_prompt = (
            "Analyze the following transcript and provide an appropriate summary. "
            "Use exact speaker names as they appear. "
            "Only include sections that have actual content from the transcript. "
            "Use markdown format without code blocks.\n\n"
        )

        final_system_prompt = system_prompt if system_prompt else default_system_prompt

        if custom_prompt:
            final_user_prompt = custom_prompt + "\n\n" + transcript
        else:
            final_user_prompt = default_user_prompt + transcript

        payload = {
            "model": model_name,
            "temperature": 0.3,
            "max_tokens": 5000,
            "messages": [
                {"role": "system", "content": final_system_prompt},
                {"role": "user", "content": final_user_prompt},
            ],
        }

        try:
            headers = {"Content-Type": "application/json"}
            if self.settings.llm_api_key:
                headers["Authorization"] = f"Bearer {self.settings.llm_api_key}"

            response = await self.http_client.post(
                url,
                headers=headers,
                json=payload,
                timeout=self.settings.llm_timeout
            )
            response.raise_for_status()
            data = response.json()
            summary = data["choices"][0]["message"]["content"].strip()
            return summary

        except httpx.HTTPError as e:
            logger.error("LLM service error: %s", e)
            raise HTTPException(
                status_code=503,
                detail="Summary service temporarily unavailable"
            ) from e

    async def identify_speakers(
        self,
        transcript: str,
        context: Optional[str] = None
    ) -> dict:
        """
        Identify speakers using LLM based on transcript content.

        Args:
            transcript: Formatted transcript text
            context: Optional meeting context

        Returns:
            Dict with status and speaker name suggestions

        Raises:
            HTTPException: If LLM service is unavailable
        """
        base_url = self.settings.llm_api_url
        url = f"{base_url.rstrip('/')}/v1/chat/completions"
        model_name = self.settings.llm_model_name

        system_prompt = (
            "You are a helpful assistant that identifies speakers in meeting transcripts. "
            "Based on the conversation content, suggest likely names or roles for each speaker. "
            "Return ONLY a JSON object mapping speaker labels to suggested names."
        )

        context_text = f"\nContext: {context}\n\n" if context else "\n\n"
        user_prompt = (
            "Analyze this transcript and suggest names or roles for each speaker. "
            f"{context_text}Transcript:\n{transcript}\n\n"
            "Return a JSON object like: "
            '{\"SPEAKER_00\": \"John (CEO)\", \"SPEAKER_01\": \"Sarah (CTO)\"}'
        )

        payload = {
            "model": model_name,
            "temperature": 0.2,
            "max_tokens": 500,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

        try:
            headers = {"Content-Type": "application/json"}
            if self.settings.llm_api_key:
                headers["Authorization"] = f"Bearer {self.settings.llm_api_key}"

            response = await self.http_client.post(
                url,
                headers=headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()

            # Try to parse JSON from response
            import json
            # Extract JSON from markdown code blocks if present
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            suggestions = json.loads(content)
            return {"status": "success", "suggestions": suggestions}

        except Exception as e:
            logger.error("Speaker identification failed: %s", e, exc_info=True)
            return {
                "status": "error",
                "message": f"Speaker identification failed: {str(e)}"
            }

    async def get_cached_summary(self, job_uuid: str) -> Optional[str]:
        """
        Get cached summary from filesystem.

        Args:
            job_uuid: Job UUID

        Returns:
            Cached summary text or None if not found
        """
        summary_path = self.settings.summary_path / f"{job_uuid}.txt"

        if await aiofiles.os.path.exists(str(summary_path)):
            async with aiofiles.open(summary_path, "r", encoding="utf-8") as f:
                return await f.read()

        return None

    async def save_summary(self, job_uuid: str, summary: str) -> None:
        """
        Save summary to filesystem cache.

        Args:
            job_uuid: Job UUID
            summary: Summary text to save
        """
        summary_path = self.settings.summary_path / f"{job_uuid}.txt"

        async with aiofiles.open(summary_path, "w", encoding="utf-8") as f:
            await f.write(summary)

    async def delete_summary(self, job_uuid: str) -> bool:
        """
        Delete cached summary.

        Args:
            job_uuid: Job UUID

        Returns:
            True if summary was deleted, False if it didn't exist
        """
        summary_path = self.settings.summary_path / f"{job_uuid}.txt"

        if await aiofiles.os.path.exists(str(summary_path)):
            await aiofiles.os.remove(str(summary_path))
            return True

        return False
