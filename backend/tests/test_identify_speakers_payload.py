"""
Tests for the speaker-identification request payload (issue #207).

Verifies that response_format (JSON mode) is included/omitted per the
llm_json_mode setting, and that a captured payload round-trips through the
tolerant parser. Uses a fake http client and a minimal fake settings object so
the test needs neither a network nor the full Settings/torch stack.
"""
import asyncio
from types import SimpleNamespace

from services.summary_service import SummaryService

TRANSCRIPT = "SPEAKER_00: Hello.\nSPEAKER_01: Hi there."


def _fake_settings(json_mode: bool):
    return SimpleNamespace(
        llm_api_url="http://fake-llm",
        llm_model_name="fake-model",
        llm_api_key=None,
        llm_json_mode=json_mode,
    )


class _FakeResponse:
    def __init__(self, content: str):
        self._content = content

    def raise_for_status(self):
        return None

    def json(self):
        return {"choices": [{"message": {"content": self._content}}]}


class _FakeClient:
    """Captures the last POST payload and returns a canned completion."""

    def __init__(self, content='{"SPEAKER_00": "Alice", "SPEAKER_01": "Bob"}'):
        self.content = content
        self.last_json = None
        self.last_url = None

    async def post(self, url, headers=None, json=None, timeout=None):
        self.last_url = url
        self.last_json = json
        return _FakeResponse(self.content)


def test_payload_includes_response_format_when_json_mode_on():
    client = _FakeClient()
    svc = SummaryService(client, _fake_settings(json_mode=True))
    result = asyncio.run(svc.identify_speakers(TRANSCRIPT))

    assert result["status"] == "success"
    assert result["suggestions"] == {"SPEAKER_00": "Alice", "SPEAKER_01": "Bob"}
    assert client.last_json["response_format"] == {"type": "json_object"}
    # Endpoint is derived from llm_api_url.
    assert client.last_url == "http://fake-llm/v1/chat/completions"


def test_payload_omits_response_format_when_json_mode_off():
    client = _FakeClient()
    svc = SummaryService(client, _fake_settings(json_mode=False))
    result = asyncio.run(svc.identify_speakers(TRANSCRIPT))

    assert result["status"] == "success"
    assert "response_format" not in client.last_json


def test_prose_wrapped_response_still_parses_with_json_mode_on():
    # Even with JSON mode requested, a server that wraps the object in prose
    # must still be handled by the defensive parser.
    client = _FakeClient(content='Sure: {"SPEAKER_00": "Alice"} done')
    svc = SummaryService(client, _fake_settings(json_mode=True))
    result = asyncio.run(svc.identify_speakers(TRANSCRIPT))

    assert result["status"] == "success"
    assert result["suggestions"] == {"SPEAKER_00": "Alice"}
