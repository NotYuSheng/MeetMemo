/**
 * Application constants and configuration
 */

/**
 * API base URL (dynamically constructed from current location)
 */
export const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;

/**
 * Whisper model options
 */
export const WHISPER_MODELS = {
  TINY: 'tiny',
  MEDIUM: 'medium',
  TURBO: 'turbo',
} as const;

/**
 * Default Whisper model
 */
export const DEFAULT_WHISPER_MODEL = WHISPER_MODELS.TURBO;

/**
 * Job polling configuration
 */
export const POLLING_CONFIG = {
  /** Polling interval in milliseconds */
  INTERVAL: 2000,
  /** Maximum polling attempts */
  MAX_ATTEMPTS: 1800, // 1 hour with 2s interval
} as const;

/**
 * File size limits
 */
export const FILE_LIMITS = {
  /** Maximum file size in bytes (500MB) */
  MAX_SIZE: 500 * 1024 * 1024,
} as const;

/**
 * Debounce delays in milliseconds
 */
export const DEBOUNCE_DELAYS = {
  /** Transcript auto-save delay */
  TRANSCRIPT_SAVE: 1000,
  /** Search input delay */
  SEARCH: 300,
} as const;

/**
 * Speaker color palette
 */
export const SPEAKER_COLORS = [
  '#2998D5', // Air Force Blue
  '#bba88e', // Poised Gold
  '#265289', // Navy Blue
  '#c42030', // Army Red
  '#4CAF50', // Green
  '#FF9800', // Orange
  '#9C27B0', // Purple
  '#00BCD4', // Cyan
] as const;

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  THEME: 'meetmemo_theme',
  SPEAKER_MAPPINGS: 'meetmemo_speaker_mappings',
  CUSTOM_PROMPT: 'meetmemo_custom_prompt',
  SYSTEM_PROMPT: 'meetmemo_system_prompt',
  LOGS: 'app_logs',
} as const;

/**
 * Default prompts for summary generation
 */
export const DEFAULT_PROMPTS = {
  CUSTOM: '',
  SYSTEM: `You are an AI assistant that summarizes meeting transcripts.
Provide a clear, structured summary with:
- Key discussion points
- Decisions made
- Action items
- Next steps`,
} as const;
