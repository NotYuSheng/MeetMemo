import type { Transcript } from '../types/api';

/**
 * Normalize a transcript payload into the `{ segments }` shape the UI expects.
 *
 * The backend returns a job's transcript as `{ full_transcript: "<json>" }`
 * where the JSON string is an array of segments. This helper parses that string
 * into `{ segments }`; if the field is absent or unparseable, the original
 * payload is returned unchanged (already-normalized data passes straight
 * through).
 */
export function normalizeTranscript(data: Transcript): Transcript {
  if (data && typeof data.full_transcript === 'string') {
    try {
      const parsed = JSON.parse(data.full_transcript);
      return { segments: parsed };
    } catch (e) {
      console.error('Failed to parse transcript:', e);
      return data;
    }
  }
  return data;
}
