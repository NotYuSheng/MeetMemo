import { describe, it, expect, vi } from 'vitest';
import { normalizeTranscript } from './transcript';

describe('normalizeTranscript', () => {
  it('parses a full_transcript JSON string into segments', () => {
    const segments = [{ speaker: 'SPEAKER_00', start: 0, end: 1, text: 'hi' }];
    expect(normalizeTranscript({ full_transcript: JSON.stringify(segments) })).toEqual({
      segments,
    });
  });

  it('passes through already-normalized data unchanged', () => {
    const data = { segments: [{ speaker: 'SPEAKER_00', start: 0, end: 1, text: 'hi' }] };
    expect(normalizeTranscript(data)).toBe(data);
  });

  it('returns the original payload when full_transcript is not valid JSON', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = { full_transcript: 'not json' };
    expect(normalizeTranscript(data)).toBe(data);
    vi.restoreAllMocks();
  });

  it('returns the original payload when full_transcript parses to a non-array', () => {
    // A valid JSON object (not an array) must not become { segments: <object> },
    // which would crash downstream .map calls.
    const data = { full_transcript: JSON.stringify({ oops: true }) };
    expect(normalizeTranscript(data)).toBe(data);
  });
});
