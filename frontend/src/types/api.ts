// Shared API and domain types for MeetMemo frontend

/** A single diarized + transcribed segment of a meeting. */
export interface TranscriptSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Transcript payload as held in application state.
 *
 * The normalized shape is `{ segments }`, but the raw backend response for a
 * job's transcript may instead expose `full_transcript` as a JSON string, so
 * both fields are optional.
 */
export interface Transcript {
  segments?: TranscriptSegment[];
  full_transcript?: string;
}

/** Mapping of speaker label (e.g. `SPEAKER_00`) to a display name. */
export type SpeakerMapping = Record<string, string>;

/** AI-generated meeting summary. */
export interface Summary {
  summary?: string;
  key_points?: string[];
  action_items?: string[];
}

/** Suggestions returned by the speaker identification endpoint. */
export type SpeakerSuggestions = Record<string, string>;

export interface IdentifySpeakersResponse {
  status?: string;
  suggestions?: SpeakerSuggestions;
}

/** Response returned when uploading audio / creating a job. */
export interface UploadResponse {
  uuid: string;
  status_code?: number | string;
  transcript?: Transcript;
}

/** A single job as summarized in the recent-jobs list (client-side shape). */
export interface RecentJob {
  uuid: string;
  filename?: string;
  status_code?: number | string;
  created_at?: string;
}

/** A job entry as returned by the backend `/jobs` listing. */
export interface JobsResponseEntry {
  file_name?: string;
  status_code?: number | string;
  created_at?: string;
}

export interface JobsResponse {
  jobs?: Record<string, JobsResponseEntry>;
}

/** Job status / workflow polling response. */
export interface JobStatus {
  workflow_state?: string;
  current_step_progress?: number;
  available_actions?: unknown;
  status_code?: number | string;
  error_message?: string;
}

/** The currently selected file — either a real `File` or a lightweight stub. */
export type SelectedFile = File | { name: string } | null;

/** The current workflow step shown in the UI. */
export type WorkflowStep = 'upload' | 'processing' | 'transcript' | 'summary';

/** Error thrown by the API layer, augmented with response metadata. */
export interface ApiError extends Error {
  status?: number;
  category?: string;
  responseData?: unknown;
}
