"""
FastAPI application for audio transcription and speaker diarization.

Refactored version addressing all critical security, performance, and design issues.
"""
import hashlib
import json
import logging
import os
import re
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from threading import Thread
from typing import Optional

import aiofiles
import aiofiles.os
import asyncio
import httpx
import torch
import whisper
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pyannote.audio import Pipeline
from pydub import AudioSegment
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus.frames import Frame
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from svglib.svglib import svg2rlg

from pyannote_whisper.utils import diarize_text

# Import new modules
from database import (
    init_database, close_database, add_job, update_status, update_progress, update_error,
    get_job, get_all_jobs, get_jobs_count, delete_job, update_file_name,
    cleanup_old_jobs, add_export_job, get_export_job, update_export_status,
    update_export_progress, update_export_error, update_export_file_path,
    cleanup_old_export_jobs, get_job_by_hash,
    # New workflow functions
    update_workflow_state, update_step_progress, save_transcription_data,
    save_diarization_data, get_transcription_data, get_diarization_data
)
from security import sanitize_filename, validate_uuid_format, sanitize_log_data
from models import (
    SpeakerNameMapping, TranscriptUpdateRequest, SummarizeRequest,
    SpeakerIdentificationRequest, RenameJobRequest, ExportRequest,
    CreateExportRequest, JobResponse, JobStatusResponse, FileNameResponse,
    TranscriptResponse, SummaryResponse, DeleteResponse, RenameResponse,
    SpeakerUpdateResponse, SpeakerIdentificationResponse, JobListResponse,
    ExportJobResponse, ExportJobStatusResponse,
    # New workflow models
    WorkflowActionResponse, TranscriptionDataResponse, DiarizationDataResponse
)

# Load environment variables
load_dotenv('.env')

# Configure logging
os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    filename='logs/app.log',
    filemode='a',
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Validate required environment variables
REQUIRED_ENV_VARS = {
    'HF_TOKEN': 'Hugging Face token for PyAnnote models',
    'LLM_API_URL': 'LLM endpoint for summarization',
    'LLM_MODEL_NAME': 'LLM model identifier'
}

missing_vars = []
for var, description in REQUIRED_ENV_VARS.items():
    if not os.getenv(var):
        missing_vars.append(f"  - {var}: {description}")

if missing_vars:
    error_message = (
        "\n╔════════════════════════════════════════════════════════════════╗\n"
        "║ ERROR: Missing Required Environment Variables                 ║\n"
        "╚════════════════════════════════════════════════════════════════╝\n"
        "\nThe following environment variables are required but not set:\n\n"
        + "\n".join(missing_vars) +
        "\n\nPlease ensure these variables are defined in your .env file.\n"
        "See CLAUDE.md for more information on configuration.\n"
    )
    logger.error(error_message)
    raise EnvironmentError(error_message)

# Log warning for optional env vars
if not os.getenv('LLM_API_KEY'):
    logger.warning("LLM_API_KEY is not set. LLM requests will be made without authentication.")

# Timezone Configuration
try:
    timezone_offset_str = os.getenv('TIMEZONE_OFFSET', '+8')
    # Parse timezone offset (e.g., "+8", "-5", "0")
    timezone_offset_hours = float(timezone_offset_str)
    tz_configured = timezone(timedelta(hours=timezone_offset_hours))
    logger.info("Timezone configured: GMT%s (%s hours)", timezone_offset_str, timezone_offset_hours)
except (ValueError, TypeError) as e:
    logger.warning(
        "Invalid TIMEZONE_OFFSET '%s', using default GMT+8. Error: %s",
        os.getenv('TIMEZONE_OFFSET'),
        e
    )
    tz_configured = timezone(timedelta(hours=8))

# Constants
UPLOAD_DIR = "audiofiles"
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
ALLOWED_AUDIO_TYPES = [
    'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
    'audio/webm', 'audio/flac', 'audio/ogg'
]

# Ensure required directories exist
os.makedirs("transcripts", exist_ok=True)
os.makedirs("transcripts/edited", exist_ok=True)
os.makedirs("summary", exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Initialize FastAPI app with versioning
app = FastAPI(
    title="MeetMemo API",
    version="1.0.0",
    description="Audio transcription and speaker diarization API"
)

# CORS Configuration - wildcard for trusted VPN network
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

# HTTP client for async LLM calls
http_client: Optional[httpx.AsyncClient] = None

# Cached models
_whisper_model_cache = {}
_pyannote_pipeline_cache = None


##################################### Utility Functions #####################################

def get_timestamp() -> str:
    """Gets the current date & time in the `YYYY-MM-DD H:MM:SS` format."""
    return datetime.now(tz_configured).strftime("%Y-%m-%d %H:%M:%S")


def format_result(diarized: list) -> list[dict]:
    """
    Formats the diarized results into a list of dictionaries,
    each with speaker, text, start, and end time.

    Args:
        diarized: list of tuples (segment, speaker, utterance)

    Returns:
        List of formatted transcript segments
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


def format_speaker_name(speaker_name: str) -> str:
    """
    Format speaker name from SPEAKER_XX format to 'Speaker X' format.
    If the speaker name doesn't match SPEAKER_XX pattern, return as-is.
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
    Converts SPEAKER_XX format to 'Speaker X' format while preserving manual renames.
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


def get_unique_filename(directory: str, desired_filename: str, exclude_path: str = None) -> str:
    """
    Generate a unique filename by appending " (Copy)" if needed.

    Args:
        directory: Directory to check for existing files
        desired_filename: The desired filename
        exclude_path: Optional path to exclude from collision check

    Returns:
        A unique filename
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
    """
    # Clean the meeting title for filename use
    clean_title = (meeting_title or "meeting")

    # Remove audio file extensions if present
    clean_title = re.sub(r'\.(wav|mp3|mp4|m4a|flac|webm)$', '', clean_title, flags=re.IGNORECASE)

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
    else:
        return f"{base_name}.{file_type}"


async def upload_audio(job_uuid: str, file: UploadFile) -> tuple[str, str]:
    """
    Uploads the audio file to the desired directory with validation.

    Args:
        job_uuid: UUID for the job
        file: Uploaded file

    Returns:
        Tuple of (filename, file_hash)

    Raises:
        HTTPException: If file is invalid
    """
    # Validate file size and collect chunks
    file_size = 0
    chunks = []

    chunk = await file.read(8192)
    while chunk:
        file_size += len(chunk)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024:.0f}MB"
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

    filename = get_unique_filename(UPLOAD_DIR, safe_filename)
    file_path = os.path.join(UPLOAD_DIR, filename)

    # Save the file to disk (async)
    async with aiofiles.open(file_path, "wb") as buffer:
        for chunk in chunks:
            await buffer.write(chunk)

    return filename, file_hash


def convert_to_wav(input_path: str, output_path: str, sample_rate: int = 16000):
    """Convert audio file to WAV format."""
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_frame_rate(sample_rate).set_channels(1)
    audio.export(output_path, format="wav")


def calculate_file_hash(chunks: list[bytes]) -> str:
    """
    Calculate SHA256 hash of file content from chunks.

    Args:
        chunks: List of file content chunks

    Returns:
        Hexadecimal SHA256 hash string
    """
    sha256_hash = hashlib.sha256()
    for chunk in chunks:
        sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


##################################### Model Loading #####################################

@lru_cache(maxsize=2)
def get_whisper_model(model_name: str):
    """
    Cache loaded Whisper models.

    Args:
        model_name: Name of the Whisper model

    Returns:
        Loaded Whisper model
    """
    logger.info("Loading Whisper model: %s", model_name)
    model = whisper.load_model(model_name)
    model = model.to(DEVICE)
    logger.info("Whisper model %s loaded successfully on %s", model_name, DEVICE)
    return model


def get_pyannote_pipeline():
    """
    Get cached PyAnnote pipeline.

    Returns:
        PyAnnote speaker diarization pipeline
    """
    global _pyannote_pipeline_cache

    if _pyannote_pipeline_cache is None:
        logger.info("Loading PyAnnote speaker diarization pipeline")
        hf_token = os.getenv("HF_TOKEN")
        _pyannote_pipeline_cache = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )
        _pyannote_pipeline_cache = _pyannote_pipeline_cache.to(torch.device(DEVICE))
        logger.info("PyAnnote pipeline loaded successfully")

    return _pyannote_pipeline_cache


##################################### LLM Functions #####################################

