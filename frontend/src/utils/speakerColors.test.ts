import { describe, it, expect } from 'vitest';
import {
  getSpeakerColor,
  getSpeakerBorderColor,
  getSpeakerBadgeVariant,
  initializeSpeakerColors,
} from './speakerColors';

describe('getSpeakerColor', () => {
  it('maps SPEAKER_NN labels to a palette entry by index (mod palette size)', () => {
    const first = getSpeakerColor('SPEAKER_00');
    const second = getSpeakerColor('SPEAKER_01');
    expect(first).not.toEqual(second);
    // Palette has 8 entries, so SPEAKER_08 wraps back to SPEAKER_00's color.
    expect(getSpeakerColor('SPEAKER_08')).toEqual(first);
  });

  it('returns a color with bg and text fields', () => {
    const color = getSpeakerColor('SPEAKER_00');
    expect(color).toHaveProperty('bg');
    expect(color).toHaveProperty('text');
    expect(color.bg).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('is deterministic for the same label', () => {
    expect(getSpeakerColor('Alice')).toEqual(getSpeakerColor('Alice'));
  });

  it('falls back to the first palette color for empty labels', () => {
    expect(getSpeakerColor(null)).toEqual(getSpeakerColor('SPEAKER_00'));
    expect(getSpeakerColor(undefined)).toEqual(getSpeakerColor('SPEAKER_00'));
  });
});

describe('getSpeakerBorderColor', () => {
  it('returns the background color of the mapped palette entry', () => {
    expect(getSpeakerBorderColor('SPEAKER_01')).toBe(getSpeakerColor('SPEAKER_01').bg);
  });
});

describe('getSpeakerBadgeVariant', () => {
  it('returns null (kept for backwards compatibility)', () => {
    expect(getSpeakerBadgeVariant('SPEAKER_00')).toBeNull();
  });
});

describe('initializeSpeakerColors', () => {
  it('handles missing or non-array input without throwing', () => {
    expect(() => initializeSpeakerColors(null)).not.toThrow();
    expect(() => initializeSpeakerColors(undefined)).not.toThrow();
  });

  it('assigns stable colors to the speakers present in the segments', () => {
    initializeSpeakerColors([
      { speaker: 'SPEAKER_00', start: 0, end: 1, text: 'hi' },
      { speaker: 'SPEAKER_01', start: 1, end: 2, text: 'there' },
    ]);
    expect(getSpeakerColor('SPEAKER_00')).not.toEqual(getSpeakerColor('SPEAKER_01'));
  });
});
