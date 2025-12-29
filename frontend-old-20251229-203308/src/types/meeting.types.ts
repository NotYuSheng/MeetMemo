/**
 * Type definitions for meeting-related data structures
 */

/**
 * Basic meeting information returned in list view
 */
export interface Meeting {
  /** Unique identifier for the meeting */
  uuid: string;
  /** Meeting name/title */
  name: string;
  /** Status code indicating meeting processing state */
  status_code: string;
}

/**
 * Detailed meeting information including transcript
 */
export interface MeetingDetail extends Meeting {
  /** Complete transcript text */
  full_transcript: string;
  /** Original audio file name */
  file_name: string;
}

/**
 * Whisper model options for transcription
 */
export type WhisperModel = 'tiny' | 'medium' | 'turbo';