async def summarise_transcript(
    transcript: str,
    custom_prompt: str = None,
    system_prompt: str = None
) -> str:
    """
    Summarises the transcript using a defined LLM (async version).

    Args:
        transcript: The transcript text to summarize
        custom_prompt: Optional custom user prompt
        system_prompt: Optional custom system prompt

    Returns:
        Summary text
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

    base_url = str(os.getenv("LLM_API_URL"))
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    model_name = str(os.getenv("LLM_MODEL_NAME"))

    # Default prompts
    default_system_prompt = (
        "You are a helpful assistant that summarizes meeting transcripts. "
        "You will give a concise summary of the key points, decisions made, and any action items, "
        "outputting it in markdown format. "
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
        api_key = os.getenv("LLM_API_KEY")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        response = await http_client.post(url, headers=headers, json=payload, timeout=60.0)
        response.raise_for_status()
        data = response.json()
        summary = data["choices"][0]["message"]["content"].strip()
        return summary

    except httpx.HTTPError as e:
        logger.error("LLM service error: %s", e)
        raise HTTPException(status_code=503, detail="Summary service temporarily unavailable")


async def identify_speakers_with_llm(transcript: str, context: str = None) -> dict:
    """
    Use LLM to identify and suggest names for speakers in the transcript (async version).

    Args:
        transcript: The formatted transcript text with speakers
        context: Optional context about the meeting

    Returns:
        dict: Status and suggestions
    """
    base_url = str(os.getenv("LLM_API_URL"))
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    model_name = str(os.getenv("LLM_MODEL_NAME"))

    system_prompt = (
        "You are an expert at analyzing meeting transcripts to identify speakers. "
        "Use chain-of-thought reasoning to assess confidence. "
        "Only suggest identifications when you have strong evidence. "
        "IMPORTANT: Respond ONLY with a valid JSON object, no markdown formatting."
    )

    user_prompt = (
        "Please analyze the following meeting transcript using chain-of-thought reasoning.\n"
        "Respond ONLY with a JSON object in this format: "
        '{"Speaker 1": "John Smith", "Speaker 2": "Cannot be determined"}\n\n'
    )

    if context:
        user_prompt += f"Additional context: {context}\n\n"

    user_prompt += f"Transcript:\n{transcript}"

    payload = {
        "model": model_name,
        "temperature": 0.1,
        "max_tokens": 1000,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    try:
        headers = {"Content-Type": "application/json"}
        api_key = os.getenv("LLM_API_KEY")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        response = await http_client.post(url, headers=headers, json=payload, timeout=60.0)
        response.raise_for_status()
        data = response.json()
        response_text = data["choices"][0]["message"]["content"].strip()

        logger.info("LLM speaker identification response: %s", sanitize_log_data(response_text))

        # Parse JSON response
        try:
            speaker_suggestions = json.loads(response_text)
            return {"status": "success", "suggestions": speaker_suggestions}
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code block
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            if json_match:
                try:
                    speaker_suggestions = json.loads(json_match.group(1))
                    return {"status": "success", "suggestions": speaker_suggestions}
                except json.JSONDecodeError:
                    pass

            # Look for JSON object without code blocks
            json_match = re.search(r'\{.*?\}', response_text, re.DOTALL)
            if json_match:
                try:
                    speaker_suggestions = json.loads(json_match.group(0))
                    return {"status": "success", "suggestions": speaker_suggestions}
                except json.JSONDecodeError:
                    pass

            return {
                "status": "error",
                "message": "Failed to parse LLM response as JSON",
                "raw_response": response_text[:200]
            }

    except httpx.HTTPError as e:
        logger.error("LLM request failed: %s", e)
        return {"status": "error", "message": f"LLM request failed: {str(e)}"}


##################################### PDF Generation #####################################

def generate_professional_pdf(
    summary_data: dict,
    transcript_data: list,
    generated_on: str = None
) -> BytesIO:
    """Generate a professional PDF using ReportLab."""
    buffer = BytesIO()

    # Custom document class with footer
    class FooterDocTemplate(BaseDocTemplate):
        def __init__(self, filename, **kwargs):
            BaseDocTemplate.__init__(self, filename, **kwargs)

        def afterPage(self):
            """Add footer to every page"""
            self.canv.saveState()

            footer_text = (
                "Generated by MeetMemo AI - This content is AI-generated "
                "and may contain inaccuracies."
            )
            page_number_text = f"Page {self.page}"

            self.canv.setFont('Helvetica', 8)
            self.canv.setFillColor(colors.HexColor('#7f8c8d'))

            text_width = self.canv.stringWidth(footer_text, 'Helvetica', 8)
            self.canv.drawString((A4[0] - text_width) / 2, 30, footer_text)

            page_text_width = self.canv.stringWidth(page_number_text, 'Helvetica', 8)
            self.canv.drawString(A4[0] - inch - page_text_width, 50, page_number_text)

            self.canv.restoreState()

    doc = FooterDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch*1.2,
        title=summary_data.get('meetingTitle', 'MeetMemo Meeting Report'),
        author='MeetMemo AI'
    )

    frame = Frame(inch, inch*1.2, A4[0] - 2*inch, A4[1] - 2.2*inch, id='normal')
    template = PageTemplate(id='normal', frames=frame)
    doc.addPageTemplates([template])

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=30,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#2c3e50')
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=12,
        spaceBefore=20,
        textColor=colors.HexColor('#2980b9'),
        borderWidth=1,
        borderColor=colors.HexColor('#2980b9'),
        borderPadding=5,
        backColor=colors.HexColor('#ecf0f1')
    )

    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=11,
        spaceAfter=6,
        alignment=TA_JUSTIFY
    )

    speaker_style = ParagraphStyle(
        'SpeakerStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#e74c3c'),
        spaceBefore=8,
        fontName='Helvetica-Bold'
    )

    transcript_style = ParagraphStyle(
        'TranscriptStyle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=4,
        leftIndent=20,
        alignment=TA_JUSTIFY
    )

    story = []

    # Header
    try:
        logo_path = os.path.join(os.path.dirname(__file__), 'meetmemo-logo.svg')
        if os.path.exists(logo_path):
            drawing = svg2rlg(logo_path)
            scale_factor = 40 / drawing.height
            drawing.width *= scale_factor
            drawing.height *= scale_factor
            drawing.scale(scale_factor, scale_factor)

            header_data = [[drawing, "MeetMemo AI Summary"]]
            header_table = Table(header_data, colWidths=[60, 5*inch])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                ('ALIGN', (1, 0), (1, 0), 'LEFT'),
                ('FONTNAME', (1, 0), (1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (1, 0), (1, 0), 20),
                ('TEXTCOLOR', (1, 0), (1, 0), colors.HexColor('#2c3e50')),
                ('LEFTPADDING', (1, 0), (1, 0), 15),
            ]))
            story.append(header_table)
        else:
            story.append(Paragraph("MeetMemo", title_style))
    except Exception:
        story.append(Paragraph("MeetMemo", title_style))

    story.append(Spacer(1, 20))

    # Meeting Info
    if summary_data:
        story.append(Paragraph("Meeting Information", heading_style))

        meeting_info = [
            ['File Name:', summary_data.get('meetingTitle', 'Untitled Meeting')],
            [
                'Generated On:',
                generated_on or datetime.now(tz_configured).strftime(
                    '%B %d, %Y at %I:%M %p'
                )
            ],
            ['Document Type:', 'Meeting Summary & Transcript']
        ]

        info_table = Table(meeting_info, colWidths=[2*inch, 4*inch])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8f9fa')),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#495057')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dee2e6')),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
        ]))

        story.append(info_table)
        story.append(Spacer(1, 20))

        # Summary Section
        story.append(Paragraph("Summary", heading_style))
        summary_text = summary_data.get('summary', 'No summary available')

        # Process markdown
        def process_markdown_text(text):
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
            text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<i>\1</i>', text)
            return text

        summary_lines = summary_text.rstrip().split('\n')
        while summary_lines and not summary_lines[-1].strip():
            summary_lines.pop()

        for line in summary_lines:
            line = line.strip()
            if not line:
                story.append(Spacer(1, 6))
                continue

            if line.startswith('# '):
                continue
            elif line.startswith('### ') or line.startswith('## '):
                prefix_len = 4 if line.startswith('### ') else 3
                sub_heading = process_markdown_text(line[prefix_len:])
                story.append(Paragraph(f"• {sub_heading}", ParagraphStyle(
                    'SubHeading', parent=body_style, fontSize=12,
                    textColor=colors.HexColor('#2980b9'), fontName='Helvetica-Bold'
                )))
            elif line.startswith('- ') or line.startswith('* '):
                bullet_text = process_markdown_text(line[2:])
                story.append(Paragraph(f"  ◦ {bullet_text}", body_style))
            else:
                processed_line = process_markdown_text(line)
                story.append(Paragraph(processed_line, body_style))

    # Transcript Section
    if transcript_data:
        story.append(PageBreak())
        story.append(Paragraph("Full Transcript", heading_style))
        story.append(Spacer(1, 10))

        for entry in transcript_data:
            speaker = format_speaker_name(entry.get('speaker', 'Unknown Speaker'))
            text = entry.get('text', '')
            start_time = entry.get('start', '0.00')
            end_time = entry.get('end', '0.00')

            timestamp_text = f"[{start_time}s - {end_time}s]"
            speaker_line = f"<b>{speaker}</b> {timestamp_text}"
            story.append(Paragraph(speaker_line, speaker_style))
            story.append(Paragraph(text, transcript_style))
            story.append(Spacer(1, 8))

    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_transcript_pdf(
    meeting_title: str,
    transcript_data: list,
    generated_on: str = None
) -> BytesIO:
    """Generate a transcript-only PDF (no AI summary)."""
    buffer = BytesIO()

    # Custom document class with footer
    class FooterDocTemplate(BaseDocTemplate):
        def __init__(self, filename, **kwargs):
            BaseDocTemplate.__init__(self, filename, **kwargs)

        def afterPage(self):
            """Add footer to every page"""
            self.canv.saveState()

            footer_text = "Generated by MeetMemo"
            page_number_text = f"Page {self.page}"

            self.canv.setFont('Helvetica', 8)
            self.canv.setFillColor(colors.HexColor('#7f8c8d'))

            text_width = self.canv.stringWidth(footer_text, 'Helvetica', 8)
            self.canv.drawString((A4[0] - text_width) / 2, 30, footer_text)

            page_text_width = self.canv.stringWidth(page_number_text, 'Helvetica', 8)
            self.canv.drawString(A4[0] - inch - page_text_width, 50, page_number_text)

            self.canv.restoreState()

    doc = FooterDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch*1.2,
        title=meeting_title or 'MeetMemo Meeting Transcript',
        author='MeetMemo'
    )

    frame = Frame(inch, inch*1.2, A4[0] - 2*inch, A4[1] - 2.2*inch, id='normal')
    template = PageTemplate(id='normal', frames=frame)
    doc.addPageTemplates([template])

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=30,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#2c3e50')
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=12,
        spaceBefore=20,
        textColor=colors.HexColor('#2980b9'),
        borderWidth=1,
        borderColor=colors.HexColor('#2980b9'),
        borderPadding=5,
        backColor=colors.HexColor('#ecf0f1')
    )

    speaker_style = ParagraphStyle(
        'SpeakerStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#e74c3c'),
        spaceBefore=8,
        fontName='Helvetica-Bold'
    )

    transcript_style = ParagraphStyle(
        'TranscriptStyle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=4,
        leftIndent=20,
        alignment=TA_JUSTIFY
    )

    story = []

    # Header
    try:
        logo_path = os.path.join(os.path.dirname(__file__), 'meetmemo-logo.svg')
        if os.path.exists(logo_path):
            drawing = svg2rlg(logo_path)
            scale_factor = 40 / drawing.height
            drawing.width *= scale_factor
            drawing.height *= scale_factor
            drawing.scale(scale_factor, scale_factor)

            header_data = [[drawing, "MeetMemo Transcript"]]
            header_table = Table(header_data, colWidths=[60, 5*inch])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                ('ALIGN', (1, 0), (1, 0), 'LEFT'),
                ('FONTNAME', (1, 0), (1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (1, 0), (1, 0), 20),
                ('TEXTCOLOR', (1, 0), (1, 0), colors.HexColor('#2c3e50')),
                ('LEFTPADDING', (1, 0), (1, 0), 15),
            ]))
            story.append(header_table)
        else:
            story.append(Paragraph("MeetMemo", title_style))
    except Exception:
        story.append(Paragraph("MeetMemo", title_style))

    story.append(Spacer(1, 20))

    # Meeting Info
    story.append(Paragraph("Meeting Information", heading_style))

    meeting_info = [
        ['File Name:', meeting_title or 'Untitled Meeting'],
        [
            'Generated On:',
            generated_on or datetime.now(tz_configured).strftime(
                '%B %d, %Y at %I:%M %p'
            )
        ],
        ['Document Type:', 'Meeting Transcript']
    ]

    info_table = Table(meeting_info, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8f9fa')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#495057')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (1, 0), (1, -1), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dee2e6')),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))

    story.append(info_table)
    story.append(Spacer(1, 20))

    # Transcript Section
    if transcript_data:
        story.append(Paragraph("Full Transcript", heading_style))
        story.append(Spacer(1, 10))

        for entry in transcript_data:
            speaker = format_speaker_name(entry.get('speaker', 'Unknown Speaker'))
            text = entry.get('text', '')
            start_time = entry.get('start', '0.00')
            end_time = entry.get('end', '0.00')

            timestamp_text = f"[{start_time}s - {end_time}s]"
            speaker_line = f"<b>{speaker}</b> {timestamp_text}"
            story.append(Paragraph(speaker_line, speaker_style))
            story.append(Paragraph(text, transcript_style))
            story.append(Spacer(1, 8))

    doc.build(story)
    buffer.seek(0)
    return buffer


##################################### Cleanup Scheduler #####################################

async def cleanup_expired_files():
    """Clean up files older than 12 hours."""
    try:
        # Clean up orphaned non-WAV files (files that were uploaded but not converted)
        # These might be left over from failed conversions
        try:
            all_files = await aiofiles.os.listdir(UPLOAD_DIR)
            for filename in all_files:
                # Skip WAV files - those are tracked in the database
                if filename.lower().endswith('.wav'):
                    continue

                file_path = os.path.join(UPLOAD_DIR, filename)
                # Check if file is a regular file
                if await aiofiles.os.path.isfile(file_path):
                    # Get file age
                    stat_info = await aiofiles.os.stat(file_path)
                    file_age_hours = (time.time() - stat_info.st_mtime) / 3600

                    # Remove non-WAV files older than 1 hour
                    # (likely orphaned from failed conversions)
                    if file_age_hours > 1:
                        try:
                            await aiofiles.os.remove(file_path)
                            logger.info(
                                "Removed orphaned file: %s (age: %.1fh)",
                                filename,
                                file_age_hours
                            )
                        except Exception as e:
                            logger.warning("Failed to remove orphaned file %s: %s", filename, e)
        except Exception as e:
            logger.warning("Failed to clean orphaned files: %s", e)

        # Get expired jobs from database
        expired_jobs = await cleanup_old_jobs(max_age_hours=12)

        if not expired_jobs:
            return

        removed_count = 0

        for job in expired_jobs:
            job_uuid = job['uuid']
            file_name = job['file_name']

            # Remove audio file
            audio_path = os.path.join(UPLOAD_DIR, file_name)
            if await aiofiles.os.path.exists(audio_path):
                try:
                    await aiofiles.os.remove(audio_path)
                    removed_count += 1
                except Exception as e:
                    logger.warning("Failed to remove audio file %s: %s", audio_path, e)

            # Remove transcript files
            transcript_path = os.path.join("transcripts", f"{file_name}.json")
            if await aiofiles.os.path.exists(transcript_path):
                try:
                    await aiofiles.os.remove(transcript_path)
                    removed_count += 1
                except Exception as e:
                    logger.warning("Failed to remove transcript %s: %s", transcript_path, e)

            edited_transcript_path = os.path.join("transcripts", "edited", f"{file_name}.json")
            if await aiofiles.os.path.exists(edited_transcript_path):
                try:
                    await aiofiles.os.remove(edited_transcript_path)
                    removed_count += 1
                except Exception as e:
                    logger.warning("Failed to remove edited transcript: %s", e)

            # Remove summary file
            summary_path = os.path.join("summary", f"{job_uuid}.txt")
            if await aiofiles.os.path.exists(summary_path):
                try:
                    await aiofiles.os.remove(summary_path)
                    removed_count += 1
                except Exception as e:
                    logger.warning("Failed to remove summary: %s", e)

        logger.info("Cleaned up %s files from %s expired jobs", removed_count, len(expired_jobs))

        # Cleanup old export jobs (older than 24 hours)
        old_exports = await cleanup_old_export_jobs(max_age_hours=24)

        if old_exports:
            export_removed_count = 0
            for export in old_exports:
                file_path = export.get('file_path')
                if file_path and await aiofiles.os.path.exists(file_path):
                    try:
                        await aiofiles.os.remove(file_path)
                        export_removed_count += 1
                    except Exception as e:
                        logger.warning("Failed to remove export file %s: %s", file_path, e)

            logger.info(
                "Cleaned up %s export files from %s old export jobs",
                export_removed_count,
                len(old_exports)
            )

    except Exception as e:
        logger.error("Error during file cleanup: %s", e, exc_info=True)


def start_cleanup_scheduler():
    """Start background cleanup thread."""
    async def cleanup_worker():
        import asyncio
        while True:
            try:
                await cleanup_expired_files()
                await asyncio.sleep(3600)  # Sleep for 1 hour
            except Exception as e:
                logger.error("Error in cleanup worker: %s", e, exc_info=True)
                await asyncio.sleep(600)  # Sleep for 10 minutes on error

    def run_async_cleanup():
        import asyncio
        asyncio.run(cleanup_worker())

    cleanup_thread = Thread(target=run_async_cleanup, daemon=True)
    cleanup_thread.start()
    logger.info("Started file cleanup scheduler")


##################################### App Events #####################################

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    global http_client

    logger.info("Starting MeetMemo API...")

    # Initialize database (NOW ASYNC)
    await init_database()

    # Initialize HTTP client
    http_client = httpx.AsyncClient(timeout=120.0)

    # Preload Whisper model
    try:
        get_whisper_model("turbo")
        logger.info("Whisper model preloaded successfully")
    except Exception as e:
        logger.error("Failed to preload Whisper model: %s", e)

    # Preload PyAnnote pipeline
    try:
        get_pyannote_pipeline()
        logger.info("PyAnnote pipeline preloaded successfully")
    except Exception as e:
        logger.error("Failed to preload PyAnnote pipeline: %s", e)

    # Start cleanup scheduler
    start_cleanup_scheduler()

    logger.info("MeetMemo API startup complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    global http_client

    if http_client:
        await http_client.aclose()

    # Close database pool
    await close_database()

    logger.info("MeetMemo API shutdown complete")


##################################### API Routes - v1 #####################################

@app.get("/api/v1/jobs", response_model=JobListResponse)
async def get_jobs(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0)
) -> JobListResponse:
    """
    Get paginated list of all jobs.

    Args:
        limit: Maximum number of jobs to return
        offset: Number of jobs to skip

    Returns:
        Paginated job list
    """
    try:
        jobs_list = await get_all_jobs(limit=limit, offset=offset)
        total = await get_jobs_count()

        # Convert to dict format expected by frontend
        jobs_dict = {}
        for job in jobs_list:
            jobs_dict[str(job['uuid'])] = {
                'file_name': job['file_name'],
                'status_code': job['status_code'],
                'created_at': job['created_at'].isoformat() if job.get('created_at') else None
            }

        return JobListResponse(
            jobs=jobs_dict,
            total=total,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error("Error retrieving job list: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error while retrieving job list"
        )

##################################### Independent Processing Functions #####################################

async def process_transcription_step(
    job_uuid: str,
    file_path: str,
    model_name: str = "turbo"
) -> None:
    """
    Independent transcription step using Whisper.

    Args:
        job_uuid: Job UUID
        file_path: Path to audio file
        model_name: Whisper model to use
    """
    try:
        await update_workflow_state(job_uuid, 'transcribing', 0)
        logger.info("Starting transcription for job %s", job_uuid)

        # Get cached model
        model = get_whisper_model(model_name)

        # Transcribe with optimized settings
        await update_step_progress(job_uuid, 10)
        asr = model.transcribe(
            file_path,
            language="en",
            fp16=True,
            beam_size=1,
            best_of=1,
            temperature=0.0,
            no_speech_threshold=0.6,
            logprob_threshold=-1.0,
            compression_ratio_threshold=2.4,
            condition_on_previous_text=False
        )

        await update_step_progress(job_uuid, 90)
        logger.info("Transcription complete for job %s", job_uuid)

        # Save transcription data to database
        transcription_data = {
            "text": asr.get("text", ""),
            "segments": asr.get("segments", []),
            "language": asr.get("language", "en")
        }
        await save_transcription_data(job_uuid, transcription_data)

        # Update state to transcribed
        await update_step_progress(job_uuid, 100)
        await update_workflow_state(job_uuid, 'transcribed', 100)
        logger.info("Transcription step completed for job %s", job_uuid)

    except Exception as e:
        error_msg = str(e)
        logger.error("Transcription failed for job %s: %s", job_uuid, error_msg, exc_info=True)
        await update_error(job_uuid, f"Transcription failed: {error_msg}")
        await update_workflow_state(job_uuid, 'error', 0)


async def process_diarization_step(job_uuid: str, file_path: str) -> None:
    """
    Independent diarization step using PyAnnote.

    Args:
        job_uuid: Job UUID
        file_path: Path to audio file
    """
    try:
        await update_workflow_state(job_uuid, 'diarizing', 0)
        logger.info("Starting diarization for job %s", job_uuid)

        # Get cached pipeline
        pipeline = get_pyannote_pipeline()

        # Diarize audio
        await update_step_progress(job_uuid, 10)
        diarization = pipeline(file_path)

        await update_step_progress(job_uuid, 90)
        logger.info("Diarization complete for job %s", job_uuid)

        # Convert diarization to serializable format
        diarization_data = {
            "speakers": [],
            "segments": []
        }

        for turn, _, speaker in diarization.itertracks(yield_label=True):
            diarization_data["segments"].append({
                "start": float(turn.start),
                "end": float(turn.end),
                "speaker": speaker
            })
            if speaker not in diarization_data["speakers"]:
                diarization_data["speakers"].append(speaker)

        # Save diarization data to database
        await save_diarization_data(job_uuid, diarization_data)

        # Update state to diarized
        await update_step_progress(job_uuid, 100)
        await update_workflow_state(job_uuid, 'diarized', 100)
        logger.info("Diarization step completed for job %s", job_uuid)

    except Exception as e:
        error_msg = str(e)
        logger.error("Diarization failed for job %s: %s", job_uuid, error_msg, exc_info=True)
        await update_error(job_uuid, f"Diarization failed: {error_msg}")
        await update_workflow_state(job_uuid, 'error', 0)


async def process_alignment_step(job_uuid: str, file_name: str) -> None:
    """
    Independent alignment step - combines transcription and diarization.

    Args:
        job_uuid: Job UUID
        file_name: File name for saving transcript
    """
    try:
        await update_workflow_state(job_uuid, 'aligning', 0)
        logger.info("Starting alignment for job %s", job_uuid)

        # Get transcription and diarization data
        await update_step_progress(job_uuid, 10)
        transcription_data = await get_transcription_data(job_uuid)
        diarization_data = await get_diarization_data(job_uuid)

        if not transcription_data:
            raise ValueError("Transcription data not found")
        if not diarization_data:
            raise ValueError("Diarization data not found")

        await update_step_progress(job_uuid, 30)

        # Convert back to pyannote format for diarize_text
        # This is a simplified version - we need to reconstruct the objects
        # For now, we'll create a simpler alignment

        # Align speakers with text segments
        await update_step_progress(job_uuid, 50)

        # Create aligned transcript
        aligned_transcript = []
        text_segments = transcription_data.get("segments", [])
        speaker_segments = diarization_data.get("segments", [])

        for text_seg in text_segments:
            seg_start = text_seg.get("start", 0)
            seg_end = text_seg.get("end", 0)
            seg_text = text_seg.get("text", "").strip()

            # Find overlapping speaker
            assigned_speaker = "SPEAKER_00"  # default
            max_overlap = 0

            for spk_seg in speaker_segments:
                spk_start = spk_seg["start"]
                spk_end = spk_seg["end"]

                # Calculate overlap
                overlap_start = max(seg_start, spk_start)
                overlap_end = min(seg_end, spk_end)
                overlap = max(0, overlap_end - overlap_start)

                if overlap > max_overlap:
                    max_overlap = overlap
                    assigned_speaker = spk_seg["speaker"]

            aligned_transcript.append({
                "speaker": assigned_speaker,
                "text": seg_text,
                "start": f"{seg_start:.2f}",
                "end": f"{seg_end:.2f}"
            })

        await update_step_progress(job_uuid, 80)

        # Save aligned transcript to file
        os.makedirs("transcripts", exist_ok=True)
        json_path = os.path.join("transcripts", f"{file_name}.json")
        json_str = json.dumps(aligned_transcript, indent=4)
        async with aiofiles.open(json_path, "w", encoding="utf-8") as f:
            await f.write(json_str)

        # Update state to completed
        await update_step_progress(job_uuid, 100)
        await update_workflow_state(job_uuid, 'completed', 100)
        await update_status(job_uuid, 200)
        logger.info("Alignment step completed for job %s", job_uuid)

    except Exception as e:
        error_msg = str(e)
        logger.error("Alignment failed for job %s: %s", job_uuid, error_msg, exc_info=True)
        await update_error(job_uuid, f"Alignment failed: {error_msg}")
        await update_workflow_state(job_uuid, 'error', 0)


async def process_export_job(
    export_uuid: str,
    job_uuid: str,
    export_type: str
) -> None:
    """
    Background task for PDF/Markdown export generation.

    Args:
        export_uuid: Export job UUID
        job_uuid: Parent job UUID
        export_type: Type of export (pdf or markdown)
    """
    try:
        await update_export_progress(export_uuid, 10)
        logger.info("Starting export job %s (%s) for job %s", export_uuid, export_type, job_uuid)

        # Ensure export directory exists
        export_dir = Path("exports")
        export_dir.mkdir(exist_ok=True)

        # Get job data
        job = await get_job(job_uuid)
        if not job:
            raise ValueError(f"Job {job_uuid} not found")

        file_name = job['file_name']

        # Get transcript
        await update_export_progress(export_uuid, 20)
        transcript_response = await get_transcript(job_uuid)
        full_transcript_json = transcript_response.full_transcript
        transcript_data = json.loads(full_transcript_json)

        # Get summary
        await update_export_progress(export_uuid, 40)
        try:
            summary_response = await get_summary(job_uuid, regenerate=False)
            summary = summary_response.summary
        except HTTPException:
            # No summary available
            summary = "No summary available."

        # Parse summary into structured data
        summary_data = {
            "key_points": [],
            "action_items": [],
            "decisions": [],
            "summary_text": summary
        }

        # Simple parsing - look for sections
        if "Key Points:" in summary or "key points:" in summary.lower():
            try:
                lines = summary.split('\n')
                in_key_points = False
                for line in lines:
                    if 'key point' in line.lower():
                        in_key_points = True
                        continue
                    if in_key_points and line.strip().startswith(('-', '•', '*', '1.', '2.')):
                        summary_data["key_points"].append(
                            line.strip().lstrip('-•* ').lstrip('0123456789. ')
                        )
                    elif (
                        in_key_points
                        and line.strip()
                        and not line.strip().startswith(('-', '•', '*'))
                    ):
                        in_key_points = False
            except Exception as e:
                logger.warning("Failed to parse summary structure: %s", e)

        await update_export_progress(export_uuid, 60)

        if export_type == "pdf":
            # Generate PDF in thread pool (CPU-bound operation)
            loop = asyncio.get_event_loop()
            pdf_buffer = await loop.run_in_executor(
                None,
                generate_professional_pdf,
                summary_data,
                transcript_data,
                datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            )

            await update_export_progress(export_uuid, 90)

            # Save PDF to file asynchronously
            file_path = export_dir / f"{export_uuid}.pdf"
            async with aiofiles.open(str(file_path), "wb") as f:
                await f.write(pdf_buffer.read())

        elif export_type == "markdown":
            # Generate Markdown
            markdown_content = f"# Meeting Transcript\n\n"
            markdown_content += f"**File:** {file_name}\n\n"
            generated_ts = datetime.now(timezone.utc).strftime(
                '%Y-%m-%d %H:%M:%S UTC'
            )
            markdown_content += f"**Generated:** {generated_ts}\n\n"

            if summary_data["key_points"]:
                markdown_content += f"## Summary\n\n"
                markdown_content += summary + "\n\n"

            markdown_content += f"## Transcript\n\n"
            for segment in transcript_data:
                speaker = segment.get('speaker', 'Unknown')
                text = segment.get('text', '')
                start = segment.get('start', '')
                markdown_content += f"**{speaker}** ({start}): {text}\n\n"

            await update_export_progress(export_uuid, 90)

            # Save Markdown to file asynchronously
            file_path = export_dir / f"{export_uuid}.md"
            async with aiofiles.open(str(file_path), "w", encoding="utf-8") as f:
                await f.write(markdown_content)

        # Update export job with file path and mark complete
        await update_export_file_path(export_uuid, str(file_path))
        await update_export_progress(export_uuid, 100)
        await update_export_status(export_uuid, 200)
        logger.info("Successfully completed export job %s", export_uuid)

    except Exception as e:
        error_msg = str(e)
        logger.error("Error processing export job %s: %s", export_uuid, error_msg, exc_info=True)
        try:
            await update_export_error(export_uuid, error_msg)
        except Exception:
            pass


@app.post("/api/v1/jobs", response_model=JobResponse, status_code=202)
async def create_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model_name: str = Query(default="turbo")
) -> JobResponse:
    """
    Create new transcription job by uploading audio file.
    Checks for duplicate files using hash comparison.
    Returns immediately with 202 status while processing in background.

    Args:
        background_tasks: FastAPI background tasks handler
        file: Audio file to transcribe
        model_name: Whisper model to use

    Returns:
        Job information with UUID and status (202 for new, 200 for duplicate)
    """
    job_uuid = str(uuid.uuid4())

    try:
        # Upload and validate file (calculates hash during upload)
        file_name, file_hash = await upload_audio(job_uuid, file)

        # Check if this file was already uploaded
        existing_job = await get_job_by_hash(file_hash)

        if existing_job:
            # File already exists - remove the newly uploaded file and return existing job
            file_path = os.path.join(UPLOAD_DIR, file_name)
            if await aiofiles.os.path.exists(file_path):
                await aiofiles.os.remove(file_path)

            logger.info(
                f"Duplicate file detected (hash: {file_hash[:16]}...). "
                f"Returning existing job {existing_job['uuid']}"
            )

            return JobResponse(
                uuid=str(existing_job['uuid']),
                file_name=existing_job['file_name'],
                status_code=existing_job['status_code']
            )

        # New file - proceed with normal processing
        file_path = os.path.join(UPLOAD_DIR, file_name)

        # Convert to WAV if needed
        if not file_name.lower().endswith(".wav"):
            wav_file_name = f"{os.path.splitext(file_name)[0]}.wav"
            wav_file_path = os.path.join(UPLOAD_DIR, wav_file_name)

            try:
                convert_to_wav(file_path, wav_file_path)

                # Delete the original file after successful conversion
                if await aiofiles.os.path.exists(file_path):
                    await aiofiles.os.remove(file_path)
                    logger.info("Removed original file after conversion: %s", file_name)

                file_path = wav_file_path
            except Exception as e:
                # If conversion fails, clean up WAV file (if partially created) and keep original
                logger.error("Audio conversion failed: %s", e, exc_info=True)
                if await aiofiles.os.path.exists(wav_file_path):
                    try:
                        await aiofiles.os.remove(wav_file_path)
                    except Exception:
                        pass
                raise HTTPException(status_code=500, detail=f"Audio conversion failed: {str(e)}")
        else:
            wav_file_name = file_name

        logger.info(
            "Created transcription job %s for file: %s (hash: %s...)",
            job_uuid,
            wav_file_name,
            file_hash[:16]
        )

        # Create job record in 'uploaded' state (ready for transcription)
        await add_job(job_uuid, wav_file_name, 202, file_hash, workflow_state='uploaded')

        logger.info("Job %s created successfully in 'uploaded' state", job_uuid)

        # Return immediately - client will initiate workflow steps via API
        return JobResponse(
            uuid=job_uuid,
            file_name=wav_file_name,
            status_code=202
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating job: %s", e, exc_info=True)
        try:
            await update_status(job_uuid, 500)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to create job")


@app.get("/api/v1/jobs/{uuid}", response_model=JobStatusResponse)
async def get_job_status(uuid: str) -> JobStatusResponse:
    """
    Get job status and information with workflow state.

    Args:
        uuid: Job UUID

    Returns:
        Job status information including workflow state and available actions
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    status_map = {
        200: "completed",
        202: "processing",
        204: "deleted",
        404: "does not exist",
        500: "error"
    }

    status_code = job['status_code']
    status = status_map.get(status_code, "unknown")
    workflow_state = job.get('workflow_state', 'uploaded')

    # Determine available actions based on workflow state
    available_actions = []
    if workflow_state == 'uploaded':
        available_actions = ['transcribe', 'delete']
    elif workflow_state == 'transcribed':
        available_actions = ['diarize', 'delete']
    elif workflow_state == 'diarized':
        available_actions = ['align', 'delete']
    elif workflow_state == 'completed':
        available_actions = ['export', 'summary', 'delete']
    elif workflow_state in ['transcribing', 'diarizing', 'aligning']:
        available_actions = []  # No actions while processing
    elif workflow_state == 'error':
        available_actions = ['retry', 'delete']

    return JobStatusResponse(
        uuid=uuid,
        file_name=job['file_name'],
        status_code=status_code,
        status=status,
        workflow_state=workflow_state,
        current_step_progress=job.get('current_step_progress', 0),
        available_actions=available_actions,
        # Legacy fields
        progress_percentage=job.get('progress_percentage', 0),
        processing_stage=job.get('processing_stage', 'pending'),
        error_message=job.get('error_message')
    )


