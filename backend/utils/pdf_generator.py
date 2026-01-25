"""
PDF generation utilities for MeetMemo exports.

This module provides functions for generating professional PDF documents
for meeting summaries and transcripts using ReportLab.
"""
import os
import re
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, Spacer, Table, TableStyle
from reportlab.platypus.doctemplate import BaseDocTemplate, PageTemplate
from reportlab.platypus.frames import Frame
from svglib.svglib import svg2rlg

from config import Settings, get_settings
from utils.formatters import format_speaker_name, format_timestamp


def _process_markdown_text(text: str) -> str:
    """
    Convert basic markdown formatting to ReportLab XML tags.

    Args:
        text: Text with markdown formatting

    Returns:
        Text with ReportLab XML tags
    """
    # Bold: **text** -> <b>text</b>
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    # Italic: *text* -> <i>text</i> (but not **text**)
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<i>\1</i>', text)
    return text


def _create_footer_doc_template(
    buffer: BytesIO,
    title: str,
    author: str,
    footer_text: str
) -> BaseDocTemplate:
    """
    Create a custom document template with footer on every page.

    Args:
        buffer: BytesIO buffer for the PDF
        title: Document title
        author: Document author
        footer_text: Text to display in footer

    Returns:
        Configured BaseDocTemplate
    """
    class FooterDocTemplate(BaseDocTemplate):
        """Custom document template with footer on every page."""

        def __init__(self, filename, footer_msg, **kwargs):
            self.footer_msg = footer_msg
            BaseDocTemplate.__init__(self, filename, **kwargs)

        def afterPage(self):
            """Add footer to every page."""
            self.canv.saveState()

            page_number_text = f"Page {self.page}"

            self.canv.setFont('Helvetica', 8)
            self.canv.setFillColor(colors.HexColor('#7f8c8d'))

            text_width = self.canv.stringWidth(self.footer_msg, 'Helvetica', 8)
            self.canv.drawString((A4[0] - text_width) / 2, 30, self.footer_msg)

            page_text_width = self.canv.stringWidth(page_number_text, 'Helvetica', 8)
            self.canv.drawString(A4[0] - inch - page_text_width, 50, page_number_text)

            self.canv.restoreState()

    doc = FooterDocTemplate(
        buffer,
        footer_msg=footer_text,
        pagesize=A4,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch * 1.2,
        title=title,
        author=author
    )

    frame = Frame(inch, inch * 1.2, A4[0] - 2 * inch, A4[1] - 2.2 * inch, id='normal')
    template = PageTemplate(id='normal', frames=frame)
    doc.addPageTemplates([template])

    return doc


def _get_custom_styles():
    """
    Get custom paragraph styles for PDF generation.

    Returns:
        Dictionary of custom styles
    """
    styles = getSampleStyleSheet()

    return {
        'title': ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#2c3e50')
        ),
        'heading': ParagraphStyle(
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
        ),
        'body': ParagraphStyle(
            'CustomBody',
            parent=styles['Normal'],
            fontSize=11,
            spaceAfter=6,
            alignment=TA_JUSTIFY
        ),
        'speaker': ParagraphStyle(
            'SpeakerStyle',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#e74c3c'),
            spaceBefore=8,
            fontName='Helvetica-Bold'
        ),
        'transcript': ParagraphStyle(
            'TranscriptStyle',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=4,
            leftIndent=20,
            alignment=TA_JUSTIFY
        ),
        'subheading': ParagraphStyle(
            'SubHeading',
            parent=styles['Normal'],
            fontSize=12,
            textColor=colors.HexColor('#2980b9'),
            fontName='Helvetica-Bold'
        )
    }


def _add_header_with_logo(story: list, header_text: str, title_style: ParagraphStyle):
    """
    Add header with logo to the PDF story.

    Args:
        story: List of flowables to add to
        header_text: Header text to display
        title_style: Style for fallback title
    """
    try:
        logo_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'meetmemo-logo.svg')
        if os.path.exists(logo_path):
            drawing = svg2rlg(logo_path)
            scale_factor = 40 / drawing.height
            drawing.width *= scale_factor
            drawing.height *= scale_factor
            drawing.scale(scale_factor, scale_factor)

            header_data = [[drawing, header_text]]
            header_table = Table(header_data, colWidths=[60, 5 * inch])
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
    except Exception:  # pylint: disable=broad-exception-caught
        story.append(Paragraph("MeetMemo", title_style))


def _add_meeting_info_table(
    story: list,
    meeting_title: str,
    generated_on: str,
    document_type: str,
    heading_style: ParagraphStyle
):
    """
    Add meeting information table to the PDF story.

    Args:
        story: List of flowables to add to
        meeting_title: Meeting title/filename
        generated_on: Formatted generation timestamp
        document_type: Type of document
        heading_style: Style for section heading
    """
    story.append(Paragraph("Meeting Information", heading_style))

    meeting_info = [
        ['File Name:', meeting_title or 'Untitled Meeting'],
        ['Generated On:', generated_on],
        ['Document Type:', document_type]
    ]

    info_table = Table(meeting_info, colWidths=[2 * inch, 4 * inch])
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


