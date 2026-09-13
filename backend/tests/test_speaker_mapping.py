"""Unit tests for the tolerant speaker-mapping extraction (issue #199)."""
from services.summary_service import _extract_speaker_mapping


def test_clean_json_object():
    content = '{"SPEAKER_00": "Alice (CEO)", "SPEAKER_01": "Bob"}'
    assert _extract_speaker_mapping(content) == {
        "SPEAKER_00": "Alice (CEO)",
        "SPEAKER_01": "Bob",
    }


def test_json_fenced_code_block():
    content = 'Sure!\n```json\n{"SPEAKER_00": "Alice"}\n```\nHope that helps.'
    assert _extract_speaker_mapping(content) == {"SPEAKER_00": "Alice"}


def test_plain_fenced_code_block():
    content = '```\n{"SPEAKER_00": "Alice", "SPEAKER_01": "Bob"}\n```'
    assert _extract_speaker_mapping(content) == {
        "SPEAKER_00": "Alice",
        "SPEAKER_01": "Bob",
    }


def test_bare_object_embedded_in_prose():
    content = 'Here are the speakers I identified: {"SPEAKER_00": "Alice"} — let me know.'
    assert _extract_speaker_mapping(content) == {"SPEAKER_00": "Alice"}


def test_unparseable_returns_none():
    assert _extract_speaker_mapping("I could not determine any speakers.") is None
    assert _extract_speaker_mapping("") is None
    assert _extract_speaker_mapping("{not valid json}") is None


def test_rejects_non_string_values():
    # A JSON object that isn't a flat str->str mapping must be rejected, not
    # returned as-is, so callers always get a clean speaker mapping or None.
    assert _extract_speaker_mapping('{"SPEAKER_00": {"name": "Alice"}}') is None
    assert _extract_speaker_mapping('[1, 2, 3]') is None
    assert _extract_speaker_mapping('{}') is None


def test_prefers_valid_mapping_over_earlier_non_mapping_object():
    # A leading {...} that isn't a valid str->str mapping must not hide a valid
    # mapping that appears later in the prose.
    content = 'Config: {"debug": true}\nSpeakers: {"SPEAKER_00": "Alice"}'
    assert _extract_speaker_mapping(content) == {"SPEAKER_00": "Alice"}