@app.patch("/api/v1/jobs/{uuid}", response_model=RenameResponse)
async def update_job(uuid: str, request: RenameJobRequest) -> RenameResponse:
    """
    Update job (currently supports renaming).

    Args:
        uuid: Job UUID
        request: Update request with new file name

    Returns:
        Updated job information
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    old_file_name = job['file_name']

    # Get unique filename
    old_audio_path = os.path.join(UPLOAD_DIR, old_file_name)
    unique_new_name = get_unique_filename(
        UPLOAD_DIR,
        request.file_name,
        exclude_path=old_audio_path
    )

    # Update database
    if not await update_file_name(uuid, unique_new_name):
        raise HTTPException(status_code=500, detail="Failed to update job")

    # Rename audio file
    new_audio_path = os.path.join(UPLOAD_DIR, unique_new_name)
    if await aiofiles.os.path.exists(old_audio_path):
        await aiofiles.os.rename(old_audio_path, new_audio_path)

    # Rename transcript file
    old_transcript_path = os.path.join("transcripts", f"{old_file_name}.json")
    new_transcript_path = os.path.join("transcripts", f"{unique_new_name}.json")
    if await aiofiles.os.path.exists(old_transcript_path):
        await aiofiles.os.rename(old_transcript_path, new_transcript_path)

    logger.info("Renamed job %s from %s to %s", uuid, old_file_name, unique_new_name)

    return RenameResponse(
        uuid=uuid,
        status="success",
        new_name=unique_new_name
    )


##################################### New Workflow Step Endpoints #####################################

@app.post(
    "/api/v1/jobs/{uuid}/transcriptions",
    response_model=WorkflowActionResponse,
    status_code=202
)
async def start_transcription(
    uuid: str,
    background_tasks: BackgroundTasks,
    model_name: str = Query(default="turbo")
) -> WorkflowActionResponse:
    """
    Start transcription step for an uploaded audio file.

    Args:
        uuid: Job UUID
        background_tasks: FastAPI background tasks
        model_name: Whisper model to use

    Returns:
        Workflow action response indicating transcription has started
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    workflow_state = job.get('workflow_state', 'uploaded')

    # Check if job is in correct state
    if workflow_state != 'uploaded':
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transcribe. Job is in '{workflow_state}' state. Must be 'uploaded'."
        )

    file_name = job['file_name']
    file_path = os.path.join(UPLOAD_DIR, file_name)

    if not await aiofiles.os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Queue background task
    background_tasks.add_task(process_transcription_step, uuid, file_path, model_name)

    logger.info("Started transcription for job %s", uuid)

    return WorkflowActionResponse(
        uuid=uuid,
        workflow_state='transcribing',
        status_code=202,
        message="Transcription started"
    )


