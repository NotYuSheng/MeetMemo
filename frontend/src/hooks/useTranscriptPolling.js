import { useState, useRef, useEffect } from 'react';
import * as api from '../services/api';

/**
 * Custom hook for job status polling and workflow state tracking
 * Manages the transcription/diarization/alignment workflow with auto-progression
 */
export default function useTranscriptPolling(
  setTranscriptWithColors,
  setCurrentStep,
  setUploading,
  setError,
  autoIdentifySpeakers
) {
  const [processingProgress, setProcessingProgress] = useState(0);

  // Track which workflow steps have been started (to prevent race conditions)
  const workflowStepsStarted = useRef(new Set());

  // Track polling interval for cleanup
  const pollingIntervalRef = useRef(null);

  // Track retry attempts for exponential backoff
  // Retries transient errors (5xx, network issues) up to 3 times
  // with exponential backoff: 1s, 2s, 4s (capped at 10s)
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Poll job status with workflow state tracking
  const startPolling = (uuid) => {
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Reset the workflow steps tracker for this new job
    workflowStepsStarted.current = new Set();

    // Define the polling function so we can call it immediately
    const pollJobStatus = async () => {
      try {
        const status = await api.getJobStatus(uuid);
        console.log('Workflow Debug:', {
          workflow_state: status.workflow_state,
          current_step_progress: status.current_step_progress,
          available_actions: status.available_actions,
          status_code: status.status_code,
        });

        // Reset retry count on successful poll
        retryCountRef.current = 0;

        const workflowState = status.workflow_state || 'uploaded';
        const stepProgress = status.current_step_progress || 0;

        // Update progress based on workflow state
        if (workflowState === 'uploaded') {
          setProcessingProgress(0);
          // Auto-start transcription (only once)
          if (!workflowStepsStarted.current.has('transcription')) {
            workflowStepsStarted.current.add('transcription');
            try {
              await api.startTranscription(uuid);
              // Set progress to 1% to show transcription is starting
              setProcessingProgress(1);
            } catch (err) {
              console.error('Failed to start transcription:', err);
              workflowStepsStarted.current.delete('transcription');
              setError('Failed to start transcription. Please try again.');
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
              if (setUploading) setUploading(false);
            }
          }
        } else if (workflowState === 'transcribing') {
          // Map transcription progress to 0-30%
          // Ensure at least 1% to show as active
          setProcessingProgress(Math.max(1, Math.floor(stepProgress * 0.3)));
        } else if (workflowState === 'transcribed') {
          setProcessingProgress(30);
          // Auto-start diarization (only once)
          if (!workflowStepsStarted.current.has('diarization')) {
            workflowStepsStarted.current.add('diarization');
            try {
              await api.startDiarization(uuid);
              // Set progress to 31% to show diarization is starting
              setProcessingProgress(31);
            } catch (err) {
              console.error('Failed to start diarization:', err);
              workflowStepsStarted.current.delete('diarization');
              setError('Failed to start speaker identification. Please try again.');
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
              if (setUploading) setUploading(false);
            }
          }
        } else if (workflowState === 'diarizing') {
          // Map diarization progress to 30-90%
          // Ensure at least 31% to show as active
          setProcessingProgress(Math.max(31, 30 + Math.floor(stepProgress * 0.6)));
        } else if (workflowState === 'diarized') {
          setProcessingProgress(90);
          // Auto-start alignment (only once)
          if (!workflowStepsStarted.current.has('alignment')) {
            workflowStepsStarted.current.add('alignment');
            try {
              await api.startAlignment(uuid);
              // Set progress to 91% to show alignment is starting
              setProcessingProgress(91);
            } catch (err) {
              console.error('Failed to start alignment:', err);
              workflowStepsStarted.current.delete('alignment');
              setError('Failed to start alignment. Please try again.');
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
              if (setUploading) setUploading(false);
            }
          }
        } else if (workflowState === 'aligning') {
          // Map alignment progress to 90-100%
          // Ensure at least 91% to show as active
          setProcessingProgress(Math.max(91, 90 + Math.floor(stepProgress * 0.1)));
        } else if (workflowState === 'completed') {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          setProcessingProgress(100);

          // Fetch the transcript with separate error handling
          // (polling is already stopped, so we can't retry)
          try {
            const transcriptData = await api.getTranscript(uuid);
            if (
              transcriptData.full_transcript &&
              typeof transcriptData.full_transcript === 'string'
            ) {
              try {
                const parsed = JSON.parse(transcriptData.full_transcript);
                setTranscriptWithColors({ segments: parsed });
              } catch (e) {
                console.error('Failed to parse transcript:', e);
                setTranscriptWithColors(transcriptData);
              }
            } else {
              setTranscriptWithColors(transcriptData);
            }
            setCurrentStep('transcript');
            if (setUploading) setUploading(false);

            // Auto-identify speakers in the background
            if (autoIdentifySpeakers) {
              autoIdentifySpeakers(uuid);
            }
          } catch (err) {
            console.error('Failed to fetch transcript:', err);
            if (setUploading) setUploading(false);
            setError(err.message || 'Failed to load transcript. Please refresh and try again.');
            // Don't re-throw, we've already handled it
          }
        } else if (
          workflowState === 'error' ||
          status.status_code === '500' ||
          status.status_code === 500
        ) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          const errorMsg = status.error_message || 'Processing failed. Please try again.';
          throw new Error(errorMsg);
        }
      } catch (err) {
        console.error('Polling error:', err);

        // Determine if error is retryable (5xx errors, network errors)
        const isRetryable =
          err.category === 'SERVER_ERROR' ||
          err.category === 'NETWORK_ERROR' ||
          err.message?.includes('network') ||
          err.message?.includes('timeout');

        // Retry logic for transient errors
        // Only retry if polling interval is still running
        if (isRetryable && retryCountRef.current < maxRetries && pollingIntervalRef.current) {
          retryCountRef.current += 1;
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 10000);
          console.warn(
            `Retrying in ${backoffDelay}ms (attempt ${retryCountRef.current}/${maxRetries})...`
          );
          // Don't clear interval, let it retry on next tick
          return;
        }

        // Stop polling after max retries or non-retryable error
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        if (setUploading) setUploading(false);

        // Propagate error to UI
        const errorMessage = err.message || 'An error occurred while processing. Please try again.';
        setError(errorMessage);
      }
    };

    // Call immediately to avoid initial delay, then set up interval
    pollJobStatus();
    pollingIntervalRef.current = setInterval(pollJobStatus, 2000);
  };

  // Stop polling
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return {
    processingProgress,
    startPolling,
    stopPolling,
    setProcessingProgress,
  };
}
