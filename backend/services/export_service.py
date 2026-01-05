"""
Export service for PDF and Markdown generation.

This service handles export file generation and background export job processing.
Note: PDF generation logic is currently in main.py and will be extracted later.
"""
import logging

from config import Settings
from repositories.export_repository import ExportRepository
from utils.formatters import generate_professional_filename

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
        include_date: bool = True
    ) -> str:
        """
        Generate professional export filename.

        Args:
            meeting_title: Meeting title/name
            file_type: File type (pdf, markdown, json)
            include_date: Include date in filename

        Returns:
            Professional filename
        """
        return generate_professional_filename(meeting_title, file_type, include_date)

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
            export_type: Type of export (pdf or markdown)

        Note:
            PDF/Markdown generation logic is still in main.py.
            Will be extracted to utils/pdf_generator.py in future iteration.
        """
        # This method will be implemented when PDF generation
        # is extracted from main.py to utils/pdf_generator.py
        logger.info(
            "Export job %s (type: %s) for job %s queued",
            export_uuid,
            export_type,
            job_uuid
        )