@app.get("/api/v1/jobs/{uuid}/transcriptions", response_model=TranscriptionDataResponse)
async def get_transcription(uuid: str) -> TranscriptionDataResponse:
    """
    Get raw transcription data from Whisper.

    Args:
        uuid: Job UUID

    Returns:
        Raw transcription data
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    transcription_data = await get_transcription_data(uuid)
    if not transcription_data:
        raise HTTPException(status_code=404, detail="Transcription data not found")

    return TranscriptionDataResponse(
        uuid=uuid,
        transcription_data=transcription_data,
        workflow_state=job.get('workflow_state', 'unknown')
    )


@app.post(
    "/api/v1/jobs/{uuid}/diarizations",
    response_model=WorkflowActionResponse,
    status_code=202
)
async def start_diarization(
    uuid: str,
    background_tasks: BackgroundTasks
) -> WorkflowActionResponse:
    """
    Start diarization step for a transcribed audio file.

    Args:
        uuid: Job UUID
        background_tasks: FastAPI background tasks

    Returns:
        Workflow action response indicating diarization has started
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    workflow_state = job.get('workflow_state', 'uploaded')

    # Check if job is in correct state
    if workflow_state != 'transcribed':
        raise HTTPException(
            status_code=400,
            detail=f"Cannot diarize. Job is in '{workflow_state}' state. Must be 'transcribed'."
        )

    file_name = job['file_name']
    file_path = os.path.join(UPLOAD_DIR, file_name)

    if not await aiofiles.os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Queue background task
    background_tasks.add_task(process_diarization_step, uuid, file_path)

    logger.info("Started diarization for job %s", uuid)

    return WorkflowActionResponse(
        uuid=uuid,
        workflow_state='diarizing',
        status_code=202,
        message="Diarization started"
    )


