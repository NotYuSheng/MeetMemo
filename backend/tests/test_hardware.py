"""Unit tests for the torch-free hardware profile logic."""
import hardware as h


def test_profile_for_vram_thresholds():
    assert h.profile_for_vram(None) == "cpu"
    assert h.profile_for_vram(0) == "cpu"
    assert h.profile_for_vram(4) == "low"
    assert h.profile_for_vram(6) == "low"
    assert h.profile_for_vram(7.9) == "low"
    assert h.profile_for_vram(8) == "balanced"
    assert h.profile_for_vram(11.9) == "balanced"
    assert h.profile_for_vram(12) == "high"
    assert h.profile_for_vram(24) == "high"


def test_resolve_profile_auto_uses_vram():
    assert h.resolve_profile("auto", None) == "cpu"
    assert h.resolve_profile("auto", 8) == "balanced"
    assert h.resolve_profile("auto", 24) == "high"
    assert h.resolve_profile(None, 12) == "high"


def test_resolve_profile_explicit_wins_over_vram():
    assert h.resolve_profile("balanced", 24) == "balanced"
    assert h.resolve_profile("cpu", 24) == "cpu"
    assert h.resolve_profile("custom", 24) == "custom"


def test_resolve_profile_is_case_insensitive_and_robust():
    assert h.resolve_profile("HIGH", 4) == "high"
    assert h.resolve_profile("  low  ", None) == "low"
    # Unknown values fall back to VRAM-based selection rather than crashing.
    assert h.resolve_profile("nonsense", 8) == "balanced"


def test_profile_contents():
    assert h.PROFILES["high"].pyannote_model_name == h.PYANNOTE_COMMUNITY_1
    assert h.PROFILES["balanced"].pyannote_model_name == h.PYANNOTE_3_1
    assert h.PROFILES["cpu"].device == "cpu"
    assert h.PROFILES["low"].device == "cuda:0"
    assert set(h.PROFILE_MANAGED_FIELDS) == {
        "whisper_model_name",
        "compute_type",
        "pyannote_model_name",
        "device",
    }


def test_detection_helpers_are_safe_without_torch():
    # Must return None (not raise) when torch/CUDA is unavailable.
    assert h.detect_vram_gb() is None
    assert h.detect_gpu_name() is None
