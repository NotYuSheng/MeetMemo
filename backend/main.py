"""
FastAPI application for audio transcription and speaker diarization.

Refactored version addressing all critical security, performance, and design issues.
"""
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
    init_database, add_job, update_status, update_progress, update_error,
    get_job, get_all_jobs, get_jobs_count, delete_job, update_file_name,
    cleanup_old_jobs
)
from security import sanitize_filename, validate_uuid_format, sanitize_log_data
from models import (
    SpeakerNameMapping, TranscriptUpdateRequest, SummarizeRequest,
    SpeakerIdentificationRequest, RenameJobRequest, ExportRequest,
    JobResponse, JobStatusResponse, FileNameResponse, TranscriptResponse,
    SummaryResponse, DeleteResponse, RenameResponse, SpeakerUpdateResponse,
    SpeakerIdentificationResponse, JobListResponse
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
    tz_gmt8 = timezone(timedelta(hours=8))
    return datetime.now(tz_gmt8).strftime("%Y-%m-%d %H:%M:%S")


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


def generate_professional_filename(meeting_title: str, file_type: str, include_date: bool = True) -> str:
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


async def upload_audio(job_uuid: str, file: UploadFile) -> str:
    """
    Uploads the audio file to the desired directory with validation.

    Args:
        job_uuid: UUID for the job
        file: Uploaded file

    Returns:
        The resultant file name

    Raises:
        HTTPException: If file is invalid
    """
    # Validate file size
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

    # Sanitize filename
    try:
        safe_filename = sanitize_filename(file.filename)
    except HTTPException:
        # If sanitization fails, use UUID-based filename with original extension
        ext = Path(file.filename).suffix or '.wav'
        safe_filename = f"{job_uuid[:8]}{ext}"

    filename = get_unique_filename(UPLOAD_DIR, safe_filename)
    file_path = os.path.join(UPLOAD_DIR, filename)

    # Save the file to disk
    with open(file_path, "wb") as buffer:
        for chunk in chunks:
            buffer.write(chunk)

    return filename


def convert_to_wav(input_path: str, output_path: str, sample_rate: int = 16000):
    """Convert audio file to WAV format."""
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_frame_rate(sample_rate).set_channels(1)
    audio.export(output_path, format="wav")


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
    logger.info(f"Loading Whisper model: {model_name}")
    model = whisper.load_model(model_name)
    model = model.to(DEVICE)
    logger.info(f"Whisper model {model_name} loaded successfully on {DEVICE}")
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
        return "# No Content Available\n\nThe recording appears to be empty or could not be transcribed."

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
        logger.error(f"LLM service error: {e}")
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

        logger.info(f"LLM speaker identification response: {sanitize_log_data(response_text)}")

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
        logger.error(f"LLM request failed: {e}")
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

            footer_text = "Generated by MeetMemo AI - This content is AI-generated and may contain inaccuracies."
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
            ['Generated On:', generated_on or datetime.now().strftime('%B %d, %Y at %I:%M %p')],
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


##################################### Cleanup Scheduler #####################################

async def cleanup_expired_files():
    """Clean up files older than 12 hours."""
    try:
        # Get expired jobs from database
        expired_jobs = cleanup_old_jobs(max_age_hours=12)

        if not expired_jobs:
            return

        removed_count = 0

        for job in expired_jobs:
            job_uuid = job['uuid']
            file_name = job['file_name']

            # Remove audio file
            audio_path = os.path.join(UPLOAD_DIR, file_name)
            if os.path.exists(audio_path):
                try:
                    os.remove(audio_path)
                    removed_count += 1
                except Exception as e:
                    logger.warning(f"Failed to remove audio file {audio_path}: {e}")

            # Remove transcript files
            transcript_path = os.path.join("transcripts", f"{file_name}.json")
            if os.path.exists(transcript_path):
                try:
                    os.remove(transcript_path)
                    removed_count += 1
                except Exception as e:
                    logger.warning(f"Failed to remove transcript {transcript_path}: {e}")

            edited_transcript_path = os.path.join("transcripts", "edited", f"{file_name}.json")
            if os.path.exists(edited_transcript_path):
                try:
                    os.remove(edited_transcript_path)
                    removed_count += 1
                except Exception as e:
                    logger.warning(f"Failed to remove edited transcript: {e}")

            # Remove summary file
            summary_path = os.path.join("summary", f"{job_uuid}.txt")
            if os.path.exists(summary_path):
                try:
                    os.remove(summary_path)
                    removed_count += 1
                except Exception as e:
                    logger.warning(f"Failed to remove summary: {e}")

        logger.info(f"Cleaned up {removed_count} files from {len(expired_jobs)} expired jobs")

    except Exception as e:
        logger.error(f"Error during file cleanup: {e}", exc_info=True)


def start_cleanup_scheduler():
    """Start background cleanup thread."""
    async def cleanup_worker():
        import asyncio
        while True:
            try:
                await cleanup_expired_files()
                await asyncio.sleep(3600)  # Sleep for 1 hour
            except Exception as e:
                logger.error(f"Error in cleanup worker: {e}", exc_info=True)
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

    # Initialize database
    init_database()

    # Initialize HTTP client
    http_client = httpx.AsyncClient(timeout=120.0)

    # Preload Whisper model
    try:
        get_whisper_model("turbo")
        logger.info("Whisper model preloaded successfully")
    except Exception as e:
        logger.error(f"Failed to preload Whisper model: {e}")

    # Preload PyAnnote pipeline
    try:
        get_pyannote_pipeline()
        logger.info("PyAnnote pipeline preloaded successfully")
    except Exception as e:
        logger.error(f"Failed to preload PyAnnote pipeline: {e}")

    # Start cleanup scheduler
    start_cleanup_scheduler()

    logger.info("MeetMemo API startup complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    global http_client

    if http_client:
        await http_client.aclose()

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
        jobs_list = get_all_jobs(limit=limit, offset=offset)
        total = get_jobs_count()

        # Convert to dict format expected by frontend
        jobs_dict = {}
        for job in jobs_list:
            jobs_dict[job['uuid']] = {
                'file_name': job['file_name'],
                'status_code': job['status_code']
            }

        return JobListResponse(
            jobs=jobs_dict,
            total=total,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error(f"Error retrieving job list: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while retrieving job list")


async def process_transcription_job(
    job_uuid: str,
    file_path: str,
    wav_file_name: str,
    model_name: str = "turbo"
) -> None:
    """
    Background task for audio transcription and diarization.

    Args:
        job_uuid: Job UUID for tracking
        file_path: Path to audio file
        wav_file_name: Name of WAV file
        model_name: Whisper model to use
    """
    try:
        # Update status to processing with initial progress
        update_progress(job_uuid, 0, "initializing")
        logger.info(f"Starting background processing for job {job_uuid}")

        # Get cached models (already loaded in memory)
        model = get_whisper_model(model_name)
        pipeline = get_pyannote_pipeline()

        logger.info(f"Processing file {wav_file_name} with model {model_name}")

        # Stage 1: Transcription (0-30% progress) - Fast with optimizations
        update_progress(job_uuid, 5, "transcribing")
        asr = model.transcribe(
            file_path,
            language="en",
            fp16=True,                    # Enable half-precision for 2x speed on GPU
            beam_size=1,                  # Reduce beam search from default 5 to 1
            best_of=1,                    # Reduce sampling from default 5 to 1
            temperature=0.0,              # Deterministic output
            no_speech_threshold=0.6,      # Skip segments with low speech probability
            logprob_threshold=-1.0,       # Skip low confidence segments
            compression_ratio_threshold=2.4,  # Detect and skip repetitive hallucinated text
            condition_on_previous_text=False  # Don't condition on previous text (reduces hallucinations)
        )
        logger.info(f"Transcription complete for {wav_file_name}")

        # Stage 2: Diarization (30-95% progress) - This is the slowest part
        update_progress(job_uuid, 30, "diarizing")
        logger.info(f"Diarizing {wav_file_name}")
        diarization = pipeline(file_path)
        logger.info(f"Diarization complete for {wav_file_name}")

        # Stage 3: Format and save (95-100% progress)
        update_progress(job_uuid, 95, "finalizing")
        diarized = diarize_text(asr, diarization)
        full_transcript = format_result(diarized=diarized)

        os.makedirs("transcripts", exist_ok=True)
        json_path = os.path.join("transcripts", f"{wav_file_name}.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(full_transcript, f, indent=4)

        # Mark complete
        update_progress(job_uuid, 100, "completed")
        update_status(job_uuid, 200)
        logger.info(f"Successfully completed processing for job {job_uuid}")

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error processing job {job_uuid}: {error_msg}", exc_info=True)
        try:
            update_error(job_uuid, error_msg)
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
    Returns immediately with 202 status while processing in background.

    Args:
        background_tasks: FastAPI background tasks handler
        file: Audio file to transcribe
        model_name: Whisper model to use

    Returns:
        Job information with UUID and 202 status
    """
    job_uuid = str(uuid.uuid4())

    try:
        # Upload and validate file (quick, runs synchronously)
        file_name = await upload_audio(job_uuid, file)
        file_path = os.path.join(UPLOAD_DIR, file_name)

        # Convert to WAV if needed
        if not file_name.lower().endswith(".wav"):
            wav_file_name = f"{os.path.splitext(file_name)[0]}.wav"
            wav_file_path = os.path.join(UPLOAD_DIR, wav_file_name)
            convert_to_wav(file_path, wav_file_path)
            file_path = wav_file_path
        else:
            wav_file_name = file_name

        logger.info(f"Created transcription job {job_uuid} for file: {wav_file_name}")

        # Create job record with status 202 (processing)
        add_job(job_uuid, wav_file_name, 202)

        # Queue background task (non-blocking)
        background_tasks.add_task(
            process_transcription_job,
            job_uuid,
            file_path,
            wav_file_name,
            model_name
        )

        logger.info(f"Queued background processing for job {job_uuid}")

        # Return immediately with 202 status
        return JobResponse(
            uuid=job_uuid,
            file_name=wav_file_name,
            status_code=202
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating job: {e}", exc_info=True)
        try:
            update_status(job_uuid, 500)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to create job")


@app.get("/api/v1/jobs/{uuid}", response_model=JobStatusResponse)
async def get_job_status(uuid: str) -> JobStatusResponse:
    """
    Get job status and information.

    Args:
        uuid: Job UUID

    Returns:
        Job status information
    """
    uuid = validate_uuid_format(uuid)

    job = get_job(uuid)
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

    return JobStatusResponse(
        uuid=uuid,
        file_name=job['file_name'],
        status_code=status_code,
        status=status,
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

    job = get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    old_file_name = job['file_name']

    # Get unique filename
    old_audio_path = os.path.join(UPLOAD_DIR, old_file_name)
    unique_new_name = get_unique_filename(UPLOAD_DIR, request.file_name, exclude_path=old_audio_path)

    # Update database
    if not update_file_name(uuid, unique_new_name):
        raise HTTPException(status_code=500, detail="Failed to update job")

    # Rename audio file
    new_audio_path = os.path.join(UPLOAD_DIR, unique_new_name)
    if os.path.exists(old_audio_path):
        os.rename(old_audio_path, new_audio_path)

    # Rename transcript file
    old_transcript_path = os.path.join("transcripts", f"{old_file_name}.json")
    new_transcript_path = os.path.join("transcripts", f"{unique_new_name}.json")
    if os.path.exists(old_transcript_path):
        os.rename(old_transcript_path, new_transcript_path)

    logger.info(f"Renamed job {uuid} from {old_file_name} to {unique_new_name}")

    return RenameResponse(
        uuid=uuid,
        status="success",
        new_name=unique_new_name
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

    file_name = delete_job(uuid)
    if not file_name:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    # Delete associated files
    files_deleted = []

    # Delete audio file
    audio_path = os.path.join(UPLOAD_DIR, file_name)
    if os.path.exists(audio_path):
        try:
            os.remove(audio_path)
            files_deleted.append(f"audio: {file_name}")
        except Exception as e:
            logger.error(f"Error deleting audio file: {e}")

    # Delete transcript
    transcript_path = os.path.join("transcripts", f"{file_name}.json")
    if os.path.exists(transcript_path):
        try:
            os.remove(transcript_path)
            files_deleted.append(f"transcript: {file_name}.json")
        except Exception as e:
            logger.error(f"Error deleting transcript: {e}")

    # Delete edited transcript
    edited_transcript_path = os.path.join("transcripts", "edited", f"{file_name}.json")
    if os.path.exists(edited_transcript_path):
        try:
            os.remove(edited_transcript_path)
            files_deleted.append(f"edited transcript")
        except Exception as e:
            logger.error(f"Error deleting edited transcript: {e}")

    # Delete summary
    summary_path = os.path.join("summary", f"{uuid}.txt")
    if os.path.exists(summary_path):
        try:
            os.remove(summary_path)
            files_deleted.append(f"summary")
        except Exception as e:
            logger.error(f"Error deleting summary: {e}")

    deleted_msg = ", ".join(files_deleted) if files_deleted else "no files found"
    logger.info(f"Deleted job {uuid}: {deleted_msg}")

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

    job = get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']

    # Check for edited transcript first
    edited_path = os.path.join("transcripts", "edited", f"{file_name}.json")
    original_path = os.path.join("transcripts", f"{file_name}.json")

    if os.path.exists(edited_path):
        with open(edited_path, "r", encoding="utf-8") as f:
            full_transcript = f.read()
        logger.info(f"Retrieved edited transcript for {uuid}: {sanitize_log_data(full_transcript)}")
        return TranscriptResponse(
            uuid=uuid,
            status="exists",
            full_transcript=full_transcript,
            file_name=file_name,
            status_code=200,
            is_edited=True
        )
    elif os.path.exists(original_path):
        with open(original_path, "r", encoding="utf-8") as f:
            full_transcript = f.read()
        logger.info(f"Retrieved original transcript for {uuid}: {sanitize_log_data(full_transcript)}")
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

    job = get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']

    # Save edited transcript
    os.makedirs("transcripts/edited", exist_ok=True)
    edited_path = os.path.join("transcripts/edited", f"{file_name}.json")

    with open(edited_path, "w", encoding="utf-8") as f:
        json.dump(request.transcript, f, indent=4)

    # Invalidate cached summary
    summary_path = Path("summary") / f"{uuid}.txt"
    if summary_path.exists():
        try:
            summary_path.unlink()
            logger.info(f"Invalidated cached summary for {uuid}")
        except Exception as e:
            logger.warning(f"Failed to invalidate summary: {e}")

    logger.info(f"Updated transcript for {uuid}")

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

    job = get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']
    summary_path = Path("summary") / f"{uuid}.txt"

    # Return cached summary if exists and not forcing regeneration
    if summary_path.exists() and not regenerate:
        try:
            cached_summary = summary_path.read_text(encoding="utf-8")
            logger.info(f"Returned cached summary for {uuid}")
            return SummaryResponse(
                uuid=uuid,
                file_name=file_name,
                status="success",
                status_code=200,
                summary=cached_summary
            )
        except Exception as e:
            logger.error(f"Error reading cached summary: {e}")

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
        summary_path.write_text(summary, encoding="utf-8")

        logger.info(f"Generated summary for {uuid}: {sanitize_log_data(summary)}")

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
        logger.error(f"Error generating summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during summary generation")


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

    job = get_job(uuid)
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
        summary_path.write_text(summary, encoding="utf-8")

        logger.info(f"Generated custom summary for {uuid}")

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
        logger.error(f"Error generating summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during summary generation")


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

    job = get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    summary_path = Path("summary") / f"{uuid}.txt"

    if summary_path.exists():
        summary_path.unlink()
        logger.info(f"Deleted cached summary for {uuid}")
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

    job = get_job(uuid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {uuid} not found")

    file_name = job['file_name']
    transcript_path = os.path.join("transcripts", f"{file_name}.json")
    edited_transcript_path = os.path.join("transcripts", "edited", f"{file_name}.json")

    # Determine which files to update
    files_to_update = []
    if os.path.exists(edited_transcript_path):
        files_to_update.append(edited_transcript_path)
    if os.path.exists(transcript_path):
        files_to_update.append(transcript_path)

    if not files_to_update:
        raise HTTPException(status_code=404, detail="Transcript file not found")

    # Update all transcript files
    updated_transcript = None
    for file_path in files_to_update:
        with open(file_path, "r", encoding="utf-8") as f:
            transcript_data = json.load(f)

        # Update speaker names
        for segment in transcript_data:
            original_speaker = (segment.get("speaker") or "SPEAKER_00").strip()
            if original_speaker in speaker_map.mapping:
                segment["speaker"] = speaker_map.mapping[original_speaker].strip()

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(transcript_data, f, indent=4)

        updated_transcript = transcript_data

    # Invalidate cached summary
    summary_path = Path("summary") / f"{uuid}.txt"
    if summary_path.exists():
        try:
            summary_path.unlink()
            logger.info(f"Invalidated cached summary for {uuid}")
        except Exception as e:
            logger.warning(f"Failed to invalidate summary: {e}")

    logger.info(f"Updated speaker names for {uuid}")

    return SpeakerUpdateResponse(
        uuid=uuid,
        status="success",
        message="Speaker names updated successfully",
        transcript=updated_transcript
    )


@app.post("/api/v1/jobs/{uuid}/speaker-identifications", response_model=SpeakerIdentificationResponse)
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
            logger.info(f"Successfully identified speakers for {uuid}")
            return SpeakerIdentificationResponse(
                uuid=uuid,
                status="success",
                suggestions=identification_result["suggestions"]
            )
        else:
            logger.error(f"Speaker identification failed for {uuid}")
            raise HTTPException(
                status_code=500,
                detail=identification_result.get("message", "Speaker identification failed")
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during speaker identification: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during speaker identification")


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
        logger.error(f"Error generating PDF: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during PDF generation")


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
            generated_on = datetime.now().strftime('%B %d, %Y at %I:%M %p')

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
        logger.error(f"Error generating markdown: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during markdown generation")


@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint."""
    try:
        # Check database connection
        total_jobs = get_jobs_count()

        return {
            "status": "ok",
            "version": "1.0.0",
            "jobs_count": total_jobs,
            "device": DEVICE
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
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
