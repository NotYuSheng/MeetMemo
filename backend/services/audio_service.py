"""
Audio service for file upload, validation, and conversion.

This service handles audio file uploads, format conversion, duplicate detection,
and file management operations.
"""
import asyncio
import os
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import HTTPException, UploadFile

from config import Settings
from repositories.job_repository import JobRepository
from security import sanitize_filename
from utils.file_utils import calculate_file_hash, convert_to_wav, get_unique_filename


class AudioService:
    """Service for audio file operations."""

    def __init__(self, settings: Settings, job_repo: JobRepository):
        """
        Initialize AudioService.

        Args:
            settings: Application settings
            job_repo: Job repository for database operations
        """
        self.settings = settings
        self.job_repo = job_repo

    async def upload_audio(
        self,
        job_uuid: str,
        file: UploadFile
    ) -> tuple[str, str]:
        """
        Upload and validate audio file.

        Args:
            job_uuid: UUID for the job
            file: Uploaded file

        Returns:
            Tuple of (filename, file_hash)

        Raises:
            HTTPException: If file is invalid or too large
        """
        # Validate file size and collect chunks
        file_size = 0
        chunks = []

        chunk = await file.read(8192)
        while chunk:
            file_size += len(chunk)
            if file_size > self.settings.max_file_size:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"File too large. Maximum size: "
                        f"{self.settings.max_file_size / 1024 / 1024:.0f}MB"
                    )
                )
            chunks.append(chunk)
            chunk = await file.read(8192)

        # Calculate file hash for duplicate detection
        file_hash = calculate_file_hash(chunks)

        # Sanitize filename
        try:
            safe_filename = sanitize_filename(file.filename)
        except HTTPException:
            # If sanitization fails, use UUID-based filename with original extension
            ext = Path(file.filename).suffix or '.wav'
            safe_filename = f"{job_uuid[:8]}{ext}"

        filename = get_unique_filename(self.settings.upload_dir, safe_filename)
        file_path = os.path.join(self.settings.upload_dir, filename)

        # Save the file to disk (async)
        async with aiofiles.open(file_path, "wb") as buffer:
            for chunk in chunks:
                await buffer.write(chunk)

        return filename, file_hash

    async def convert_to_wav_async(
        self,
        input_filename: str,
        output_filename: str,
        sample_rate: int = 16000
    ) -> None:
        """
        Convert audio file to WAV format (async wrapper).

        Args:
            input_filename: Input audio filename in upload directory
            output_filename: Output WAV filename in upload directory
            sample_rate: Target sample rate in Hz (default: 16000)

        Raises:
            Exception: If conversion fails
        """
        input_path = os.path.join(self.settings.upload_dir, input_filename)
        output_path = os.path.join(self.settings.upload_dir, output_filename)

        # Run conversion in thread pool to avoid blocking event loop
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, convert_to_wav, input_path, output_path, sample_rate)

    async def check_duplicate(self, file_hash: str) -> Optional[dict]:
        """
        Check if file with same hash already exists.

        Args:
            file_hash: SHA256 file hash

        Returns:
            Existing job data if duplicate found, None otherwise
        """
        return await self.job_repo.find_by_hash(file_hash)

    def validate_audio_type(self, content_type: str) -> bool:
        """
        Validate audio file MIME type.

        Args:
            content_type: File MIME type

        Returns:
            True if valid audio type, False otherwise
        """
        return content_type in self.settings.allowed_audio_types
