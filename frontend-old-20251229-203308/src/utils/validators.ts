/**
 * Validation utility functions
 */

import { FILE_LIMITS } from './constants';

/**
 * Supported audio file extensions
 */
const SUPPORTED_AUDIO_EXTENSIONS = [
  '.wav',
  '.mp3',
  '.mp4',
  '.m4a',
  '.flac',
  '.webm',
] as const;

/**
 * Validates if a file is an audio file based on its extension
 * @param file - File to validate
 * @returns True if file is an audio file
 */
export const isAudioFile = (file: File): boolean => {
  const fileName = file.name.toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some(ext => fileName.endsWith(ext));
};

/**
 * Validates if a file size is within acceptable limits
 * @param file - File to validate
 * @returns True if file size is acceptable
 */
export const isFileSizeValid = (file: File): boolean => {
  return file.size <= FILE_LIMITS.MAX_SIZE;
};

/**
 * Validates audio file and returns validation result with error message
 * @param file - File to validate
 * @returns Validation result object
 */
export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

export const validateAudioFile = (file: File | null): FileValidationResult => {
  if (!file) {
    return { isValid: false, error: 'No file selected' };
  }

  if (!isAudioFile(file)) {
    return {
      isValid: false,
      error: `Unsupported file type. Please use one of: ${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}`,
    };
  }

  if (!isFileSizeValid(file)) {
    const maxSizeMB = Math.floor(FILE_LIMITS.MAX_SIZE / (1024 * 1024));
    return {
      isValid: false,
      error: `File too large. Maximum size is ${maxSizeMB}MB`,
    };
  }

  return { isValid: true };
};

/**
 * Validates if a string is a valid UUID
 * @param uuid - String to validate
 * @returns True if string is a valid UUID
 */
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Validates if a string is not empty (after trimming)
 * @param str - String to validate
 * @returns True if string is not empty
 */
export const isNotEmpty = (str: string): boolean => {
  return str.trim().length > 0;
};

/**
 * Validates meeting name
 * @param name - Meeting name to validate
 * @returns Validation result object
 */
export const validateMeetingName = (name: string): FileValidationResult => {
  if (!isNotEmpty(name)) {
    return { isValid: false, error: 'Meeting name cannot be empty' };
  }

  if (name.length > 200) {
    return { isValid: false, error: 'Meeting name is too long (max 200 characters)' };
  }

  return { isValid: true };
};
