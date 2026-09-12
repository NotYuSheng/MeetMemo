import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useTranscriptPolling from './useTranscriptPolling';
import * as api from '../services/api';

vi.mock('../services/api');

function setup() {
  const setTranscriptWithColors = vi.fn();
  const setCurrentStep = vi.fn();
  const setUploading = vi.fn();
  const setError = vi.fn();
  const autoIdentifySpeakers = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() =>
    useTranscriptPolling(
      setTranscriptWithColors,
      setCurrentStep,
      setUploading,
      setError,
      autoIdentifySpeakers
    )
  );
  return {
    hook,
    setTranscriptWithColors,
    setCurrentStep,
    setUploading,
    setError,
    autoIdentifySpeakers,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTranscriptPolling', () => {
  it('auto-starts transcription from the "uploaded" state', async () => {
    vi.mocked(api.getJobStatus).mockResolvedValue({ workflow_state: 'uploaded' });
    vi.mocked(api.startTranscription).mockResolvedValue({});

    const { hook } = setup();
    act(() => hook.result.current.startPolling('job1'));

    await waitFor(() => expect(api.startTranscription).toHaveBeenCalledWith('job1'));
    act(() => hook.result.current.stopPolling());
  });

  it('maps in-progress transcription to a 0-30% band', async () => {
    vi.mocked(api.getJobStatus).mockResolvedValue({
      workflow_state: 'transcribing',
      current_step_progress: 50,
    });

    const { hook } = setup();
    act(() => hook.result.current.startPolling('job1'));

    // floor(50 * 0.3) = 15
    await waitFor(() => expect(hook.result.current.processingProgress).toBe(15));
    act(() => hook.result.current.stopPolling());
  });

  it('loads the transcript and advances when the job completes', async () => {
    vi.mocked(api.getJobStatus).mockResolvedValue({ workflow_state: 'completed' });
    vi.mocked(api.getTranscript).mockResolvedValue({
      full_transcript: JSON.stringify([{ speaker: 'SPEAKER_00', start: 0, end: 1, text: 'hi' }]),
    });

    const { hook, setTranscriptWithColors, setCurrentStep, autoIdentifySpeakers } = setup();
    act(() => hook.result.current.startPolling('job1'));

    await waitFor(() => expect(setCurrentStep).toHaveBeenCalledWith('transcript'));
    expect(setTranscriptWithColors).toHaveBeenCalledWith({
      segments: [{ speaker: 'SPEAKER_00', start: 0, end: 1, text: 'hi' }],
    });
    expect(autoIdentifySpeakers).toHaveBeenCalledWith('job1');
  });

  it('surfaces an error when the workflow reports failure', async () => {
    vi.mocked(api.getJobStatus).mockResolvedValue({
      workflow_state: 'error',
      error_message: 'Processing failed',
    });

    const { hook, setError } = setup();
    act(() => hook.result.current.startPolling('job1'));

    await waitFor(() => expect(setError).toHaveBeenCalledWith('Processing failed'));
  });

  it('retries a retryable error on the immediate first poll', async () => {
    vi.useFakeTimers();
    try {
      // First (immediate) poll fails with a retryable server error, then succeeds.
      const retryable = Object.assign(new Error('boom'), { category: 'SERVER_ERROR' });
      vi.mocked(api.getJobStatus)
        .mockRejectedValueOnce(retryable)
        .mockResolvedValue({ workflow_state: 'transcribing', current_step_progress: 0 });

      const { hook, setError } = setup();
      act(() => hook.result.current.startPolling('job1'));

      // Let the rejected immediate poll settle without advancing wall-clock time.
      await vi.advanceTimersByTimeAsync(0);
      expect(api.getJobStatus).toHaveBeenCalledTimes(1);
      expect(setError).not.toHaveBeenCalled(); // retried, not surfaced

      // Advance past the first backoff (1s) so the retry fires.
      await vi.advanceTimersByTimeAsync(1000);
      expect(api.getJobStatus).toHaveBeenCalledTimes(2);
      expect(setError).not.toHaveBeenCalled();

      act(() => hook.result.current.stopPolling());
    } finally {
      vi.useRealTimers();
    }
  });
});
