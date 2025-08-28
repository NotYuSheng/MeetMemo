"""FastAPI application for audio transcription and speaker diarization."""
import csv
import json
import logging
import os
import re
import tempfile
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from threading import Lock

import requests
import whisper
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from pyannote.audio import Pipeline
from pydantic import BaseModel
from pydub import AudioSegment

from pyannote_whisper.utils import diarize_text
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus.frames import Frame
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from io import BytesIO
from fastapi.responses import StreamingResponse
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF
import os

# Start up the app
app = FastAPI()    

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not os.path.exists("logs/app.log"):
    os.makedirs("logs", exist_ok=True)
    with open("logs/app.log", "w") as f:
        f.write("")  # Create an empty log file if it doesn't exist

# Store logs inside the volume
logging.basicConfig(level=logging.INFO,
                    filename='logs/app.log',
                    filemode='a',
                    )

# Variables 
load_dotenv('.env')
UPLOAD_DIR = "audiofiles"
CSV_LOCK = Lock()
CSV_FILE = "audiofiles/audiofiles.csv"
FIELDNAMES = ["uuid", "file_name", "status_code"]
DEVICE = "cuda:0" 

# Ensure required directories exist
os.makedirs("transcripts", exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

###################################### Classes ######################################
class SpeakerNameMapping(BaseModel):
    '''Pydantic model for mapping old speaker names to new ones.'''
    mapping: dict[str, str]

class SummarizeRequest(BaseModel):
    '''Pydantic model for summarization requests with optional custom prompts.'''
    custom_prompt: str = None
    system_prompt: str = None

class SpeakerIdentificationRequest(BaseModel):
    '''Pydantic model for LLM-based speaker identification requests.'''
    context: str = None  # Optional context about the meeting/speakers

##################################### Functions #####################################
def get_timestamp() -> str:
    '''
    Gets the current date & time in the `YYYY-MM-DD H:MM:SS` format.
    '''
    tz_gmt8 = timezone(timedelta(hours=8))
    return datetime.now(tz_gmt8).strftime("%Y-%m-%d %H:%M:%S")


def normalize_uuid(uuid: str) -> str:
    """
    Normalize UUID to handle both 4-digit format and full UUID strings.
    For 4-digit or shorter numeric strings, pad with zeros.
    For longer UUIDs, return as-is.
    """
    if len(uuid) <= 4 and uuid.isdigit():
        return uuid.zfill(4)
    return uuid


def format_result(diarized: list) -> list[dict]:
    """
    Formats the diarized results into a list of dictionaries,
    each with speaker, text, start, and end time.
    
    diarized: list of tuples (segment, speaker, utterance)
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
    If the speaker name doesn't match SPEAKER_XX pattern, return as-is (manual rename takes priority).
    """
    if not speaker_name:
        return "Speaker 1"
    
    # Check if it matches SPEAKER_XX pattern
    import re
    match = re.match(r'^SPEAKER_(\d+)$', speaker_name)
    if match:
        speaker_number = int(match.group(1)) + 1  # Convert 0-based to 1-based
        return f"Speaker {speaker_number}"
    
    # If it doesn't match the pattern, it's likely a manual rename - return as-is
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
            
            if text:  # Only include entries with actual text
                formatted_lines.append(f"{formatted_speaker}: {text}")
        
        return "\n\n".join(formatted_lines)
    except json.JSONDecodeError:
        # If JSON parsing fails, return the original string
        return transcript_json


def get_unique_filename(directory: str, desired_filename: str, exclude_path: str = None) -> str:
    """
    Generate a unique filename by appending a counter if needed.
    
    Args:
        directory: Directory to check for existing files
        desired_filename: The desired filename
        exclude_path: Optional path to exclude from collision check (for renames)
    
    Returns:
        A unique filename
    """
    original_filename = desired_filename
    filename = original_filename
    file_path = os.path.join(directory, filename)
    
    # Handle filename collisions by appending counter
    counter = 1
    while os.path.exists(file_path) and file_path != exclude_path:
        name, ext = os.path.splitext(original_filename)
        filename = f"{name}_{counter}{ext}"
        file_path = os.path.join(directory, filename)
        counter += 1
    
    return filename


def upload_audio(uuid: str, file: UploadFile) -> str:
    """
    Uploads the audio file to the desired directory,
    & returns the resultant file name in string form.
    Handles filename collisions by appending a counter.
    """
    
    filename = get_unique_filename(UPLOAD_DIR, file.filename)
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    # Save the file to disk
    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    return filename

def add_job(uuid: str, file_name: str, status_code: str) -> None:
    """
    Inserts a new job in the CSV.  
    Reads all rows, adds the new one, sorts by numeric uuid,  
    then rewrites the entire file.
    """
    with CSV_LOCK:
        rows = []
        if os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "r", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    rows.append(row)

        rows.append({
            "uuid":        uuid,
            "file_name":   file_name,
            "status_code": status_code
        })

        # Sort by UUID - handle both numeric (legacy) and string UUID formats
        def uuid_sort_key(row):
            uuid_str = row["uuid"]
            try:
                # Try to parse as integer (old 4-digit format)
                return (0, int(uuid_str))  # Legacy UUIDs first
            except ValueError:
                # For string UUIDs, sort lexicographically after legacy ones
                return (1, uuid_str)  # New UUIDs after legacy ones
        
        rows.sort(key=uuid_sort_key)

        with open(CSV_FILE, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)


def update_status(uuid: str, new_status: str) -> None:
    """
    Read the existing CSV, update the status_code for the matching uuid,
    and write out to a temporary file which then replaces the original.
    """
    with CSV_LOCK:
        dir_name = os.path.dirname(CSV_FILE) or "."
        fd, temp_path = tempfile.mkstemp(dir=dir_name, text=True)
        try:
            with os.fdopen(fd, "w", newline="") as tmpf, open(CSV_FILE, "r", newline="") as csvf:
                reader = csv.DictReader(csvf)
                writer = csv.DictWriter(tmpf, fieldnames=FIELDNAMES)
                writer.writeheader()

                for row in reader:
                    if row["uuid"] == uuid:
                        row["status_code"] = new_status
                    writer.writerow(row)
            os.replace(temp_path, CSV_FILE)
        except Exception:
            os.remove(temp_path)
            raise        

def parse_transcript_with_times(text: str) -> dict:
    # allow lowercase, optional colon, flexible whitespace
    pattern = re.compile(
        r'(?P<start>\d+\.\d+)\s+'                   # start time
        r'(?P<end>\d+\.\d+)\s+'                     # end time
        r'(?P<speaker>speaker_\d+):?\s+'            # speaker label (case-insensitive, optional colon)
        r'(?P<utterance>.*?)'                       # the spoken text
        r'(?=(?:\d+\.\d+\s+\d+\.\d+\s+speaker_\d+)|\Z)',  
        re.DOTALL | re.IGNORECASE                   # match across lines, ignore case
    )

    speakers = defaultdict(list)
    for m in pattern.finditer(text):
        speakers[m.group('speaker').lower()].append({
            'start': float(m.group('start')),
            'end':   float(m.group('end')),
            'text':  m.group('utterance').strip()
        })

    return dict(speakers)

def summarise_transcript(transcript: str, custom_prompt: str = None, system_prompt: str = None) -> str:
    """
    Summarises the transcript using a defined LLM.
    
    Args:
        transcript: The transcript text to summarize
        custom_prompt: Optional custom user prompt. If None, uses default prompt.
        system_prompt: Optional custom system prompt. If None, uses default system prompt.
    """

    base_url = str(os.getenv("LLM_API_URL"))
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    model_name = str(os.getenv("LLM_MODEL_NAME"))

    # Default system prompt
    default_system_prompt = "You are a helpful assistant that summarizes meeting transcripts. You will give a concise summary of the key points, decisions made, and any action items, outputting it in markdown format."
    
    # Default user prompt
    default_user_prompt = (
        "Please provide a concise summary of the following meeting transcript, "
        "highlighting participants, key points, action items & next steps."
        "The summary should contain point forms phrased in concise standard English."
        "You are to give the final summary in markdown format for easier visualisation."
        "Do not give the output in an integrated code block i.e.: '```markdown ```"
        "Output the summary directly. Do not add a statement like 'Here is the summary:' before the summary itself."
    )

    # Use custom prompts if provided, otherwise use defaults
    final_system_prompt = system_prompt if system_prompt else default_system_prompt
    
    # Always append transcript to user prompt, whether custom or default
    if custom_prompt:
        final_user_prompt = custom_prompt + "\n\n" + transcript
    else:
        final_user_prompt = default_user_prompt + "\n\n" + transcript 

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
        
        resp = requests.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        summary = data["choices"][0]["message"]["content"].strip()
        return summary
    
    except requests.RequestException as e:
        return f"Error: {e}"

def identify_speakers_with_llm(transcript: str, context: str = None) -> dict:
    """
    Use LLM to identify and suggest names for speakers in the transcript.
    
    Args:
        transcript: The formatted transcript text with speakers
        context: Optional context about the meeting or expected participants
        
    Returns:
        dict: Mapping of generic speaker IDs to suggested names
    """
    base_url = str(os.getenv("LLM_API_URL"))
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    model_name = str(os.getenv("LLM_MODEL_NAME"))
    
    # System prompt for speaker identification
    system_prompt = (
        "You are an expert at analyzing meeting transcripts to identify speakers. "
        "Your task is to suggest likely names or roles for each speaker based on "
        "the content of their speech, context clues, and conversation patterns. "
        "Respond with a JSON object mapping speaker IDs to suggested identifications."
    )
    
    # Build user prompt
    user_prompt = (
        "Please analyze the following meeting transcript and suggest identifications for each speaker. "
        "Look for clues like:\n"
        "- Job titles, roles, or responsibilities mentioned\n"
        "- Names mentioned by other speakers\n"
        "- Speaking patterns and authority levels\n"
        "- Technical expertise or domain knowledge\n"
        "- Meeting facilitation behavior\n\n"
        "Respond with a JSON object in this format:\n"
        '{"Speaker 1": "John Smith (CEO)", "Speaker 2": "Sarah Johnson (CTO)", "Speaker 3": "Meeting Facilitator"}\n\n'
    )
    
    if context:
        user_prompt += f"Additional context about this meeting: {context}\n\n"
    
    user_prompt += f"Transcript:\n{transcript}"
    
    payload = {
        "model": model_name,
        "temperature": 0.1,  # Low temperature for more consistent identification
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
        
        resp = requests.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        response_text = data["choices"][0]["message"]["content"].strip()
        
        # Parse JSON response
        try:
            speaker_suggestions = json.loads(response_text)
            return {"status": "success", "suggestions": speaker_suggestions}
        except json.JSONDecodeError:
            # If JSON parsing fails, return the raw response for debugging
            return {"status": "error", "message": "Failed to parse LLM response as JSON", "raw_response": response_text}
            
    except requests.RequestException as e:
        return {"status": "error", "message": f"LLM request failed: {e}"}

def convert_to_wav(input_path: str, output_path: str, sample_rate: int = 16000):
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_frame_rate(sample_rate).set_channels(1)  # 16kHz mono
    audio.export(output_path, format="wav")

def generate_professional_pdf(summary_data: dict, transcript_data: list, generated_on: str = None) -> BytesIO:
    """
    Generate a professional PDF using ReportLab with summary and transcript data.
    """
    buffer = BytesIO()
    
    # Custom document class with footer on every page
    class FooterDocTemplate(BaseDocTemplate):
        def __init__(self, filename, **kwargs):
            BaseDocTemplate.__init__(self, filename, **kwargs)
            
        def afterPage(self):
            """Add footer to every page"""
            self.canv.saveState()
            
            # Footer content
            footer_text = "Generated by MeetMemo AI - This content is AI-generated and may contain inaccuracies. Please verify important information."
            page_number_text = f"Page {self.page}"
            
            # Set footer style
            self.canv.setFont('Helvetica', 8)
            self.canv.setFillColor(colors.HexColor('#7f8c8d'))
            
            # Add disclaimer footer (centered)
            text_width = self.canv.stringWidth(footer_text, 'Helvetica', 8)
            self.canv.drawString(
                (A4[0] - text_width) / 2, 
                30, 
                footer_text
            )
            
            # Add page number (right aligned)
            page_text_width = self.canv.stringWidth(page_number_text, 'Helvetica', 8)
            self.canv.drawString(
                A4[0] - inch - page_text_width,
                50,
                page_number_text
            )
            
            self.canv.restoreState()
    
    doc = FooterDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch*1.2  # Extra space for footer
    )
    
    # Define page template
    frame = Frame(inch, inch*1.2, A4[0] - 2*inch, A4[1] - 2.2*inch, id='normal')
    template = PageTemplate(id='normal', frames=frame)
    doc.addPageTemplates([template])
    
    # Define styles
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
    
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Heading2'],
        fontSize=16,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#34495e')
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
        alignment=TA_JUSTIFY,
        leftIndent=0,
        rightIndent=0
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
    
    # Story elements
    story = []
    
    # Header with logo
    try:
        # Load the MeetMemo logo
        logo_path = os.path.join(os.path.dirname(__file__), 'meetmemo-logo.svg')
        if os.path.exists(logo_path):
            # Convert SVG to ReportLab drawing
            drawing = svg2rlg(logo_path)
            # Scale the logo to appropriate size (about 40 points high)
            scale_factor = 40 / drawing.height
            drawing.width *= scale_factor
            drawing.height *= scale_factor
            drawing.scale(scale_factor, scale_factor)
            
            # Create a header table with logo and title
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
            # Fallback to text header if logo not found
            story.append(Paragraph("🎯 MeetMemo", title_style))
            story.append(Paragraph("AI Summary", subtitle_style))
    except Exception as e:
        # Fallback to text header if there's any error with logo
        story.append(Paragraph("🎯 MeetMemo", title_style))
        story.append(Paragraph("AI Summary", subtitle_style))
    
    story.append(Spacer(1, 20))
    
    # Meeting Info Section
    if summary_data:
        story.append(Paragraph("📋 Meeting Information", heading_style))
        
        # Create info table
        meeting_info = [
            ['File Name:', summary_data.get('meetingTitle', 'Untitled Meeting')],
            ['Generated On:', generated_on or datetime.now().strftime('%B %d, %Y at %I:%M %p')],
            ['Document Type:', 'Meeting Summary & Transcript']
        ]
        
        info_table = Table(meeting_info, colWidths=[2*inch, 4*inch])
        info_table.setStyle(TableStyle([
            # Clean, minimal design with subtle borders
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8f9fa')),  # Very light gray for labels
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#495057')),   # Dark gray text
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),                # Clean white for values
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#212529')),   # Near-black text
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dee2e6')),  # Subtle border
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        story.append(info_table)
        story.append(Spacer(1, 20))
        
        # Summary Section
        story.append(Paragraph("📝 Executive Summary", heading_style))
        
        summary_text = summary_data.get('summary', 'No summary available')
        
        # Process markdown-like formatting in summary with improved parsing
        def process_markdown_text(text):
            """Convert markdown formatting to ReportLab HTML tags"""
            import re
            
            # Handle inline bold text (e.g., **text:** or **text**)
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
            
            # Handle inline italic text (e.g., *text*)
            text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<i>\1</i>', text)
            
            # Handle inline code (e.g., `code`)
            text = re.sub(r'`([^`]+)`', r'<font name="Courier"><i>\1</i></font>', text)
            
            return text
        
        summary_lines = summary_text.split('\n')
        for line in summary_lines:
            line = line.strip()
            if not line:
                story.append(Spacer(1, 6))
                continue
                
            if line.startswith('# '):
                # Skip title as we already have it
                continue
            elif line.startswith('### ') or line.startswith('## '):
                # Sub-heading
                prefix_len = 4 if line.startswith('### ') else 3
                sub_heading = process_markdown_text(line[prefix_len:])
                story.append(Paragraph(f"• {sub_heading}", ParagraphStyle(
                    'SubHeading',
                    parent=body_style,
                    fontSize=12,
                    textColor=colors.HexColor('#2980b9'),
                    fontName='Helvetica-Bold',
                    spaceBefore=10
                )))
            elif line.startswith('- ') or line.startswith('* '):
                # Bullet point
                bullet_text = process_markdown_text(line[2:])
                story.append(Paragraph(f"  ◦ {bullet_text}", body_style))
            elif line.startswith(('1. ', '2. ', '3. ', '4. ', '5. ', '6. ', '7. ', '8. ', '9. ')):
                # Numbered list item
                # Find where the number ends
                space_index = line.find(' ')
                if space_index > 0:
                    number = line[:space_index]
                    list_text = process_markdown_text(line[space_index+1:])
                    story.append(Paragraph(f"  {number} {list_text}", body_style))
                else:
                    processed_line = process_markdown_text(line)
                    story.append(Paragraph(processed_line, body_style))
            else:
                # Regular text with markdown processing
                processed_line = process_markdown_text(line)
                story.append(Paragraph(processed_line, body_style))
        
        story.append(Spacer(1, 30))
    
    # Transcript Section
    if transcript_data:
        story.append(Paragraph("💬 Full Transcript", heading_style))
        story.append(Spacer(1, 10))
        
        for i, entry in enumerate(transcript_data):
            raw_speaker = entry.get('speaker', 'Unknown Speaker')
            speaker = format_speaker_name(raw_speaker)
            text = entry.get('text', '')
            start_time = entry.get('start', '0.00')
            end_time = entry.get('end', '0.00')
            
            # Speaker and timestamp
            timestamp_text = f"[{start_time}s - {end_time}s]"
            speaker_line = f"<b>{speaker}</b> {timestamp_text}"
            story.append(Paragraph(speaker_line, speaker_style))
            
            # Speech text
            story.append(Paragraph(text, transcript_style))
            
            # Add some space between speakers, but not too much
            if i < len(transcript_data) - 1:
                story.append(Spacer(1, 8))
    
    # Content ends here - footers are handled by the document template
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer


##################################### Main routes for back-end #####################################
@app.get("/jobs")
def get_jobs() -> dict:
    """
    Returns a dict of all jobs in the CSV, keyed by uuid,
    each mapping to its file_name and status_code.
    """
    try:
        if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()

        jobs = {}
        with open(CSV_FILE, "r", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row.get("uuid") or not row.get("file_name"):
                    continue
                jobs[row["uuid"]] = {
                    "file_name": row["file_name"],
                    "status_code": row.get("status_code", "")
                }

        if not jobs:
            return {"csv_list": {}}
        return {"csv_list": jobs}

    except Exception as e:
        return {"error": str(e)}


@app.post("/jobs")
def transcribe(file: UploadFile, model_name: str = "turbo") -> dict:
    '''
    Gets the audio file from the front-end form data, & transcribes it using the Whisper turbo model.

    Returns an array of speaker-utterance pairs to be displayed on the front-end.
    '''
    # Generate a proper UUID4
    job_uuid = str(uuid.uuid4())

    if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()
    
    try:
        file_name = upload_audio(job_uuid, file)
        file_path = os.path.join(UPLOAD_DIR, file_name)

        # Check and convert to WAV if needed
        if not file_name.lower().endswith(".wav"):
            wav_file_name = f"{os.path.splitext(file_name)[0]}.wav"
            wav_file_path = os.path.join(UPLOAD_DIR, wav_file_name)
            convert_to_wav(file_path, wav_file_path)
            file_path = wav_file_path  # update path for Whisper/Pyannote
        else:
            wav_file_name = file_name  # keep the original if already WAV

        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Created transcription request for file: {wav_file_name} and UUID: {job_uuid} with model: {model_name}")
        add_job(job_uuid, os.path.splitext(file_name)[0] + '.wav',"202")
        model = whisper.load_model(model_name)
        device = DEVICE
        model = model.to(device)
        file_path = os.path.join(UPLOAD_DIR, wav_file_name)
        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Processing file {wav_file_name} with model {model_name}")

        # Transcription & diarization of text
        hf_token = os.getenv("HF_TOKEN")
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization", 
            use_auth_token=hf_token
        )
        asr = model.transcribe(file_path, language="en")
        diarization = pipeline(file_path)

        # Format the transcribed + diarized results as array of speaker-utterance pairs
        diarized = diarize_text(asr, diarization)
        full_transcript = format_result(diarized=diarized)

        # Save results & log activity process
        timestamp = get_timestamp()
        os.makedirs("transcripts", exist_ok=True)
        json_path = os.path.join("transcripts", f"{file_name}.wav.json")
        if not os.path.exists(json_path):
            with open(os.path.join("transcripts", f"{file_name.split('.')[0]}.wav.json"), "w", encoding="utf-8") as f:
                json.dump(full_transcript, f, indent=4)

        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Successfully processed file {file_name} with model {model_name}")
        update_status(job_uuid, "200") 
        return {"uuid": job_uuid, "file_name": file_name, "transcript": full_transcript}
    
    # Catch any errors when trying to transcribe & diarize recording
    except Exception as e:
        timestamp = get_timestamp()
        file_name = file.filename
        logging.error(f"{timestamp}: Error processing file {file_name}: {e}", exc_info=True)
        update_status(job_uuid, "500")
        return {"uuid": job_uuid, "file_name": file_name, "error": str(e), "status_code": "500"}

@app.delete("/jobs/{uuid}")
def delete_job(uuid: str) -> dict:
    """
    Deletes the job with the given UUID, including the audio file and its transcript.
    """
    file_name = None
    uuid = normalize_uuid(uuid)  

    if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()

    with CSV_LOCK:
        with open(CSV_FILE, "r") as f:
            reader = csv.reader(f)
            rows = list(reader)
        for row in rows:
            if row[0] == uuid:
                file_name = row[1]
                rows.remove(row)
                break
        else:
            return {"error": "UUID not found", "status_code": "404"}

        with open(CSV_FILE, "w", newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
    try:
        os.remove(os.path.join(UPLOAD_DIR, file_name))
    except FileNotFoundError:
        timestamp = get_timestamp()
        logging.warning(f"{timestamp}: File {file_name} not found in {UPLOAD_DIR}. It may have already been deleted.")
    try:  
        os.remove(os.path.join("transcripts", f"{file_name}.json"))
    except FileNotFoundError:
        timestamp = get_timestamp()
        logging.warning(f"{timestamp}: Transcript {file_name}.json not found in transcripts directory. It may have already been deleted.")

    timestamp = get_timestamp()
    logging.info(f"{timestamp}: Deleted job with UUID: {uuid}, file name: {file_name}")
    return {"uuid": uuid, "status": "success", "message": f"Job with UUID {uuid} and file {file_name} deleted successfully.", "status_code": "204"}

@app.get("/jobs/{uuid}/filename")
def get_file_name(uuid: str) -> dict:
    """
    Returns the file name associated with the given UUID.
    """
    uuid = normalize_uuid(uuid)

    if not os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()

    with open(CSV_FILE, "r") as f:
        reader = csv.reader(f)
        for row in reader:
            if row[0] == uuid:
                return {"uuid": uuid, "file_name": row[1]}
            
    return {"error": f"UUID: {uuid} not found", "status_code": "404", "file_name": "404"}

@app.get("/jobs/{uuid}/status")
def get_job_status(uuid: str):
    """
    Returns the file_name and status for the given uuid,
    reading from jobs.csv (uuid, file_name, status_code).
    """
    uuid = normalize_uuid(uuid)
    file_name = "unknown"
    status_code = "404"

    if not os.path.isfile(CSV_FILE):
        with open(CSV_FILE, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writeheader()

    with open(CSV_FILE, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("uuid") == uuid:
                file_name = row.get("file_name", "unknown")
                status_code = row.get("status_code", "")
                break

    status_map = {
        "200": "completed",
        "202": "processing",
        "204": "deleted",
        "404": "does not exist",
        "500": "error"
    }

    if status_code in status_map:
        status = status_map[status_code]
    else:
        log_msg = ""
        logs = get_logs().get("logs", [])
        for entry in logs:
            if uuid in entry:
                log_msg += entry + "\n"
        status = log_msg or "unknown"

    return {"uuid": uuid, "file_name": file_name, "status_code": status_code, "status": status}

@app.get("/jobs/{uuid}/transcript")
def get_file_transcript(uuid: str) -> dict:
    """
    Returns the raw full transcript for the given UUID.
    """
    try:
        uuid = normalize_uuid(uuid)
        file_name = get_file_name(uuid)["file_name"]
        file_path = f"transcripts/{file_name}.json"
        timestamp = get_timestamp()
        logging.info(f"{timestamp}: Retrieving transcript for UUID: {uuid}, file name: {file_name}")
        
        if os.path.exists(file_path):
            full_transcript = []
            with open(file_path, "r", encoding="utf-8") as f:
                full_transcript = f.read()
            timestamp = get_timestamp()
            logging.info(f"{timestamp}: Successfully retrieved raw transcript for UUID: {uuid}, file name: {file_name}")
            return {"uuid": uuid, "status": "exists", "full_transcript": full_transcript, "file_name": file_name, "status_code":"200"}
        else:
            timestamp = get_timestamp()
            logging.error(f"{timestamp}: {file_name} transcript not found.")
            return {"uuid": uuid, "status": "not found", "status_code":"404"}
    except Exception as e: 
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error retrieving {file_name} transcript.")
        return {"uuid": uuid, "status": "error", "error":e, "status_code":"500",}

@app.delete("/jobs/{uuid}/summary")
def delete_summary(uuid: str) -> dict:
    """
    Deletes the cached summary for the given UUID.
    """
    try:
        uuid = normalize_uuid(uuid)
        file_name = get_file_name(uuid)["file_name"]
        summary_dir = Path("summary")
        summary_path = summary_dir / f"{uuid}.txt"
        
        if summary_path.exists():
            summary_path.unlink()
            timestamp = get_timestamp()
            logging.info(f"{timestamp}: Deleted cached summary for UUID: {uuid}, file name: {file_name}")
            return {
                "uuid": uuid,
                "fileName": file_name,
                "status": "success",
                "message": "Summary deleted successfully",
                "status_code": "200"
            }
        else:
            timestamp = get_timestamp()
            logging.warning(f"{timestamp}: No cached summary found to delete for UUID: {uuid}, file name: {file_name}")
            return {
                "uuid": uuid,
                "fileName": file_name,
                "status": "not_found",
                "message": "No cached summary found",
                "status_code": "404"
            }
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error deleting summary for UUID: {uuid}: {e}", exc_info=True)
        return {"uuid": uuid, "status": "error", "error": str(e), "status_code": "500"}

@app.post("/jobs/{uuid}/summarise")
def summarise_job(uuid: str, request: SummarizeRequest = None) -> dict[str, str]:
    """
    Summarises the transcript for the given UUID using a defined LLM.
    Summary is cached to a text file in the "summary" folder.
    Accepts optional custom prompts via request body.
    """
    uuid = normalize_uuid(uuid)
    file_name_response = get_file_name(uuid)
    if "error" in file_name_response:
        return {"error": f"File not found for UUID: {uuid}", "status_code": "404"}
    file_name = file_name_response["file_name"]
    summary_dir = Path("summary")
    summary_dir.mkdir(exist_ok=True)
    summary_path = summary_dir / f"{uuid}.txt"

    # Return cached summary if it exists
    if summary_path.exists():
        try:
            cached_summary = summary_path.read_text(encoding="utf-8")
            timestamp = get_timestamp()
            logging.info(f"{timestamp}: Returned cached summary for UUID: {uuid}, file name: {file_name}")
            return {
                "uuid": uuid,
                "fileName": file_name,
                "status": "success",
                "status_code": "200",
                "summary": cached_summary
            }
        except Exception as e:
            timestamp = get_timestamp()
            logging.error(f"{timestamp}: Error reading cached summary for UUID: {uuid}, file name: {file_name}: {e}", exc_info=True)
            # Fall through to generate new summary if reading cached summary fails

    # Generate new summary if not cached or error reading cached
    try:
        get_full_transcript_response = get_file_transcript(uuid)
        if get_full_transcript_response["status"] == "not found":
            return {"error": f"Transcript not found for the given UUID: {uuid}."}
        else:
            full_transcript_json = get_full_transcript_response["full_transcript"]
            # Format the transcript with proper speaker names for LLM consumption
            formatted_transcript = format_transcript_for_llm(full_transcript_json)

        # Use custom prompts if provided
        custom_prompt = None
        system_prompt = None
        if request:
            custom_prompt = request.custom_prompt
            system_prompt = request.system_prompt

        summary = summarise_transcript(formatted_transcript, custom_prompt, system_prompt)
        timestamp = get_timestamp()

        if "Error" in summary:
            logging.error(f"{timestamp}: Error summarising transcript for UUID: {uuid}, file name: {file_name}")
            return {"uuid": uuid, "file_name": file_name, "status": "error", "summary": summary, "status_code": "500"}
        else:
            # Save summary to file
            try:
                summary_path.write_text(summary, encoding="utf-8")
            except Exception as e:
                logging.error(f"{timestamp}: Error saving summary to file for UUID: {uuid}, file name: {file_name}: {e}", exc_info=True)

            logging.info(f"{timestamp}: Summarised transcript for UUID: {uuid}, file name: {file_name}")
            return {
                "uuid": uuid,
                "fileName": file_name,
                "status": "success",
                "status_code": "200",
                "summary": summary
            }

    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error summarising transcript for UUID: {uuid}, file name: {file_name}: {e}", exc_info=True)
        return {"uuid": uuid, "file_name": file_name, "error": str(e), "status_code": "500", "summary": ""}  # type: ignore

@app.patch("/jobs/{uuid}/rename")
def rename_job(uuid: str, new_name: str) -> dict:
    """
    Renames the job with the given UUID.
    Handles filename collisions by appending a counter if needed.
    """
    uuid = normalize_uuid(uuid)
    
    with CSV_LOCK:
        rows = []
        file_name_to_rename = None
        if os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "r", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row["uuid"] == uuid:
                        file_name_to_rename = row["file_name"]
                        break

        if not file_name_to_rename:
            return {"error": "UUID not found", "status_code": "404"}
        
        # Get unique filename, excluding the current file from collision check
        old_audio_path = os.path.join(UPLOAD_DIR, file_name_to_rename)
        unique_new_name = get_unique_filename(UPLOAD_DIR, new_name, exclude_path=old_audio_path)
        
        # Update CSV with the unique filename
        if os.path.isfile(CSV_FILE):
            with open(CSV_FILE, "r", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row["uuid"] == uuid:
                        row["file_name"] = unique_new_name
                    rows.append(row)

        with open(CSV_FILE, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)
        
        # Rename the audio file
        new_audio_path = os.path.join(UPLOAD_DIR, unique_new_name)
        if os.path.exists(old_audio_path):
            os.rename(old_audio_path, new_audio_path)

        # Rename the transcript file
        old_transcript_path = os.path.join("transcripts", f"{file_name_to_rename}.json")
        new_transcript_path = os.path.join("transcripts", f"{unique_new_name}.json")
        if os.path.exists(old_transcript_path):
            os.rename(old_transcript_path, new_transcript_path)
        
        return {"uuid": uuid, "status": "success", "new_name": unique_new_name}
        
@app.patch("/jobs/{uuid}/speakers")
def rename_speakers(uuid: str, speaker_map: SpeakerNameMapping) -> dict:
    """
    Updates the speaker names in a transcript file based on a provided mapping.
    
    Expects a JSON body with a 'mapping' key, e.g.:
    {
        "mapping": {
            "SPEAKER_00": "Alice",
            "SPEAKER_01": "Bob"
        }
    }
    """
    try:
        uuid = normalize_uuid(uuid)
        timestamp = get_timestamp()
        
        # 1. Get the filename associated with the UUID
        filename_response = get_file_name(uuid)
        if "error" in filename_response:
            logging.error(f"{timestamp}: No file found for UUID {uuid} during speaker rename attempt.")
            return {"error": f"UUID {uuid} not found", "status_code": "404"}
            
        file_name = filename_response["file_name"]
        transcript_path = os.path.join("transcripts", f"{file_name}.json")

        # 2. Check if the transcript file exists
        if not os.path.exists(transcript_path):
            logging.error(f"{timestamp}: Transcript file not found at {transcript_path} for UUID {uuid}.")
            return {"error": "Transcript file not found", "status_code": "404"}

        # 3. Read, update, and write the transcript data
        temp_file_path = transcript_path + ".tmp"
        with open(transcript_path, "r", encoding="utf-8") as f_read, open(temp_file_path, "w", encoding="utf-8") as f_write:
            transcript_data = json.load(f_read)
            
            # Create a copy of the mapping from the Pydantic model
            name_map = speaker_map.mapping

            # Iterate through each segment and update the speaker name if it's in the map
            # Normalize None to placeholder
            for segment in transcript_data:
                original_speaker = (segment.get("speaker") or "SPEAKER_00").strip()

                if original_speaker in name_map:
                    segment["speaker"] = name_map[original_speaker].strip()
            
            json.dump(transcript_data, f_write, indent=4)

        # Atomically replace the original file with the updated one
        os.replace(temp_file_path, transcript_path)

        # Invalidate cached summary since speaker names have changed
        summary_dir = Path("summary")
        summary_path = summary_dir / f"{uuid}.txt"
        if summary_path.exists():
            try:
                summary_path.unlink()
                logging.info(f"{timestamp}: Invalidated cached summary for UUID {uuid} due to speaker rename")
            except Exception as e:
                logging.warning(f"{timestamp}: Failed to invalidate cached summary for UUID {uuid}: {e}")

        logging.info(f"{timestamp}: Successfully renamed speakers for UUID {uuid}, file: {file_name}")
        return {
            "uuid": uuid, 
            "status": "success", 
            "message": "Speaker names updated successfully.",
            "status_code": "200",
            "transcript": transcript_data
        }

    except json.JSONDecodeError as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Error decoding JSON for UUID {uuid}: {e}", exc_info=True)
        return {"uuid": uuid, "status": "error", "error": "Invalid transcript file format.", "status_code": "500"}
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: An unexpected error occurred while renaming speakers for UUID {uuid}: {e}", exc_info=True)
        return {"uuid": uuid, "status": "error", "error": str(e), "status_code": "500"}

@app.post("/jobs/{uuid}/identify-speakers")
def identify_speakers(uuid: str, request: SpeakerIdentificationRequest = None):
    """
    Use LLM to identify and suggest names for speakers in a transcript.
    
    Args:
        uuid: The UUID of the transcript
        request: Optional context about the meeting/speakers
        
    Returns:
        JSON object with speaker identification suggestions
    """
    timestamp = get_timestamp()
    logging.info(f"{timestamp}: Starting LLM speaker identification for UUID {uuid}")
    
    try:
        # Get the transcript
        get_full_transcript_response = get_file_transcript(uuid)
        if get_full_transcript_response["status"] == "not found":
            return {"error": f"Transcript not found for the given UUID: {uuid}.", "status_code": "404"}
        
        full_transcript_json = get_full_transcript_response["full_transcript"]
        
        # Format the transcript for LLM consumption
        formatted_transcript = format_transcript_for_llm(full_transcript_json)
        
        if not formatted_transcript.strip():
            return {"error": "Transcript is empty or could not be formatted.", "status_code": "400"}
        
        # Extract context from request if provided
        context = None
        if request and hasattr(request, 'context'):
            context = request.context
        
        # Use LLM to identify speakers
        identification_result = identify_speakers_with_llm(formatted_transcript, context)
        
        if identification_result["status"] == "success":
            logging.info(f"{timestamp}: Successfully identified speakers for UUID {uuid}")
            return {
                "uuid": uuid,
                "status": "success",
                "suggestions": identification_result["suggestions"],
                "status_code": "200"
            }
        else:
            logging.error(f"{timestamp}: LLM speaker identification failed for UUID {uuid}: {identification_result.get('message', 'Unknown error')}")
            return {
                "uuid": uuid,
                "status": "error",
                "error": identification_result.get("message", "Speaker identification failed"),
                "raw_response": identification_result.get("raw_response"),
                "status_code": "500"
            }
            
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Unexpected error during speaker identification for UUID {uuid}: {e}", exc_info=True)
        return {"uuid": uuid, "status": "error", "error": str(e), "status_code": "500"}

##################################### Functionality check #####################################
@app.get("/health")
def health_check():
    """
    Health check to verify if the application is running correctly."""
    error_msg = ''
    try:
        logs = get_logs()
        error_msg = [i for i in logs['logs'] if "error" in i.lower()]
        if error_msg:
            timestamp = get_timestamp()
            logging.error(f"{timestamp}: Health check found errors: {error_msg}")
            return {"status": "error", "message": error_msg, "status_code": "500"}
        else:
            timestamp = get_timestamp()
            logging.info(f"{timestamp}: Health check passed successfully.")
            return {"status": "ok", "status_code": "200"}
    except Exception as e:
        timestamp = get_timestamp()
        logging.error(f"{timestamp}: Health check failed: {e}")
        return {"status": "error", "error": str(e), "status_code": "500"}


def get_logs():
    """Placeholder function for getting logs."""
    return {"logs": []}

@app.post("/jobs/{uuid}/pdf")
async def export_professional_pdf(uuid: str, request: Request = None):
    """
    Generate and return a professional PDF with summary and transcript for the given UUID.
    """
    try:
        # Get summary data
        summary_response = summarise_job(uuid)
        summary_data = {
            'meetingTitle': summary_response.get('fileName', 'Untitled Meeting'),
            'summary': summary_response.get('summary', 'No summary available')
        }
        
        # Get transcript data
        transcript_response = get_file_transcript(uuid)
        transcript_json = transcript_response.get('full_transcript', '[]')
        transcript_data = json.loads(transcript_json) if transcript_json else []
        
        # Get timestamp from request body if provided
        generated_on = None
        if request:
            try:
                body = await request.json()
                generated_on = body.get('generated_on')
            except:
                pass
        
        # Generate professional PDF
        pdf_buffer = generate_professional_pdf(summary_data, transcript_data, generated_on)
        
        # Create filename
        safe_filename = summary_data['meetingTitle'].replace(' ', '_').replace('/', '_')
        filename = f"meetmemo_{safe_filename}_{uuid[:8]}.pdf"
        
        return StreamingResponse(
            BytesIO(pdf_buffer.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logging.error(f"Failed to generate PDF for UUID {uuid}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")