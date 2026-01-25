"""
Markdown generation utilities for MeetMemo exports.

This module provides functions for generating Markdown documents
for meeting summaries and transcripts.
"""
from datetime import datetime
from io import BytesIO

from config import Settings, get_settings
from utils.formatters import format_speaker_name, format_timestamp


def generate_summary_markdown(
    meeting_title: str,
    summary_content: str,
    transcript_data: list,
    generated_on: str = None,
    settings: Settings = None
) -> BytesIO:
    """
    Generate a Markdown document with summary and transcript.

    Args:
        meeting_title: Meeting title/filename
        summary_content: Summary text (already in markdown format)
        transcript_data: List of transcript segments
        generated_on: Optional formatted timestamp string
        settings: Optional Settings instance for timezone

    Returns:
        BytesIO buffer containing the Markdown content

    Example:
        >>> transcript = [
        ...     {'speaker': 'SPEAKER_00', 'text': 'Hello', 'start': '0.00', 'end': '1.00'}
        ... ]
        >>> md_buffer = generate_summary_markdown('Team Meeting', '## Key Points', transcript)
    """
    if settings is None:
        settings = get_settings()

    # Get timestamp
    if not generated_on:
        generated_on = datetime.now(settings.timezone).strftime('%B %d, %Y at %I:%M %p')

    # Build markdown content
    markdown_content = f"# {meeting_title}\n\n"
    markdown_content += f"*Generated on {generated_on}*\n\n"

    # Summary section
    if summary_content:
        markdown_content += f"## Summary\n\n{summary_content}\n\n"

    # Transcript section
    if transcript_data:
        markdown_content += "## Transcript\n\n"
        for entry in transcript_data:
            speaker = format_speaker_name(entry.get('speaker', 'Unknown Speaker'))
            text = entry.get('text', '')
            start_time = format_timestamp(entry.get('start', '0.00'))
            end_time = format_timestamp(entry.get('end', '0.00'))
            markdown_content += f"**{speaker}** *({start_time} - {end_time})*: {text}\n\n"

    # Return as BytesIO buffer
    return BytesIO(markdown_content.encode('utf-8'))


def generate_transcript_markdown(
    meeting_title: str,
    transcript_data: list,
    generated_on: str = None,
    settings: Settings = None
) -> BytesIO:
    """
    Generate a transcript-only Markdown document (no AI summary).

    Args:
        meeting_title: Meeting title/filename
        transcript_data: List of transcript segments
        generated_on: Optional formatted timestamp string
        settings: Optional Settings instance for timezone

    Returns:
        BytesIO buffer containing the Markdown content

    Example:
        >>> transcript = [
        ...     {'speaker': 'SPEAKER_00', 'text': 'Hello', 'start': '0.00', 'end': '1.00'}
        ... ]
        >>> md_buffer = generate_transcript_markdown('Team Meeting', transcript)
    """
    if settings is None:
        settings = get_settings()

    # Get timestamp
    if not generated_on:
        generated_on = datetime.now(settings.timezone).strftime('%B %d, %Y at %I:%M %p')

    # Build markdown content
    markdown_content = f"# {meeting_title}\n\n"
    markdown_content += f"*Generated on {generated_on}*\n\n"
    markdown_content += "## Transcript\n\n"

    # Transcript section
    if transcript_data:
        for entry in transcript_data:
            speaker = format_speaker_name(entry.get('speaker', 'Unknown Speaker'))
            text = entry.get('text', '')
            start_time = format_timestamp(entry.get('start', '0.00'))
            end_time = format_timestamp(entry.get('end', '0.00'))
            markdown_content += f"**{speaker}** *({start_time} - {end_time})*: {text}\n\n"

    # Return as BytesIO buffer
    return BytesIO(markdown_content.encode('utf-8'))