@app.get("/api/v1/jobs/{uuid}/diarizations", response_model=DiarizationDataResponse)
async def get_diarization(uuid: str) -> DiarizationDataResponse:
    """
    Get raw diarization data from PyAnnote.

    Args:
        uuid: Job UUID

    Returns:
        Raw diarization data
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    diarization_data = await get_diarization_data(uuid)
    if not diarization_data:
        raise HTTPException(status_code=404, detail="Diarization data not found")

    return DiarizationDataResponse(
        uuid=uuid,
        diarization_data=diarization_data,
        workflow_state=job.get('workflow_state', 'unknown')
    )


@app.post("/api/v1/jobs/{uuid}/alignments", response_model=WorkflowActionResponse, status_code=202)
async def start_alignment(
    uuid: str,
    background_tasks: BackgroundTasks
) -> WorkflowActionResponse:
    """
    Start alignment step to combine transcription and diarization.

    Args:
        uuid: Job UUID
        background_tasks: FastAPI background tasks

    Returns:
        Workflow action response indicating alignment has started
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    workflow_state = job.get('workflow_state', 'uploaded')

    # Check if job is in correct state
    if workflow_state != 'diarized':
        raise HTTPException(
            status_code=400,
            detail=f"Cannot align. Job is in '{workflow_state}' state. Must be 'diarized'."
        )

    file_name = job['file_name']

    # Queue background task
    background_tasks.add_task(process_alignment_step, uuid, file_name)

    logger.info("Started alignment for job %s", uuid)

    return WorkflowActionResponse(
        uuid=uuid,
        workflow_state='aligning',
        status_code=202,
        message="Alignment started"
    )


