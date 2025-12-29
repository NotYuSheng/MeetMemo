/**
 * Hook for audio file processing (upload and job polling)
 */

import { useCallback } from 'react';
import { useMeetingStore, useUIStore } from '../store';
import { meetingsApi, jobsApi, transcriptsApi } from '../services/api';
import { processTranscriptWithSpeakerIds } from '../utils/helpers';
import { audioLogger } from '../utils/logger';
import { validateAudioFile } from '../utils/validators';
import { POLLING_CONFIG } from '../utils/constants';
import { WhisperModel } from '../types';

/**
 * Audio processing hook return type
 */
interface UseAudioProcessingReturn {
  isProcessing: boolean;
  processAudio: (file: File) => Promise<string | null>;
}

/**
 * Hook for audio file processing
 * @returns Audio processing state and operations
 */
export function useAudioProcessing(): UseAudioProcessingReturn {
  const isProcessing = useMeetingStore((state) => state.isProcessingAudio);
  const selectedModel = useUIStore((state) => state.selectedModel);

  const setProcessingAudio = useMeetingStore((state) => state.setProcessingAudio);
  const setTranscript = useMeetingStore((state) => state.setTranscript);
  const setOriginalTranscript = useMeetingStore((state) => state.setOriginalTranscript);
  const selectMeeting = useMeetingStore((state) => state.selectMeeting);
  const addMeeting = useMeetingStore((state) => state.addMeeting);

  /**
   * Processes an audio file (upload and wait for transcription)
   * @param file - Audio file to process
   * @returns Meeting UUID if successful, null otherwise
   */
  const processAudio = useCallback(
    async (file: File): Promise<string | null> => {
      // Validate file
      const validation = validateAudioFile(file);
      if (!validation.isValid) {
        audioLogger.error('Invalid audio file', null, {
          error: validation.error,
          fileName: file.name,
        });
        throw new Error(validation.error);
      }

      try {
        setProcessingAudio(true);
        audioLogger.info('Starting audio processing', {
          fileName: file.name,
          fileSize: file.size,
          model: selectedModel,
        });

        // Upload file
        const uploadResponse = await meetingsApi.upload(file, selectedModel as WhisperModel);

        if (!uploadResponse.uuid) {
          throw new Error('No UUID returned from upload');
        }

        const { uuid } = uploadResponse;
        audioLogger.info('File uploaded successfully', { uuid });

        // Add meeting to list
        addMeeting({
          uuid,
          name: file.name,
          status_code: 'processing',
        });

        // Select the new meeting
        selectMeeting(uuid);

        // Poll for job completion
        audioLogger.debug('Starting job polling', { uuid });

        await jobsApi.pollUntilComplete(
          uuid,
          (status) => {
            audioLogger.debug('Job status update', { uuid, status: status.status });
          },
          POLLING_CONFIG.MAX_ATTEMPTS,
          POLLING_CONFIG.INTERVAL
        );

        audioLogger.info('Job completed successfully', { uuid });

        // Fetch transcript
        const transcriptData = await transcriptsApi.get(uuid);
        const processedTranscript = processTranscriptWithSpeakerIds(transcriptData);

        setTranscript(processedTranscript);
        setOriginalTranscript(processedTranscript);

        audioLogger.info('Audio processing completed successfully', {
          uuid,
          transcriptLength: processedTranscript.length,
        });

        return uuid;
      } catch (error) {
        audioLogger.error('Audio processing failed', error as any, {
          fileName: file.name,
        });
        throw error;
      } finally {
        setProcessingAudio(false);
      }
    },
    [
      selectedModel,
      setProcessingAudio,
      setTranscript,
      setOriginalTranscript,
      selectMeeting,
      addMeeting,
    ]
  );

  return {
    isProcessing,
    processAudio,
  };
}
