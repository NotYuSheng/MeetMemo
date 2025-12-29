/**
 * Type definitions for transcript-related data structures
 */

/**
 * Represents a single entry in a transcript
 */
export interface TranscriptEntry {
  /** Unique identifier for this transcript entry */
  id: string;
  /** Display name for the speaker (may be customized by user) */
  speaker: string;
  /** Original speaker identifier from diarization (e.g., "SPEAKER_00") */
  originalSpeaker: string;
  /** Numeric speaker ID from diarization */
  speakerId: number;
  /** Transcribed text content */
  text: string;
  /** Start timestamp in seconds */
  start: number;
  /** End timestamp in seconds */
  end: number;
}

/**
 * Mapping of original speaker IDs to custom display names
 * Key: original speaker ID (e.g., "SPEAKER_00")
 * Value: custom display name (e.g., "John Doe")
 */
export interface SpeakerMapping {
  [originalSpeaker: string]: string;
}

/**
 * AI-suggested speaker names
 * Key: original speaker ID (e.g., "SPEAKER_00")
 * Value: suggested name
 */
export interface SpeakerSuggestions {
  [speakerName: string]: string;
}

/**
 * Color assignment for speakers
 * Key: speaker name
 * Value: color code
 */
export interface SpeakerColorMap {
  [speaker: string]: string;
}

/**
 * Status of transcript save operation
 */
export type TranscriptSaveStatus = 'saving' | 'saved' | 'error' | null;