@app.delete("/api/v1/jobs/{uuid}", response_model=DeleteResponse, status_code=200)
async def delete_job_endpoint(uuid: str) -> DeleteResponse:
    """
    Delete job and all associated files.

    Args:
        uuid: Job UUID

    Returns:
        Delete confirmation
    """
    uuid = validate_uuid_format(uuid)

    file_name = await delete_job(uuid)
    if not file_name:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # Delete associated files
    files_deleted = []

    # Delete audio file
    audio_path = os.path.join(UPLOAD_DIR, file_name)
    if await aiofiles.os.path.exists(audio_path):
        try:
            await aiofiles.os.remove(audio_path)
            files_deleted.append(f"audio: {file_name}")
        except Exception as e:
            logger.error("Error deleting audio file: %s", e)

    # Delete transcript
    transcript_path = os.path.join("transcripts", f"{file_name}.json")
    if await aiofiles.os.path.exists(transcript_path):
        try:
            await aiofiles.os.remove(transcript_path)
            files_deleted.append(f"transcript: {file_name}.json")
        except Exception as e:
            logger.error("Error deleting transcript: %s", e)

    # Delete edited transcript
    edited_transcript_path = os.path.join("transcripts", "edited", f"{file_name}.json")
    if await aiofiles.os.path.exists(edited_transcript_path):
        try:
            await aiofiles.os.remove(edited_transcript_path)
            files_deleted.append(f"edited transcript")
        except Exception as e:
            logger.error("Error deleting edited transcript: %s", e)

    # Delete summary
    summary_path = os.path.join("summary", f"{uuid}.txt")
    if await aiofiles.os.path.exists(summary_path):
        try:
            await aiofiles.os.remove(summary_path)
            files_deleted.append(f"summary")
        except Exception as e:
            logger.error("Error deleting summary: %s", e)

    deleted_msg = ", ".join(files_deleted) if files_deleted else "no files found"
    logger.info("Deleted job %s: %s", uuid, deleted_msg)

    return DeleteResponse(
        uuid=uuid,
        status="success",
        message=f"Job deleted successfully. Removed: {deleted_msg}"
    )


@app.get("/api/v1/jobs/{uuid}/transcript", response_model=TranscriptResponse)
async def get_transcript(uuid: str) -> TranscriptResponse:
    """
    Get transcript for a job (prioritizes edited version).

    Args:
        uuid: Job UUID

    Returns:
        Transcript data
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']

    # Check for edited transcript first
    edited_path = os.path.join("transcripts", "edited", f"{file_name}.json")
    original_path = os.path.join("transcripts", f"{file_name}.json")

    if await aiofiles.os.path.exists(edited_path):
        async with aiofiles.open(edited_path, "r", encoding="utf-8") as f:
            full_transcript = await f.read()
        logger.info(
            "Retrieved edited transcript for %s: %s",
            uuid,
            sanitize_log_data(full_transcript)
        )
        return TranscriptResponse(
            uuid=uuid,
            status="exists",
            full_transcript=full_transcript,
            file_name=file_name,
            status_code=200,
            is_edited=True
        )
    elif await aiofiles.os.path.exists(original_path):
        async with aiofiles.open(original_path, "r", encoding="utf-8") as f:
            full_transcript = await f.read()
        logger.info(
            "Retrieved original transcript for %s: %s",
            uuid,
            sanitize_log_data(full_transcript)
        )
        return TranscriptResponse(
            uuid=uuid,
            status="exists",
            full_transcript=full_transcript,
            file_name=file_name,
            status_code=200,
            is_edited=False
        )
    else:
        raise HTTPException(status_code=404, detail="Transcript not found")


@app.patch("/api/v1/jobs/{uuid}/transcript")
async def update_transcript(uuid: str, request: TranscriptUpdateRequest) -> dict:
    """
    Update transcript content (saves as edited version).

    Args:
        uuid: Job UUID
        request: Updated transcript data

    Returns:
        Success confirmation
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']

    # Save edited transcript
    os.makedirs("transcripts/edited", exist_ok=True)
    edited_path = os.path.join("transcripts", "edited", f"{file_name}.json")

    json_str = json.dumps(request.transcript, indent=4)
    async with aiofiles.open(edited_path, "w", encoding="utf-8") as f:
        await f.write(json_str)

    # Invalidate cached summary
    summary_path = Path("summary") / f"{uuid}.txt"
    if await aiofiles.os.path.exists(str(summary_path)):
        try:
            await aiofiles.os.remove(str(summary_path))
            logger.info("Invalidated cached summary for %s", uuid)
        except Exception as e:
            logger.warning("Failed to invalidate summary: %s", e)

    logger.info("Updated transcript for %s", uuid)

    return {
        "uuid": uuid,
        "status": "success",
        "message": "Transcript updated successfully",
        "file_name": file_name
    }


@app.get("/api/v1/jobs/{uuid}/summary", response_model=SummaryResponse)
async def get_summary(
    uuid: str,
    regenerate: bool = Query(default=False)
) -> SummaryResponse:
    """
    Get or generate summary for a job.

    Args:
        uuid: Job UUID
        regenerate: Force regenerate summary even if cached

    Returns:
        Summary data
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']
    summary_path = Path("summary") / f"{uuid}.txt"

    # Return cached summary if exists and not forcing regeneration
    if await aiofiles.os.path.exists(str(summary_path)) and not regenerate:
        try:
            async with aiofiles.open(str(summary_path), "r", encoding="utf-8") as f:
                cached_summary = await f.read()
            logger.info("Returned cached summary for %s", uuid)
            return SummaryResponse(
                uuid=uuid,
                file_name=file_name,
                status="success",
                status_code=200,
                summary=cached_summary
            )
        except Exception as e:
            logger.error("Error reading cached summary: %s", e)

    # Generate new summary
    try:
        # Get transcript
        transcript_response = await get_transcript(uuid)
        full_transcript_json = transcript_response.full_transcript
        formatted_transcript = format_transcript_for_llm(full_transcript_json)

        # Generate summary
        summary = await summarise_transcript(formatted_transcript)

        # Cache summary
        summary_path.parent.mkdir(exist_ok=True)
        async with aiofiles.open(str(summary_path), "w", encoding="utf-8") as f:
            await f.write(summary)

        logger.info("Generated summary for %s: %s", uuid, sanitize_log_data(summary))

        return SummaryResponse(
            uuid=uuid,
            file_name=file_name,
            status="success",
            status_code=200,
            summary=summary
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating summary: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during summary generation"
        )


@app.post("/api/v1/jobs/{uuid}/summary", response_model=SummaryResponse)
async def create_summary(uuid: str, request: SummarizeRequest = None) -> SummaryResponse:
    """
    Generate new summary with optional custom prompts.

    Args:
        uuid: Job UUID
        request: Optional custom prompts

    Returns:
        Summary data
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']

    try:
        # Get transcript
        transcript_response = await get_transcript(uuid)
        full_transcript_json = transcript_response.full_transcript
        formatted_transcript = format_transcript_for_llm(full_transcript_json)

        # Generate summary with custom prompts if provided
        custom_prompt = None
        system_prompt = None
        if request:
            custom_prompt = request.custom_prompt
            system_prompt = request.system_prompt

        summary = await summarise_transcript(formatted_transcript, custom_prompt, system_prompt)

        # Cache summary
        summary_path = Path("summary") / f"{uuid}.txt"
        summary_path.parent.mkdir(exist_ok=True)
        async with aiofiles.open(str(summary_path), "w", encoding="utf-8") as f:
            await f.write(summary)

        logger.info("Generated custom summary for %s", uuid)

        return SummaryResponse(
            uuid=uuid,
            file_name=file_name,
            status="success",
            status_code=200,
            summary=summary
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating summary: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during summary generation"
        )


