"""
Centralized configuration management using Pydantic Settings.

This module provides type-safe configuration loading from environment variables
with validation, defaults, and computed properties.
"""
from datetime import timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional

import torch
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database Configuration
    database_url: str

    # LLM Configuration
    llm_api_url: str
    llm_model_name: str
    llm_api_key: Optional[str] = None
    llm_timeout: float = 60.0

    # ML Models Configuration
    hf_token: str
    whisper_model_name: str = "turbo"
    pyannote_model_name: str = "pyannote/speaker-diarization-3.1"

    # File Storage Paths
    upload_dir: str = "audiofiles"
    transcript_dir: str = "transcripts"
    transcript_edited_dir: str = "transcripts/edited"
    summary_dir: str = "summary"
    export_dir: str = "exports"
    logs_dir: str = "logs"

    # File Limits
    max_file_size: int = 100 * 1024 * 1024  # 100MB
    allowed_audio_types: list[str] = [
        'audio/wav',
        'audio/mpeg',
        'audio/mp4',
        'audio/x-m4a',
        'audio/webm',
        'audio/flac',
        'audio/ogg'
    ]

    # Processing Configuration
    device: Optional[str] = None  # Will be computed if not set

    # Cleanup & Maintenance
    cleanup_interval_hours: int = 1
    job_retention_hours: int = 12
    export_retention_hours: int = 24

    # Timezone Configuration
    timezone_offset: str = "+8"

    # Database Pool Settings
    db_pool_min_size: int = 5
    db_pool_max_size: int = 20

    # Logging Configuration
    log_level: str = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    log_file: str = "logs/app.log"
    log_max_bytes: int = 10 * 1024 * 1024  # 10MB per file
    log_backup_count: int = 5  # Keep 5 backup files
    log_to_console: bool = True  # Also log to stdout/stderr

    class Config:
        """Pydantic configuration."""
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"  # Ignore extra fields in .env

    def __init__(self, **kwargs):
        """Initialize settings with computed device if not provided."""
        super().__init__(**kwargs)

        # Auto-detect device if not explicitly set
        if self.device is None:
            self.device = "cuda:0" if torch.cuda.is_available() else "cpu"

    @property
    def timezone(self) -> timezone:
        """
        Get configured timezone as timezone object.

        Returns:
            timezone: Configured timezone based on offset

        Example:
            >>> settings = Settings()
            >>> settings.timezone
            timezone(timedelta(hours=8))
        """
        try:
            offset_hours = float(self.timezone_offset)
            return timezone(timedelta(hours=offset_hours))
        except (ValueError, TypeError):
            # Default to GMT+8 if invalid
            return timezone(timedelta(hours=8))

    @property
    def upload_path(self) -> Path:
        """Get upload directory as Path object."""
        return Path(self.upload_dir)

    @property
    def transcript_path(self) -> Path:
        """Get transcript directory as Path object."""
        return Path(self.transcript_dir)

    @property
    def transcript_edited_path(self) -> Path:
        """Get edited transcript directory as Path object."""
        return Path(self.transcript_edited_dir)

    @property
    def summary_path(self) -> Path:
        """Get summary directory as Path object."""
        return Path(self.summary_dir)

    @property
    def export_path(self) -> Path:
        """Get export directory as Path object."""
        return Path(self.export_dir)

    @property
    def logs_path(self) -> Path:
        """Get logs directory as Path object."""
        return Path(self.logs_dir)

    def ensure_directories(self) -> None:
        """
        Create all required directories if they don't exist.

        This should be called during application startup.
        """
        directories = [
            self.upload_path,
            self.transcript_path,
            self.transcript_edited_path,
            self.summary_path,
            self.export_path,
            self.logs_path,
        ]

        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.

    This function is cached to ensure only one Settings instance
    is created throughout the application lifecycle.

    Returns:
        Settings: Application settings

    Example:
        >>> from fastapi import Depends
        >>> def my_endpoint(settings: Settings = Depends(get_settings)):
        ...     print(settings.llm_api_url)
    """
    return Settings()
