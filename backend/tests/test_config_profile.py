"""
Tests for hardware-profile application in Settings.

These need pydantic-settings (skipped automatically if unavailable so the
test_hardware.py suite can still run standalone). They do NOT need torch: the
detection helpers are monkeypatched, so the real torch/CUDA path never runs and
these tests exercise only the pure profile-resolution logic in config.py.

Note: the detection helpers are patched on the ``config`` namespace
(``config.detect_vram_gb``), not ``hardware.detect_vram_gb``. config.py does
``from hardware import detect_vram_gb`` and calls it directly, so it looks the
name up in its own module -- patch it where it is used.
"""
import os
from unittest import mock

import pytest

pytest.importorskip("pydantic_settings")

import hardware

# Minimal required env for Settings to construct.
BASE_ENV = {
    "DATABASE_URL": "postgresql://user:pass@localhost/db",
    "LLM_API_URL": "http://localhost:1234",
    "LLM_MODEL_NAME": "test-model",
    "HF_TOKEN": "test-token",
}


def _make_settings(**env):
    from config import Settings

    merged = {**BASE_ENV, **env}
    with mock.patch.dict(os.environ, merged, clear=True):
        return Settings()


def test_auto_high_profile_applies_community1(monkeypatch):
    monkeypatch.setattr("config.detect_vram_gb", lambda: 24.0)
    monkeypatch.setattr("config.detect_gpu_name", lambda: "Fake RTX")
    s = _make_settings(HARDWARE_PROFILE="auto")
    assert s.resolved_profile == "high"
    assert s.pyannote_model_name == hardware.PYANNOTE_COMMUNITY_1
    assert s.whisper_model_name == "large-v3"
    assert s.device == "cuda:0"


def test_auto_cpu_when_no_gpu(monkeypatch):
    monkeypatch.setattr("config.detect_vram_gb", lambda: None)
    monkeypatch.setattr("config.detect_gpu_name", lambda: None)
    s = _make_settings(HARDWARE_PROFILE="auto")
    assert s.resolved_profile == "cpu"
    assert s.device == "cpu"
    assert s.compute_type == "int8"


def test_explicit_env_overrides_profile(monkeypatch):
    monkeypatch.setattr("config.detect_vram_gb", lambda: 24.0)
    monkeypatch.setattr("config.detect_gpu_name", lambda: "Fake RTX")
    # High profile would pick large-v3, but an explicit env var must win.
    s = _make_settings(HARDWARE_PROFILE="high", WHISPER_MODEL_NAME="turbo")
    assert s.resolved_profile == "high"
    assert s.whisper_model_name == "turbo"
    # Unset fields still come from the profile.
    assert s.pyannote_model_name == hardware.PYANNOTE_COMMUNITY_1


def test_cuda_profile_downgrades_to_cpu_without_gpu(monkeypatch):
    monkeypatch.setattr("config.detect_vram_gb", lambda: None)
    monkeypatch.setattr("config.detect_gpu_name", lambda: None)
    # Forcing a GPU profile on a CPU-only host should not leave device=cuda.
    s = _make_settings(HARDWARE_PROFILE="high")
    assert s.device == "cpu"


def test_system_info_warns_on_community1_low_vram(monkeypatch):
    monkeypatch.setattr("config.detect_vram_gb", lambda: 8.0)
    monkeypatch.setattr("config.detect_gpu_name", lambda: "Fake 8GB")
    s = _make_settings(HARDWARE_PROFILE="high")  # high -> community-1
    info = s.system_info()
    assert info["resolved_profile"] == "high"
    assert any("community-1" in w for w in info["warnings"])