@app.patch("/api/v1/jobs/{uuid}/summary")
async def update_summary(uuid: str, request: dict) -> SummaryResponse:
    """
    Update the cached summary with user-edited content.

    Args:
        uuid: Job UUID
        request: Dictionary containing 'summary' field with edited text

    Returns:
        Updated summary response
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # Validate request body
    if 'summary' not in request:
        raise HTTPException(status_code=400, detail="Missing 'summary' field in request body")

    edited_summary = request['summary']
    if not isinstance(edited_summary, str):
        raise HTTPException(status_code=400, detail="'summary' must be a string")

    # Save edited summary to cache file
    summary_path = Path("summary") / f"{uuid}.txt"
    summary_path.parent.mkdir(exist_ok=True)

    async with aiofiles.open(str(summary_path), "w", encoding="utf-8") as f:
        await f.write(edited_summary)

    logger.info("Updated summary for %s", uuid)

    return SummaryResponse(
        uuid=uuid,
        file_name=job['file_name'],
        status="success",
        status_code=200,
        summary=edited_summary
    )


@app.delete("/api/v1/jobs/{uuid}/summary")
async def delete_summary_cache(uuid: str) -> dict:
    """
    Delete cached summary.

    Args:
        uuid: Job UUID

    Returns:
        Delete confirmation
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    summary_path = Path("summary") / f"{uuid}.txt"

    if await aiofiles.os.path.exists(str(summary_path)):
        await aiofiles.os.remove(str(summary_path))
        logger.info("Deleted cached summary for %s", uuid)
        return {
            "uuid": uuid,
            "status": "success",
            "message": "Summary deleted successfully"
        }
    else:
        raise HTTPException(status_code=404, detail="No cached summary found")


@app.patch("/api/v1/jobs/{uuid}/speakers", response_model=SpeakerUpdateResponse)
async def update_speakers(uuid: str, speaker_map: SpeakerNameMapping) -> SpeakerUpdateResponse:
    """
    Update speaker names in transcript.

    Args:
        uuid: Job UUID
        speaker_map: Mapping of old to new speaker names

    Returns:
        Updated transcript
    """
    uuid = validate_uuid_format(uuid)

    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']
    transcript_path = os.path.join("transcripts", f"{file_name}.json")
    edited_transcript_path = os.path.join("transcripts", "edited", f"{file_name}.json")

    # Determine which files to update
    files_to_update = []
    if await aiofiles.os.path.exists(edited_transcript_path):
        files_to_update.append(edited_transcript_path)
    if await aiofiles.os.path.exists(transcript_path):
        files_to_update.append(transcript_path)

    if not files_to_update:
        raise HTTPException(status_code=404, detail="Transcript file not found")

    # Update all transcript files
    updated_transcript = None
    for file_path in files_to_update:
        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            transcript_json = await f.read()
            transcript_data = json.loads(transcript_json)

        # Update speaker names
        for segment in transcript_data:
            original_speaker = (segment.get("speaker") or "SPEAKER_00").strip()
            if original_speaker in speaker_map.mapping:
                segment["speaker"] = speaker_map.mapping[original_speaker].strip()

        json_str = json.dumps(transcript_data, indent=4)
        async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
            await f.write(json_str)

        updated_transcript = transcript_data

    # Invalidate cached summary
    summary_path = Path("summary") / f"{uuid}.txt"
    if await aiofiles.os.path.exists(str(summary_path)):
        try:
            await aiofiles.os.remove(str(summary_path))
            logger.info("Invalidated cached summary for %s", uuid)
        except Exception as e:
            logger.warning("Failed to invalidate summary: %s", e)

    logger.info("Updated speaker names for %s", uuid)

    return SpeakerUpdateResponse(
        uuid=uuid,
        status="success",
        message="Speaker names updated successfully",
        transcript=updated_transcript
    )


@app.post(
    "/api/v1/jobs/{uuid}/speaker-identifications",
    response_model=SpeakerIdentificationResponse
)
async def identify_speakers_endpoint(
    uuid: str,
    request: SpeakerIdentificationRequest = None
) -> SpeakerIdentificationResponse:
    """
    Use LLM to identify speakers in transcript.

    Args:
        uuid: Job UUID
        request: Optional context about meeting

    Returns:
        Speaker identification suggestions
    """
    uuid = validate_uuid_format(uuid)

    try:
        # Get transcript
        transcript_response = await get_transcript(uuid)
        full_transcript_json = transcript_response.full_transcript
        formatted_transcript = format_transcript_for_llm(full_transcript_json)

        if not formatted_transcript.strip():
            raise HTTPException(status_code=400, detail="Transcript is empty")

        # Extract context
        context = None
        if request and hasattr(request, 'context'):
            context = request.context

        # Identify speakers
        identification_result = await identify_speakers_with_llm(formatted_transcript, context)

        if identification_result["status"] == "success":
            logger.info("Successfully identified speakers for %s", uuid)
            return SpeakerIdentificationResponse(
                uuid=uuid,
                status="success",
                suggestions=identification_result["suggestions"]
            )
        else:
            logger.error("Speaker identification failed for %s", uuid)
            raise HTTPException(
                status_code=500,
                detail=identification_result.get("message", "Speaker identification failed")
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error during speaker identification: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during speaker identification"
        )


