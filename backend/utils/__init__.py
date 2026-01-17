"""
Utility functions and helpers.

This module provides common utilities for formatting, file operations,
and PDF/Markdown generation.
"""
from .file_utils import calculate_file_hash, convert_to_wav, get_unique_filename
from .formatters import (
    format_result,
    format_speaker_name,
    format_transcript_for_llm,
    generate_professional_filename,
)
from .markdown_generator import generate_summary_markdown, generate_transcript_markdown
from .pdf_generator import generate_summary_pdf, generate_transcript_pdf

__all__ = [
    # Formatters
    'format_result',
    'format_speaker_name',
    'format_transcript_for_llm',
    'generate_professional_filename',
    # File utils
    'get_unique_filename',
    'calculate_file_hash',
    'convert_to_wav',
    # PDF generation
    'generate_summary_pdf',
    'generate_transcript_pdf',
    # Markdown generation
    'generate_summary_markdown',
    'generate_transcript_markdown',
]
