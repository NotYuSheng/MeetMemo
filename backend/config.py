"""
Centralized configuration management using Pydantic Settings.

This module provides type-safe configuration loading from environment variables
with validation, defaults, and computed properties.
"""
from datetime import timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import PrivateAttr
from pydantic_settings import BaseSettings

from hardware import (
    PROFILE_MANAGED_FIELDS,
    PROFILES,
    PYANNOTE_COMMUNITY_1,
    detect_gpu_name,
    detect_vram_gb,
    resolve_profile,
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database Configuration
    database_url: str

    # LLM Configuration
    llm_api_url: str
    llm_model_name: str
    llm_api_key: Optional[str] = None
    llm_timeout: float = 60.0

    # Hardware Configuration
    # Named profile that bundles hardware-appropriate ML defaults.
    # Options: auto (detect VRAM), cpu, low, balanced, high, custom.
    # Any field explicitly set below (or via env) overrides the profile.
    hardware_profile: str = "auto"

    # ML Models Configuration
    hf_token: str
    whisper_model_name: str = "turbo"
    pyannote_model_name: str = "pyannote/speaker-diarization-3.1"
    compute_type: str = "float16"  # Options: float16, int8, int8_float16

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

    # Detected hardware, populated during __init__ (not read from env)
    _vram_gb: Optional[float] = PrivateAttr(default=None)
    _gpu_name: Optional[str] = PrivateAttr(default=None)
    _resolved_profile: str = PrivateAttr(default="cpu")

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
        """Initialize settings, resolving the hardware profile and device.

        Precedence for the profile-managed fields (whisper_model_name,
        compute_type, pyannote_model_name, device): an explicitly-set value
        (env var or constructor arg) always wins over the resolved profile,
        which in turn wins over the base default.
        """
        super().__init__(**kwargs)

        # Capture which fields the user set explicitly *before* we mutate any,
        # so profile application never clobbers an explicit choice.
        user_set = set(self.model_fields_set)

        # Detect hardware and resolve "auto" (or an unknown value) to a concrete
        # profile based on available VRAM.
        self._vram_gb = detect_vram_gb()
        self._gpu_name = detect_gpu_name()
        self._resolved_profile = resolve_profile(self.hardware_profile, self._vram_gb)

        # Apply the profile's defaults for any field the user did not set.
        profile = PROFILES.get(self._resolved_profile)
        if profile is not None:
            for field in PROFILE_MANAGED_FIELDS:
                if field not in user_set:
                    setattr(self, field, getattr(profile, field))

        # Device fallbacks (only when the user did not pin a device):
        if "device" not in user_set:
            if self.device is None:
                self.device = "cuda:0" if self._vram_gb else "cpu"
            # A CUDA device with no CUDA GPU available downgrades to CPU so the
            # app still starts instead of failing at model load.
            if str(self.device).startswith("cuda") and not self._vram_gb:
                self.device = "cpu"

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

    @property
    def resolved_profile(self) -> str:
        """The concrete hardware profile in effect (never 'auto')."""
        return self._resolved_profile

    @property
    def detected_vram_gb(self) -> Optional[float]:
        """Detected VRAM of the default GPU in GiB, or None on CPU-only hosts."""
        return self._vram_gb

    @property
    def detected_gpu_name(self) -> Optional[str]:
        """Detected default GPU name, or None on CPU-only hosts."""
        return self._gpu_name

    def system_info(self) -> dict:
        """
        Summarize detected hardware and the resolved ML configuration.

        Returns:
            dict: Hardware/config summary plus any fit warnings, suitable for
            logging and for the read-only /system endpoint.
        """
        warnings: list[str] = []

        if str(self.device).startswith("cuda") and not self._vram_gb:
            warnings.append(
                "Configured for CUDA but no CUDA GPU was detected; falling back to CPU."
            )
        if (
            self.pyannote_model_name == PYANNOTE_COMMUNITY_1
            and self._vram_gb
            and self._vram_gb < 12
        ):
            warnings.append(
                "community-1 diarization is memory-hungry (~12 GB VRAM recommended); "
                f"detected {self._vram_gb:.1f} GB. Consider the 'balanced' profile if you hit OOM."
            )

        return {
            "hardware_profile_requested": self.hardware_profile,
            "resolved_profile": self._resolved_profile,
            "gpu_name": self._gpu_name,
            "vram_gb": round(self._vram_gb, 1) if self._vram_gb else None,
            "device": self.device,
            "whisper_model_name": self.whisper_model_name,
            "compute_type": self.compute_type,
            "pyannote_model_name": self.pyannote_model_name,
            "warnings": warnings,
        }


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
