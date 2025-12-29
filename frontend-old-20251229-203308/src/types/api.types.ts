/**
 * Type definitions for API requests and responses
 */

import { TranscriptEntry, SpeakerMapping, SpeakerSuggestions } from './transcript.types';
import { Meeting, MeetingDetail } from './meeting.types';
import { Summary, SummaryOptions } from './summary.types';

/**
 * Response from audio upload endpoint
 */
export interface UploadResponse {
  /** UUID of the created job */
  uuid: string;
  /** Transcript data if processing completed synchronously */
  transcript?: TranscriptEntry[];
  /** Error message if upload failed */
  error?: string;
}

/**
 * Job processing status
 */
export type JobStatusType = 'pending' | 'processing' | 'completed' | 'failed' | 'error';

/**
 * Response from job status endpoint
 */
export interface JobStatus {
  /** Current status of the job */
  status: JobStatusType;
  /** Error message if job failed */
  error_message?: string;
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  /** Response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
}

/**
 * API error structure
 */
export interface ApiError {
  /** Error message */
  message: string;
  /** HTTP status code if available */
  status?: number;
  /** HTTP status text if available */
  statusText?: string;
  /** Additional error details */
  details?: unknown;
}

/**
 * Request body for updating speaker mappings
 */
export interface UpdateSpeakerMappingsRequest {
  /** Speaker name mappings */
  speaker_mappings: SpeakerMapping;
}

/**
 * Request body for identifying speakers
 */
export interface IdentifySpeakersRequest {
  /** Optional context to help with speaker identification */
  context?: string;
}

/**
 * Response from speaker identification endpoint
 */
export interface IdentifySpeakersResponse {
  /** Suggested speaker names */
  speakers: SpeakerSuggestions;
}

/**
 * Request body for renaming a meeting
 */
export interface RenameMeetingRequest {
  /** New meeting name */
  new_name: string;
}

// Re-export types for convenience
export type {
  TranscriptEntry,
  SpeakerMapping,
  SpeakerSuggestions,
  Meeting,
  MeetingDetail,
  Summary,
  SummaryOptions,
};
