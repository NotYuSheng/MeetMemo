"""
Text formatting utilities.

This module provides functions for formatting speaker names, transcripts,
and generating professional filenames.
"""
import json
import re
from datetime import datetime


def format_result(diarized: list) -> list[dict]:
    """
    Format diarized results into a list of dictionaries.

    Each dict contains speaker, text, start, and end time.

    Args:
        diarized: List of tuples (segment, speaker, utterance)

    Returns:
        List of formatted transcript segments

    Example:
        >>> segments = [(Segment(0, 5), "SPEAKER_00", "Hello")]
        >>> format_result(segments)
        [{'speaker': 'SPEAKER_00', 'text': 'Hello', 'start': '0.00', 'end': '5.00'}]
    """
    full_transcript = []
    for segment, speaker, utterance in diarized:
        full_transcript.append({
            "speaker": speaker,
            "text": utterance.strip(),
            "start": f"{segment.start:.2f}",
            "end": f"{segment.end:.2f}",
        })
    return full_transcript


def format_timestamp(seconds_str: str) -> str:
    """
    Format timestamp from seconds to MM:SS format.

    Args:
        seconds_str: Time in seconds as string (e.g., "65.50")

    Returns:
        Formatted timestamp in MM:SS format (e.g., "1:05")

    Example:
        >>> format_timestamp("65.50")
        '1:05'
        >>> format_timestamp("5.25")
        '0:05'
    """
    try:
        total_seconds = max(0, int(float(seconds_str)))
        minutes, seconds = divmod(total_seconds, 60)
        return f"{minutes}:{seconds:02d}"
    except (ValueError, TypeError):
        return "0:00"


def format_speaker_name(speaker_name: str) -> str:
    """
    Format speaker name from SPEAKER_XX format to 'Speaker X' format.

    If the speaker name doesn't match SPEAKER_XX pattern, return as-is.

    Args:
        speaker_name: Raw speaker name (e.g., "SPEAKER_00" or "John Doe")

    Returns:
        Formatted speaker name

    Example:
        >>> format_speaker_name("SPEAKER_00")
        'Speaker 1'
        >>> format_speaker_name("John Doe")
        'John Doe'
    """
    if not speaker_name:
        return "Speaker 1"

    match = re.match(r'^SPEAKER_(\d+)$', speaker_name)
    if match:
        speaker_number = int(match.group(1)) + 1
        return f"Speaker {speaker_number}"

    return speaker_name


def format_transcript_for_llm(transcript_json: str) -> str:
    """
    Format transcript JSON for LLM consumption with proper speaker names.

    Converts SPEAKER_XX format to 'Speaker X' format while preserving
    manual renames.

    Args:
        transcript_json: JSON string of transcript data

    Returns:
        Formatted transcript text for LLM input

    Example:
        >>> json_str = '[{"speaker": "SPEAKER_00", "text": "Hello"}]'
        >>> format_transcript_for_llm(json_str)
        'Speaker 1: Hello'
    """
    try:
        transcript_data = json.loads(transcript_json)
        formatted_lines = []

        for entry in transcript_data:
            raw_speaker = entry.get('speaker', 'Unknown Speaker')
            formatted_speaker = format_speaker_name(raw_speaker)
            text = entry.get('text', '').strip()

            if text:
                formatted_lines.append(f"{formatted_speaker}: {text}")

        return "\n\n".join(formatted_lines)
    except json.JSONDecodeError:
        return transcript_json


def generate_professional_filename(
    meeting_title: str,
    file_type: str,
    include_date: bool = True
) -> str:
    """
    Generate a professional filename for export files.

    Args:
        meeting_title: The meeting title/filename
        file_type: The file type (pdf, markdown, json)
        include_date: Whether to include date in filename

    Returns:
        A professional filename string

    Example:
        >>> generate_professional_filename("Team Meeting.wav", "pdf", True)
        'team-meeting_summary_2025-01-05.pdf'
    """
    # Clean the meeting title for filename use
    clean_title = (meeting_title or "meeting")

    # Remove audio file extensions if present
    clean_title = re.sub(
        r'\.(wav|mp3|mp4|m4a|flac|webm)$',
        '',
        clean_title,
        flags=re.IGNORECASE
    )

    # Replace invalid filename characters
    clean_title = re.sub(r'[<>:"/\\|?*]', '', clean_title)
    clean_title = re.sub(r'\s+', '-', clean_title)
    clean_title = clean_title.strip('-')
    clean_title = clean_title[:50].lower()

    # Add date if requested
    date_str = datetime.now().strftime('%Y-%m-%d') if include_date else ''

    # Generate filename based on type
    if file_type == 'pdf':
        base_name = f"{clean_title}_summary"
    elif file_type == 'markdown':
        base_name = f"{clean_title}_summary"
    elif file_type == 'json':
        base_name = f"{clean_title}_transcript"
    else:
        base_name = f"{clean_title}_export"

    # Combine with date and extension
    if date_str:
        return f"{base_name}_{date_str}.{file_type}"
    return f"{base_name}.{file_type}"