@app.get("/api/v1/jobs/{uuid}/exports/pdf")
async def export_pdf(uuid: str, request: ExportRequest = None):
    """
    Export job as PDF.

    Args:
        uuid: Job UUID
        request: Optional export parameters

    Returns:
        PDF file
    """
    uuid = validate_uuid_format(uuid)

    try:
        # Get summary
        summary_response = await get_summary(uuid)
        summary_data = {
            'meetingTitle': summary_response.file_name,
            'summary': summary_response.summary
        }

        # Get transcript
        transcript_response = await get_transcript(uuid)
        transcript_json = transcript_response.full_transcript
        transcript_data = json.loads(transcript_json) if transcript_json else []

        # Get timestamp
        generated_on = None
        if request:
            generated_on = request.generated_on

        # Generate PDF
        pdf_buffer = generate_professional_pdf(summary_data, transcript_data, generated_on)

        # Create filename
        filename = generate_professional_filename(summary_data['meetingTitle'], 'pdf')

        return StreamingResponse(
            BytesIO(pdf_buffer.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating PDF: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during PDF generation"
        )


@app.get("/api/v1/jobs/{uuid}/exports/markdown")
async def export_markdown(uuid: str, request: ExportRequest = None):
    """
    Export job as Markdown.

    Args:
        uuid: Job UUID
        request: Optional export parameters

    Returns:
        Markdown file
    """
    uuid = validate_uuid_format(uuid)

    try:
        # Get summary
        summary_response = await get_summary(uuid)
        meeting_title = summary_response.file_name
        summary_content = summary_response.summary

        # Get transcript
        transcript_response = await get_transcript(uuid)
        transcript_json = transcript_response.full_transcript
        transcript_data = json.loads(transcript_json) if transcript_json else []

        # Get timestamp
        generated_on = None
        if request:
            generated_on = request.generated_on

        if not generated_on:
            generated_on = datetime.now(tz_configured).strftime('%B %d, %Y at %I:%M %p')

        # Generate markdown
        markdown_content = f"# {meeting_title}\n\n"
        markdown_content += f"*Generated on {generated_on}*\n\n"

        if summary_content:
            markdown_content += f"## Summary\n\n{summary_content}\n\n"

        if transcript_data:
            markdown_content += "## Transcript\n\n"
            for entry in transcript_data:
                speaker = format_speaker_name(entry.get('speaker', 'Unknown Speaker'))
                text = entry.get('text', '')
                start_time = entry.get('start', '0.00')
                end_time = entry.get('end', '0.00')
                markdown_content += f"**{speaker}** *({start_time}s - {end_time}s)*: {text}\n\n"

        # Create filename
        filename = generate_professional_filename(meeting_title, 'markdown')

        markdown_buffer = BytesIO(markdown_content.encode('utf-8'))

        return StreamingResponse(
            markdown_buffer,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating markdown: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during markdown generation"
        )


@app.get("/api/v1/jobs/{uuid}/exports/transcript/pdf")
async def export_transcript_pdf(uuid: str, request: ExportRequest = None):
    """
    Export transcript as PDF (transcript only, no AI summary).
    Uses edited transcript if available, with user-defined speaker names.

    Args:
        uuid: Job UUID
        request: Optional export parameters

    Returns:
        PDF file
    """
    uuid = validate_uuid_format(uuid)

    try:
        # Get transcript (uses edited version if available)
        transcript_response = await get_transcript(uuid)
        transcript_json = transcript_response.full_transcript
        transcript_data = json.loads(transcript_json) if transcript_json else []

        # Get file name
        meeting_title = transcript_response.file_name

        # Get timestamp
        generated_on = None
        if request:
            generated_on = request.generated_on

        # Generate transcript-only PDF (no AI summary)
        pdf_buffer = generate_transcript_pdf(meeting_title, transcript_data, generated_on)

        # Create filename
        filename = generate_professional_filename(meeting_title, 'pdf')

        return StreamingResponse(
            BytesIO(pdf_buffer.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating transcript PDF: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during transcript PDF generation"
        )


@app.get("/api/v1/jobs/{uuid}/exports/transcript/markdown")
async def export_transcript_markdown(uuid: str, request: ExportRequest = None):
    """
    Export transcript as Markdown (transcript only, no AI summary).
    Uses edited transcript if available, with user-defined speaker names.

    Args:
        uuid: Job UUID
        request: Optional export parameters

    Returns:
        Markdown file
    """
    uuid = validate_uuid_format(uuid)

    try:
        # Get transcript (uses edited version if available)
        transcript_response = await get_transcript(uuid)
        transcript_json = transcript_response.full_transcript
        transcript_data = json.loads(transcript_json) if transcript_json else []

        # Get file name
        meeting_title = transcript_response.file_name

        # Get timestamp
        generated_on = None
        if request:
            generated_on = request.generated_on

        if not generated_on:
            generated_on = datetime.now(tz_configured).strftime('%B %d, %Y at %I:%M %p')

        # Generate markdown (transcript only, no summary)
        markdown_content = f"# {meeting_title}\n\n"
        markdown_content += f"*Generated on {generated_on}*\n\n"
        markdown_content += "## Transcript\n\n"

        if transcript_data:
            for entry in transcript_data:
                speaker = format_speaker_name(entry.get('speaker', 'Unknown Speaker'))
                text = entry.get('text', '')
                start_time = entry.get('start', '0.00')
                end_time = entry.get('end', '0.00')
                markdown_content += f"**{speaker}** *({start_time}s - {end_time}s)*: {text}\n\n"

        # Create filename
        filename = generate_professional_filename(meeting_title, 'markdown')

        markdown_buffer = BytesIO(markdown_content.encode('utf-8'))

        return StreamingResponse(
            markdown_buffer,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating transcript markdown: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error during transcript markdown generation"
        )


##################################### Export Jobs #####################################

@app.post("/api/v1/jobs/{uuid}/exports", response_model=ExportJobResponse, status_code=202)
async def create_export_job(
    uuid: str,
    request: CreateExportRequest,
    background_tasks: BackgroundTasks
) -> ExportJobResponse:
    """
    Create a background export job for PDF or Markdown.

    Args:
        uuid: Job UUID
        request: Export request with type
        background_tasks: FastAPI background tasks

    Returns:
        Export job information with export_uuid
    """
    uuid = validate_uuid_format(uuid)

    # Verify job exists
    job = await get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # Verify job is completed
    if job['status_code'] != 200:
        raise HTTPException(
            status_code=400,
            detail=f"Job must be completed before exporting. Current status: {job['status_code']}"
        )

    # Create export job
    import uuid as uuid_module
    export_uuid = str(uuid_module.uuid4())
    await add_export_job(export_uuid, uuid, request.export_type, 202)

    # Queue background task
    background_tasks.add_task(
        process_export_job,
        export_uuid,
        uuid,
        request.export_type
    )

    logger.info("Created export job %s (%s) for job %s", export_uuid, request.export_type, uuid)

    return ExportJobResponse(
        export_uuid=export_uuid,
        job_uuid=uuid,
        export_type=request.export_type,
        status_code=202
    )


@app.get("/api/v1/jobs/{uuid}/exports/{export_uuid}", response_model=ExportJobStatusResponse)
async def get_export_job_status(uuid: str, export_uuid: str) -> ExportJobStatusResponse:
    """
    Get status of an export job.

    Args:
        uuid: Job UUID
        export_uuid: Export job UUID

    Returns:
        Export job status
    """
    uuid = validate_uuid_format(uuid)
    export_uuid = validate_uuid_format(export_uuid)

    export_job = await get_export_job(export_uuid)
    if not export_job:
        raise HTTPException(status_code=404, detail=f"Export job {export_uuid} not found")

    # Verify export belongs to this job
    if str(export_job['job_uuid']) != uuid:
        raise HTTPException(status_code=404, detail="Export job not found for this job")

    # Build download URL if completed
    download_url = None
    if export_job['status_code'] == 200:
        download_url = f"/api/v1/jobs/{uuid}/exports/{export_uuid}/download"

    return ExportJobStatusResponse(
        uuid=str(export_job['uuid']),
        job_uuid=str(export_job['job_uuid']),
        export_type=export_job['export_type'],
        status_code=export_job['status_code'],
        progress_percentage=export_job['progress_percentage'],
        error_message=export_job.get('error_message'),
        download_url=download_url
    )


@app.get("/api/v1/jobs/{uuid}/exports/{export_uuid}/download")
async def download_export(uuid: str, export_uuid: str):
    """
    Download completed export file.

    Args:
        uuid: Job UUID
        export_uuid: Export job UUID

    Returns:
        Export file (PDF or Markdown)
    """
    uuid = validate_uuid_format(uuid)
    export_uuid = validate_uuid_format(export_uuid)

    export_job = await get_export_job(export_uuid)
    if not export_job:
        raise HTTPException(status_code=404, detail=f"Export job {export_uuid} not found")

    # Verify export belongs to this job
    if str(export_job['job_uuid']) != uuid:
        raise HTTPException(status_code=404, detail="Export job not found for this job")

    # Check if export is complete
    if export_job['status_code'] != 200:
        status = export_job['status_code']
        progress = export_job['progress_percentage']
        raise HTTPException(
            status_code=400,
            detail=f"Export not ready. Status: {status}, Progress: {progress}%"
        )

    # Get file path
    file_path = export_job.get('file_path')
    if not file_path or not await aiofiles.os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Export file not found")

    # Determine content type and filename
    export_type = export_job['export_type']
    if export_type == 'pdf':
        media_type = 'application/pdf'
        filename = f"meeting_{uuid[:8]}.pdf"
    else:  # markdown
        media_type = 'text/markdown'
        filename = f"meeting_{uuid[:8]}.md"

    # Read and stream file
    async def file_iterator():
        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.read(8192):
                yield chunk

    return StreamingResponse(
        file_iterator(),
        media_type=media_type,
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"'
        }
    )


@app.delete("/api/v1/jobs/{uuid}/exports/{export_uuid}")
async def delete_export_job(uuid: str, export_uuid: str) -> dict:
    """
    Delete an export job and its file.

    Args:
        uuid: Job UUID
        export_uuid: Export job UUID

    Returns:
        Delete confirmation
    """
    uuid = validate_uuid_format(uuid)
    export_uuid = validate_uuid_format(export_uuid)

    export_job = await get_export_job(export_uuid)
    if not export_job:
        raise HTTPException(status_code=404, detail=f"Export job {export_uuid} not found")

    # Verify export belongs to this job
    if str(export_job['job_uuid']) != uuid:
        raise HTTPException(status_code=404, detail="Export job not found for this job")

    # Delete file if exists
    file_path = export_job.get('file_path')
    if file_path and await aiofiles.os.path.exists(file_path):
        try:
            await aiofiles.os.remove(file_path)
            logger.info("Deleted export file: %s", file_path)
        except Exception as e:
            logger.error("Error deleting export file: %s", e)

    # Note: Cleanup scheduler will remove old export jobs from database
    logger.info("Deleted export job %s", export_uuid)

    return {
        "uuid": export_uuid,
        "status": "success",
        "message": "Export job deleted successfully"
    }


##################################### Health Check #####################################

@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint."""
    try:
        # Check database connection
        total_jobs = await get_jobs_count()

        return {
            "status": "ok",
            "version": "1.0.0",
            "jobs_count": total_jobs,
            "device": DEVICE
        }
    except Exception as e:
        logger.error("Health check failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Health check failed")


##################################### Legacy Routes (Backwards Compatibility) #####################################

# Legacy routes for backwards compatibility - these redirect to new API versioned routes
# Can be removed once frontend is updated

@app.get("/jobs")
async def legacy_get_jobs():
    """Legacy endpoint - redirects to versioned API."""
    return await get_jobs()


@app.post("/jobs")
async def legacy_create_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model_name: str = Query(default="turbo")
):
    """Legacy endpoint - redirects to versioned API."""
    return await create_job(background_tasks, file, model_name)


@app.delete("/jobs/{uuid}")
async def legacy_delete_job(uuid: str):
    """Legacy endpoint - redirects to versioned API."""
    return await delete_job_endpoint(uuid)


@app.get("/jobs/{uuid}/status")
async def legacy_get_job_status(uuid: str):
    """Legacy endpoint - redirects to versioned API."""
    return await get_job_status(uuid)


@app.get("/jobs/{uuid}/transcript")
async def legacy_get_transcript(uuid: str):
    """Legacy endpoint - redirects to versioned API."""
    return await get_transcript(uuid)


@app.post("/jobs/{uuid}/summarise")
async def legacy_summarise(uuid: str, request: SummarizeRequest = None):
    """Legacy endpoint - redirects to versioned API."""
    return await create_summary(uuid, request)


@app.get("/health")
async def legacy_health():
    """Legacy endpoint - redirects to versioned API."""
    return await health_check()
