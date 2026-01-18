"""
Audio router for streaming audio files.

This router handles audio file streaming with HTTP range request support
for seeking and efficient playback in the browser.
"""
import logging
import os
from pathlib import Path

import aiofiles
import aiofiles.os
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from config import Settings, get_settings
from dependencies import get_job_repository
from repositories.job_repository import JobRepository

logger = logging.getLogger(__name__)

router = APIRouter()

# Content type mapping for audio files
AUDIO_CONTENT_TYPES = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.mp4': 'audio/mp4',
    '.m4a': 'audio/mp4',
    '.webm': 'audio/webm',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
}


def get_content_type(file_name: str) -> str:
    """Get the content type based on file extension."""
    ext = os.path.splitext(file_name)[1].lower()
    return AUDIO_CONTENT_TYPES.get(ext, 'application/octet-stream')


async def get_file_size(file_path: str) -> int:
    """Get file size asynchronously."""
    stat_result = await aiofiles.os.stat(file_path)
    return stat_result.st_size


async def stream_audio_range(
    file_path: str,
    start: int,
    end: int,
    chunk_size: int = 1024 * 1024  # 1MB chunks
):
    """
    Stream audio file bytes within the specified range.

    Args:
        file_path: Path to the audio file
        start: Start byte position
        end: End byte position (inclusive)
        chunk_size: Size of chunks to yield
    """
    async with aiofiles.open(file_path, 'rb') as f:
        await f.seek(start)
        remaining = end - start + 1

        while remaining > 0:
            chunk = await f.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def parse_range_header(range_header: str, file_size: int) -> tuple[int, int]:
    """
    Parse HTTP Range header and return start and end byte positions.

    Args:
        range_header: The Range header value (e.g., "bytes=0-1023")
        file_size: Total size of the file

    Returns:
        Tuple of (start, end) byte positions
    """
    try:
        # Remove "bytes=" prefix
        range_spec = range_header.replace("bytes=", "")

        if range_spec.startswith("-"):
            # Suffix range: last N bytes
            suffix_length = int(range_spec[1:])
            start = max(0, file_size - suffix_length)
            end = file_size - 1
        elif range_spec.endswith("-"):
            # Open-ended range: from start to end of file
            start = int(range_spec[:-1])
            end = file_size - 1
        else:
            # Explicit range: start-end
            parts = range_spec.split("-")
            start = int(parts[0])
            end = int(parts[1]) if parts[1] else file_size - 1

        # Validate range
        start = max(0, start)
        end = min(end, file_size - 1)

        if start > end:
            raise ValueError("Invalid range: start > end")

        return start, end

    except (ValueError, IndexError) as e:
        logger.warning("Invalid range header '%s': %s", range_header, e)
        return 0, file_size - 1


@router.get("/jobs/{uuid}/audio")
async def stream_audio(
    uuid: str,
    request: Request,
    job_repo: JobRepository = Depends(get_job_repository),
    settings: Settings = Depends(get_settings)
):
    """
    Stream audio file for a job with HTTP range request support.

    Supports partial content (206) responses for seeking in audio players.
    Falls back to full content (200) if no Range header is provided.

    Args:
        uuid: Job UUID
        request: FastAPI Request object (for Range header)
        job_repo: Job repository dependency
        settings: Application settings dependency

    Returns:
        StreamingResponse with audio content

    Raises:
        HTTPException: 404 if job or audio file not found
    """
    # Get job from database
    job = await job_repo.get(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']

    # Security: prevent path traversal attacks
    try:
        upload_dir_path = Path(settings.upload_dir).resolve(strict=True)
        file_path = (upload_dir_path / file_name).resolve(strict=True)
        # Ensure the resolved file path is within the upload directory
        file_path.relative_to(upload_dir_path)
    except (ValueError, FileNotFoundError):
        logger.warning(
            "Path traversal attempt or file not found for job %s: %s",
            uuid,
            file_name,
        )
        raise HTTPException(status_code=404, detail="Audio file not found")

    file_path = str(file_path)  # Convert Path to string for aiofiles compatibility

    # Get file size
    file_size = await get_file_size(file_path)
    content_type = get_content_type(file_name)

    # Check for Range header
    range_header = request.headers.get("Range")

    if range_header:
        # Partial content response (206)
        start, end = parse_range_header(range_header, file_size)
        content_length = end - start + 1

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": content_type,
        }

        logger.debug(
            "Streaming audio range for job %s: bytes %d-%d/%d",
            uuid, start, end, file_size
        )

        return StreamingResponse(
            stream_audio_range(file_path, start, end),
            status_code=206,
            headers=headers,
            media_type=content_type
        )
    else:
        # Full content response (200)
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": content_type,
        }

        logger.debug("Streaming full audio for job %s: %d bytes", uuid, file_size)

        return StreamingResponse(
            stream_audio_range(file_path, 0, file_size - 1),
            status_code=200,
            headers=headers,
            media_type=content_type
        )