def _add_summary_section(story: list, summary_text: str, styles: dict):
    """
    Add summary section to the PDF story.

    Args:
        story: List of flowables to add to
        summary_text: Summary text (may contain markdown)
        styles: Dictionary of custom styles
    """
    story.append(Paragraph("Summary", styles['heading']))

    summary_lines = summary_text.rstrip().split('\n')
    # Remove trailing empty lines
    while summary_lines and not summary_lines[-1].strip():
        summary_lines.pop()

    for line in summary_lines:
        line = line.strip()
        if not line:
            story.append(Spacer(1, 6))
            continue

        # Skip H1 headings (usually just the title)
        if line.startswith('# '):
            continue

        # H2/H3 headings
        if line.startswith('### ') or line.startswith('## '):
            prefix_len = 4 if line.startswith('### ') else 3
            sub_heading = _process_markdown_text(line[prefix_len:])
            story.append(Paragraph(f"<bullet>&bull;</bullet> {sub_heading}", styles['subheading']))
        # Bullet points
        elif line.startswith('- ') or line.startswith('* '):
            bullet_text = _process_markdown_text(line[2:])
            story.append(Paragraph(f"  <bullet>&deg;</bullet> {bullet_text}", styles['body']))
        # Regular text
        else:
            processed_line = _process_markdown_text(line)
            story.append(Paragraph(processed_line, styles['body']))


def _add_transcript_section(
    story: list,
    transcript_data: list,
    styles: dict,
    add_page_break: bool = True
):
    """
    Add transcript section to the PDF story.

    Args:
        story: List of flowables to add to
        transcript_data: List of transcript segments
        styles: Dictionary of custom styles
        add_page_break: Whether to add a page break before transcript
    """
    if add_page_break:
        story.append(PageBreak())

    story.append(Paragraph("Full Transcript", styles['heading']))
    story.append(Spacer(1, 10))

    for entry in transcript_data:
        speaker = format_speaker_name(entry.get('speaker', 'Unknown Speaker'))
        text = entry.get('text', '')
        start_time = format_timestamp(entry.get('start', '0.00'))
        end_time = format_timestamp(entry.get('end', '0.00'))

        timestamp_text = f"[{start_time} - {end_time}]"
        speaker_line = f"<b>{speaker}</b> {timestamp_text}"
        story.append(Paragraph(speaker_line, styles['speaker']))
        story.append(Paragraph(text, styles['transcript']))
        story.append(Spacer(1, 8))


def generate_summary_pdf(
    summary_data: dict,
    transcript_data: list,
    generated_on: str = None,
    settings: Settings = None
) -> BytesIO:
    """
    Generate a professional PDF with summary and transcript.

    Args:
        summary_data: Dictionary with 'meetingTitle' and 'summary' keys
        transcript_data: List of transcript segments
        generated_on: Optional formatted timestamp string
        settings: Optional Settings instance for timezone

    Returns:
        BytesIO buffer containing the PDF

    Example:
        >>> summary = {
        ...     'meetingTitle': 'Team Meeting',
        ...     'summary': '## Key Points\\n- Item 1'
        ... }
        >>> transcript = [
        ...     {'speaker': 'SPEAKER_00', 'text': 'Hello', 'start': '0.00', 'end': '1.00'}
        ... ]
        >>> pdf_buffer = generate_summary_pdf(summary, transcript)
    """
    if settings is None:
        settings = get_settings()

    buffer = BytesIO()

    # Get timestamp
    if not generated_on:
        generated_on = datetime.now(settings.timezone).strftime('%B %d, %Y at %I:%M %p')

    # Create document
    doc = _create_footer_doc_template(
        buffer,
        title=summary_data.get('meetingTitle', 'MeetMemo Meeting Report'),
        author='MeetMemo AI',
        footer_text=(
            "Generated by MeetMemo AI - "
            "This content is AI-generated and may contain inaccuracies."
        )
    )

    styles = _get_custom_styles()
    story = []

    # Header
    _add_header_with_logo(story, "MeetMemo AI Summary", styles['title'])
    story.append(Spacer(1, 20))

    # Meeting info
    if summary_data:
        _add_meeting_info_table(
            story,
            summary_data.get('meetingTitle', 'Untitled Meeting'),
            generated_on,
            'Meeting Summary & Transcript',
            styles['heading']
        )

        # Summary section
        summary_text = summary_data.get('summary', 'No summary available')
        _add_summary_section(story, summary_text, styles)

    # Transcript section
    if transcript_data:
        _add_transcript_section(story, transcript_data, styles, add_page_break=True)

    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_transcript_pdf(
    meeting_title: str,
    transcript_data: list,
    generated_on: str = None,
    settings: Settings = None
) -> BytesIO:
    """
    Generate a transcript-only PDF (no AI summary).

    Args:
        meeting_title: Meeting title/filename
        transcript_data: List of transcript segments
        generated_on: Optional formatted timestamp string
        settings: Optional Settings instance for timezone

    Returns:
        BytesIO buffer containing the PDF

    Example:
        >>> transcript = [
        ...     {'speaker': 'SPEAKER_00', 'text': 'Hello', 'start': '0.00', 'end': '1.00'}
        ... ]
        >>> pdf_buffer = generate_transcript_pdf('Team Meeting', transcript)
    """
    if settings is None:
        settings = get_settings()

    buffer = BytesIO()

    # Get timestamp
    if not generated_on:
        generated_on = datetime.now(settings.timezone).strftime('%B %d, %Y at %I:%M %p')

    # Create document
    doc = _create_footer_doc_template(
        buffer,
        title=meeting_title or 'MeetMemo Meeting Transcript',
        author='MeetMemo',
        footer_text="Generated by MeetMemo"
    )

    styles = _get_custom_styles()
    story = []

    # Header
    _add_header_with_logo(story, "MeetMemo Transcript", styles['title'])
    story.append(Spacer(1, 20))

    # Meeting info
    _add_meeting_info_table(
        story,
        meeting_title,
        generated_on,
        'Meeting Transcript',
        styles['heading']
    )

    # Transcript section
    if transcript_data:
        _add_transcript_section(story, transcript_data, styles, add_page_break=False)

    doc.build(story)
    buffer.seek(0)
    return buffer
