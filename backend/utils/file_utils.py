"""
File operation utilities.

This module provides utilities for file handling, hashing, and audio conversion.
"""
import hashlib
import os

import aiofiles
import aiofiles.os
from pydub import AudioSegment


def get_unique_filename(
    directory: str,
    desired_filename: str,
    exclude_path: str = None
) -> str:
    """
    Generate a unique filename by appending " (Copy)" if needed.

    Args:
        directory: Directory to check for existing files
        desired_filename: The desired filename
        exclude_path: Optional path to exclude from collision check

    Returns:
        A unique filename

    Example:
        >>> get_unique_filename("/tmp", "meeting.wav")
        'meeting.wav'  # or 'meeting (Copy).wav' if exists
    """
    original_filename = desired_filename
    filename = original_filename
    file_path = os.path.join(directory, filename)

    if os.path.exists(file_path) and file_path != exclude_path:
        name, ext = os.path.splitext(original_filename)
        filename = f"{name} (Copy){ext}"
        file_path = os.path.join(directory, filename)

        counter = 2
        while os.path.exists(file_path) and file_path != exclude_path:
            filename = f"{name} (Copy {counter}){ext}"
            file_path = os.path.join(directory, filename)
            counter += 1

    return filename


def calculate_file_hash(chunks: list[bytes]) -> str:
    """
    Calculate SHA256 hash of file content from chunks.

    Args:
        chunks: List of file content chunks

    Returns:
        Hexadecimal SHA256 hash string

    Example:
        >>> chunks = [b"hello", b"world"]
        >>> calculate_file_hash(chunks)
        '936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af'
    """
    sha256_hash = hashlib.sha256()
    for chunk in chunks:
        sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def convert_to_wav(input_path: str, output_path: str, sample_rate: int = 16000) -> None:
    """
    Convert audio file to WAV format.

    Args:
        input_path: Path to input audio file
        output_path: Path to output WAV file
        sample_rate: Target sample rate in Hz (default: 16000)

    Example:
        >>> convert_to_wav("/tmp/audio.mp3", "/tmp/audio.wav")
    """
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_frame_rate(sample_rate).set_channels(1)
    audio.export(output_path, format="wav")


async def get_transcript_path(
    base_name: str,
    transcript_dir: str,
    transcript_edited_dir: str
) -> str:
    """
    Get the path to the transcript file, preferring the edited version.

    Args:
        base_name: Base filename without extension
        transcript_dir: Directory containing original transcripts
        transcript_edited_dir: Directory containing edited transcripts

    Returns:
        Path to the transcript file (edited if exists, otherwise original)

    Raises:
        FileNotFoundError: If no transcript file exists

    Example:
        >>> await get_transcript_path("meeting", "/transcripts", "/transcripts_edited")
        '/transcripts_edited/meeting.json'
    """
    edited_path = os.path.join(transcript_edited_dir, f"{base_name}.json")
    original_path = os.path.join(transcript_dir, f"{base_name}.json")

    # Check edited version first
    if await aiofiles.os.path.exists(edited_path):
        return edited_path

    # Fall back to original
    if await aiofiles.os.path.exists(original_path):
        return original_path

    raise FileNotFoundError(f"No transcript found for {base_name}")
