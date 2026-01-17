"""
Export service for PDF and Markdown generation.

This service handles export file generation and provides methods
for generating summary and transcript exports in PDF and Markdown formats.
"""
import json
import logging
from io import BytesIO

from config import Settings
from repositories.export_repository import ExportRepository
from utils.formatters import generate_professional_filename
from utils.markdown_generator import (
    generate_summary_markdown,
    generate_transcript_markdown,
)
from utils.pdf_generator import generate_summary_pdf, generate_transcript_pdf

logger = logging.getLogger(__name__)


class ExportService:
    """Service for export operations."""

    def __init__(self, settings: Settings, export_repo: ExportRepository):
        """
        Initialize ExportService.

        Args:
            settings: Application settings
            export_repo: Export repository for database operations
        """
        self.settings = settings
        self.export_repo = export_repo

    def generate_filename(
        self,
        meeting_title: str,
        file_type: str,
        include_date: bool = True,
        is_transcript_only: bool = False
    ) -> str:
        """
        Generate professional export filename.

        Args:
            meeting_title: Meeting title/name
            file_type: File type (pdf, markdown)
            include_date: Include date in filename
            is_transcript_only: If True, use 'Transcript' suffix instead of default

        Returns:
            Professional filename
        """
        filename = generate_professional_filename(meeting_title, file_type, include_date)

        # Replace '_summary' with '_Transcript' for transcript-only exports
        if is_transcript_only:
            filename = filename.replace('_summary', '_Transcript')

        return filename

    def generate_summary_pdf_export(
        self,
        meeting_title: str,
        summary_content: str,
        transcript_json: str,
        generated_on: str = None
    ) -> BytesIO:
        """
        Generate PDF export with summary and transcript.

        Args:
            meeting_title: Meeting title/filename
            summary_content: Summary text
            transcript_json: JSON string of transcript data
            generated_on: Optional formatted timestamp

        Returns:
            BytesIO buffer containing the PDF
        """
        summary_data = {
            'meetingTitle': meeting_title,
            'summary': summary_content
        }

        transcript_data = json.loads(transcript_json) if transcript_json else []

        return generate_summary_pdf(
            summary_data,
            transcript_data,
            generated_on,
            self.settings
        )

    def generate_transcript_pdf_export(
        self,
        meeting_title: str,
        transcript_json: str,
        generated_on: str = None
    ) -> BytesIO:
        """
        Generate PDF export with transcript only (no summary).

        Args:
            meeting_title: Meeting title/filename
            transcript_json: JSON string of transcript data
            generated_on: Optional formatted timestamp

        Returns:
            BytesIO buffer containing the PDF
        """
        transcript_data = json.loads(transcript_json) if transcript_json else []

        return generate_transcript_pdf(
            meeting_title,
            transcript_data,
            generated_on,
            self.settings
        )

    def generate_summary_markdown_export(
        self,
        meeting_title: str,
        summary_content: str,
        transcript_json: str,
        generated_on: str = None
    ) -> BytesIO:
        """
        Generate Markdown export with summary and transcript.

        Args:
            meeting_title: Meeting title/filename
            summary_content: Summary text
            transcript_json: JSON string of transcript data
            generated_on: Optional formatted timestamp

        Returns:
            BytesIO buffer containing the Markdown
        """
        transcript_data = json.loads(transcript_json) if transcript_json else []

        return generate_summary_markdown(
            meeting_title,
            summary_content,
            transcript_data,
            generated_on,
            self.settings
        )

    def generate_transcript_markdown_export(
        self,
        meeting_title: str,
        transcript_json: str,
        generated_on: str = None
    ) -> BytesIO:
        """
        Generate Markdown export with transcript only (no summary).

        Args:
            meeting_title: Meeting title/filename
            transcript_json: JSON string of transcript data
            generated_on: Optional formatted timestamp

        Returns:
            BytesIO buffer containing the Markdown
        """
        transcript_data = json.loads(transcript_json) if transcript_json else []

        return generate_transcript_markdown(
            meeting_title,
            transcript_data,
            generated_on,
            self.settings
        )

    async def process_export_job(
        self,
        export_uuid: str,
        job_uuid: str,
        export_type: str
    ) -> None:
        """
        Process background export job.

        Args:
            export_uuid: Export job UUID
            job_uuid: Parent job UUID
            export_type: Type of export (pdf, markdown, transcript_pdf, transcript_markdown)

        Note:
            This method is for async/background export jobs.
            For synchronous exports, use the generate_* methods directly.
        """
        logger.info(
            "Export job %s (type: %s) for job %s processing",
            export_uuid,
            export_type,
            job_uuid
        )
        # Background export job processing can be implemented here
        # when needed for large files or batch processing
