// Speaker color mapping — unique hashed colors in the blue/purple range

import type { TranscriptSegment } from '../types/api';

export interface SpeakerColor {
  bg: string;
  text: string;
}

// A curated palette of distinct blue/purple hues with good contrast on white and dark backgrounds
const SPEAKER_PALETTE: SpeakerColor[] = [
  { bg: '#3b5bdb', text: '#fff' }, // indigo
  { bg: '#7048e8', text: '#fff' }, // violet
  { bg: '#1098ad', text: '#fff' }, // teal-blue
  { bg: '#ae3ec9', text: '#fff' }, // purple
  { bg: '#1c7ed6', text: '#fff' }, // blue
  { bg: '#5f3dc4', text: '#fff' }, // deep violet
  { bg: '#0c8599', text: '#fff' }, // cyan
  { bg: '#862e9c', text: '#fff' }, // deep purple
];

const speakerColorMap = new Map<string, SpeakerColor>();

export function getSpeakerColor(speakerLabel: string | null | undefined): SpeakerColor {
  if (!speakerLabel) return SPEAKER_PALETTE[0];

  const cached = speakerColorMap.get(speakerLabel);
  if (cached) {
    return cached;
  }

  const match = speakerLabel.match(/SPEAKER_(\d+)/);
  let colorIndex: number;

  if (match) {
    colorIndex = parseInt(match[1], 10) % SPEAKER_PALETTE.length;
  } else {
    // Hash the name string for consistent color assignment
    let hash = 0;
    for (let i = 0; i < speakerLabel.length; i++) {
      hash = (hash * 31 + speakerLabel.charCodeAt(i)) >>> 0;
    }
    colorIndex = hash % SPEAKER_PALETTE.length;
  }

  const color = SPEAKER_PALETTE[colorIndex];
  speakerColorMap.set(speakerLabel, color);
  return color;
}

export function initializeSpeakerColors(segments: TranscriptSegment[] | null | undefined): void {
  if (!segments || !Array.isArray(segments)) return;

  speakerColorMap.clear();

  const seenSpeakers = new Set<string>();
  for (const segment of segments) {
    const speaker = segment.speaker;
    if (speaker && !seenSpeakers.has(speaker)) {
      seenSpeakers.add(speaker);
      getSpeakerColor(speaker); // populate the map
    }
  }
}

export function getSpeakerBorderColor(speakerLabel: string | null | undefined): string {
  return getSpeakerColor(speakerLabel).bg;
}
