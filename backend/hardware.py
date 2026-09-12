"""
Hardware profile resolution for MeetMemo.

Maps a named hardware profile (or ``auto`` with GPU-VRAM detection) to sensible
defaults for the ML pipeline: Whisper model size, compute precision, diarization
model, and device.

This module is intentionally free of heavy imports (``torch``) at load time so
the profile-selection logic can be unit-tested in isolation. VRAM/GPU detection
imports ``torch`` lazily inside the detection helpers.
"""
from __future__ import annotations

from dataclasses import dataclass

# Diarization model identifiers
PYANNOTE_3_1 = "pyannote/speaker-diarization-3.1"
PYANNOTE_COMMUNITY_1 = "pyannote/speaker-diarization-community-1"

# Profiles a deployer can request. "auto" resolves from detected VRAM; "custom"
# applies no bundled defaults (every field falls back to explicit env / base).
VALID_PROFILES = ("auto", "cpu", "low", "balanced", "high", "custom")


@dataclass(frozen=True)
class ProfileDefaults:
    """The pipeline settings a hardware profile implies."""

    whisper_model_name: str
    compute_type: str
    pyannote_model_name: str
    device: str


# Profile -> pipeline defaults, tuned to fit within the VRAM budget noted while
# maximizing quality. "custom" is deliberately absent: it leaves every field to
# explicit env vars / base defaults.
PROFILES: dict[str, ProfileDefaults] = {
    "cpu": ProfileDefaults(
        whisper_model_name="base",
        compute_type="int8",
        pyannote_model_name=PYANNOTE_3_1,
        device="cpu",
    ),
    "low": ProfileDefaults(  # ~4 GB VRAM
        whisper_model_name="small",
        compute_type="int8_float16",
        pyannote_model_name=PYANNOTE_3_1,
        device="cuda:0",
    ),
    "balanced": ProfileDefaults(  # ~8 GB VRAM
        whisper_model_name="turbo",
        compute_type="float16",
        pyannote_model_name=PYANNOTE_3_1,
        device="cuda:0",
    ),
    "high": ProfileDefaults(  # 12 GB+ VRAM
        whisper_model_name="large-v3",
        compute_type="float16",
        pyannote_model_name=PYANNOTE_COMMUNITY_1,
        device="cuda:0",
    ),
}

# Fields a profile manages. Used for precedence: an explicitly-set env var always
# wins over the profile's value for that field.
PROFILE_MANAGED_FIELDS = (
    "whisper_model_name",
    "compute_type",
    "pyannote_model_name",
    "device",
)


def profile_for_vram(vram_gb: float | None) -> str:
    """
    Choose a concrete profile from available GPU VRAM.

    Args:
        vram_gb: Total VRAM of the selected GPU in GiB, or None when no CUDA GPU
            is available.

    Returns:
        One of ``"cpu"``, ``"low"``, ``"balanced"``, ``"high"``.
    """
    if not vram_gb or vram_gb <= 0:
        return "cpu"
    # Thresholds match the documented per-profile targets (low ~4 GB, balanced
    # ~8 GB, high 12 GB+). The boundaries are deliberately conservative so `auto`
    # errs toward a profile that fits rather than one that risks OOM.
    if vram_gb < 8:
        return "low"
    if vram_gb < 12:
        return "balanced"
    return "high"


def resolve_profile(profile: str | None, vram_gb: float | None) -> str:
    """
    Resolve a requested profile name to a concrete one.

    ``"auto"`` (and any unrecognized value) is resolved from VRAM; every other
    valid value is returned normalized.

    Args:
        profile: Requested profile name (case-insensitive), or None.
        vram_gb: Detected VRAM in GiB, or None.

    Returns:
        A concrete profile name from :data:`VALID_PROFILES` (never ``"auto"``).
    """
    normalized = (profile or "auto").strip().lower()
    if normalized == "auto":
        return profile_for_vram(vram_gb)
    if normalized in PROFILES or normalized == "custom":
        return normalized
    # Unknown value: behave like auto rather than crashing.
    return profile_for_vram(vram_gb)


def detect_vram_gb() -> float | None:
    """
    Detect total VRAM (GiB) of the default CUDA device.

    ``torch`` is imported lazily so this module stays importable without it.

    Returns:
        Total VRAM in GiB, or None if CUDA is unavailable or detection fails.
    """
    try:
        import torch

        if not torch.cuda.is_available():
            return None
        props = torch.cuda.get_device_properties(0)
        return props.total_memory / (1024**3)
    except Exception:
        return None


def detect_gpu_name() -> str | None:
    """Return the default CUDA device name, or None if unavailable."""
    try:
        import torch

        if not torch.cuda.is_available():
            return None
        return torch.cuda.get_device_name(0)
    except Exception:
        return None
