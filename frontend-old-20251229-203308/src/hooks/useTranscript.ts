/**
 * Hook for transcript management with auto-save
 */

import { useCallback, useEffect } from 'react';
import { useMeetingStore } from '../store';
import { transcriptsApi } from '../services/api';
import { useDebounce } from './useDebounce';
import { generateProfessionalFilename } from '../utils/helpers';
import { mainLogger } from '../utils/logger';
import { TranscriptEntry, TranscriptSaveStatus } from '../types';
import { DEBOUNCE_DELAYS } from '../utils/constants';

/**
 * Transcript hook return type
 */
interface UseTranscriptReturn {
  transcript: TranscriptEntry[];
  originalTranscript: TranscriptEntry[];
  saveStatus: TranscriptSaveStatus;
  updateTranscriptText: (entryId: string, text: string) => void;
  updateSpeakerName: (entryId: string, speaker: string) => void;
  resetTranscript: () => void;
  exportToJSON: (meetingTitle: string) => void;
}

/**
 * Hook for managing transcript state and editing
 * @param meetingId - Current meeting UUID
 * @returns Transcript state and operations
 */
export function useTranscript(meetingId: string | null): UseTranscriptReturn {
  const transcript = useMeetingStore((state) => state.transcript);
  const originalTranscript = useMeetingStore((state) => state.originalTranscript);
  const saveStatus = useMeetingStore((state) => state.transcriptSaveStatus);

  const updateTranscriptEntry = useMeetingStore((state) => state.updateTranscriptEntry);
  const resetTranscriptAction = useMeetingStore((state) => state.resetTranscript);
  const setSaveStatus = useMeetingStore((state) => state.setTranscriptSaveStatus);

  // Debounce transcript for auto-save
  const debouncedTranscript = useDebounce(transcript, DEBOUNCE_DELAYS.TRANSCRIPT_SAVE);

  /**
   * Auto-save transcript when it changes
   */
  useEffect(() => {
    if (!meetingId || transcript.length === 0) {
      return;
    }

    // Skip if transcript hasn't changed
    if (JSON.stringify(transcript) === JSON.stringify(originalTranscript)) {
      return;
    }

    const saveTranscript = async () => {
      try {
        setSaveStatus('saving');
        mainLogger.debug('Auto-saving transcript', { meetingId });

        await transcriptsApi.update(meetingId, debouncedTranscript);

        setSaveStatus('saved');
        mainLogger.debug('Transcript saved successfully', { meetingId });

        // Clear status after 2 seconds
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (error) {
        setSaveStatus('error');
        mainLogger.error('Failed to save transcript', error as any, { meetingId });

        // Clear error status after 3 seconds
        setTimeout(() => setSaveStatus(null), 3000);
      }
    };

    saveTranscript();
  }, [debouncedTranscript, meetingId]);

  /**
   * Updates the text of a transcript entry
   */
  const updateTranscriptText = useCallback(
    (entryId: string, text: string) => {
      updateTranscriptEntry(entryId, { text });
    },
    [updateTranscriptEntry]
  );

  /**
   * Updates the speaker name of a transcript entry
   */
  const updateSpeakerName = useCallback(
    (entryId: string, speaker: string) => {
      updateTranscriptEntry(entryId, { speaker });
    },
    [updateTranscriptEntry]
  );

  /**
   * Resets transcript to original state
   */
  const resetTranscript = useCallback(() => {
    resetTranscriptAction();
    mainLogger.info('Transcript reset to original');
  }, [resetTranscriptAction]);

  /**
   * Exports transcript to JSON file
   */
  const exportToJSON = useCallback(
    (meetingTitle: string) => {
      const filename = generateProfessionalFilename(meetingTitle, 'json');
      transcriptsApi.exportToJSON(transcript, filename);
      mainLogger.info('Transcript exported to JSON', { filename });
    },
    [transcript]
  );

  return {
    transcript,
    originalTranscript,
    saveStatus,
    updateTranscriptText,
    updateSpeakerName,
    resetTranscript,
    exportToJSON,
  };
}
