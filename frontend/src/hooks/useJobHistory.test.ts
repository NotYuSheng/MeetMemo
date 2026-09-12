import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useJobHistory from './useJobHistory';
import * as api from '../services/api';

vi.mock('../services/api');

function setup() {
  const setTranscriptWithColors = vi.fn();
  const setCurrentStep = vi.fn();
  const setJobId = vi.fn();
  const setSelectedFile = vi.fn();
  const setError = vi.fn();
  const handleUpload = vi.fn();
  const hook = renderHook(() =>
    useJobHistory(
      true, // backendReady
      setTranscriptWithColors,
      setCurrentStep,
      setJobId,
      setSelectedFile,
      setError,
      handleUpload
    )
  );
  return { hook, setCurrentStep, setSelectedFile, setTranscriptWithColors, setError };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useJobHistory', () => {
  it('fetches and normalizes the recent jobs on mount', async () => {
    vi.mocked(api.getJobs).mockResolvedValue({
      jobs: {
        u1: { file_name: 'a.mp3', status_code: 200, created_at: '2024-01-01' },
        u2: { file_name: 'b.wav', status_code: 202, created_at: '2024-01-02' },
      },
    });

    const { hook } = setup();

    await waitFor(() => expect(hook.result.current.recentJobs).toHaveLength(2));
    // Sorted newest-first, so u2 (Jan 2) comes before u1 (Jan 1).
    expect(hook.result.current.recentJobs.map((j) => j.uuid)).toEqual(['u2', 'u1']);
    expect(hook.result.current.recentJobs[1]).toEqual({
      uuid: 'u1',
      filename: 'a.mp3',
      status_code: 200,
      created_at: '2024-01-01',
    });
  });

  it('sorts recent jobs by created_at, newest first', async () => {
    vi.mocked(api.getJobs).mockResolvedValue({
      jobs: {
        older: { file_name: 'older.mp3', status_code: 200, created_at: '2024-01-01T00:00:00Z' },
        newer: { file_name: 'newer.mp3', status_code: 200, created_at: '2024-03-01T00:00:00Z' },
        middle: { file_name: 'middle.mp3', status_code: 200, created_at: '2024-02-01T00:00:00Z' },
      },
    });

    const { hook } = setup();

    await waitFor(() => expect(hook.result.current.recentJobs).toHaveLength(3));
    expect(hook.result.current.recentJobs.map((j) => j.filename)).toEqual([
      'newer.mp3',
      'middle.mp3',
      'older.mp3',
    ]);
  });

  it('loads a completed job by fetching and parsing its transcript', async () => {
    vi.mocked(api.getJobs).mockResolvedValue({ jobs: {} });
    vi.mocked(api.getTranscript).mockResolvedValue({
      full_transcript: JSON.stringify([{ speaker: 'SPEAKER_00', start: 0, end: 1, text: 'hi' }]),
    });

    const { hook, setCurrentStep, setTranscriptWithColors } = setup();

    await act(async () => {
      await hook.result.current.handleLoadJob({ uuid: 'u1', filename: 'a.mp3', status_code: 200 });
    });

    expect(setTranscriptWithColors).toHaveBeenCalledWith({
      segments: [{ speaker: 'SPEAKER_00', start: 0, end: 1, text: 'hi' }],
    });
    expect(setCurrentStep).toHaveBeenCalledWith('transcript');
  });

  it('shows a friendly message when the transcript is missing (404)', async () => {
    vi.mocked(api.getJobs).mockResolvedValue({ jobs: {} });
    const notFound = Object.assign(new Error('The requested resource was not found.'), {
      status: 404,
    });
    vi.mocked(api.getTranscript).mockRejectedValue(notFound);

    const { hook, setError } = setup();

    await act(async () => {
      await hook.result.current.handleLoadJob({ uuid: 'u1', filename: 'a.mp3', status_code: 200 });
    });

    expect(setError).toHaveBeenCalledWith(expect.stringMatching(/transcript not found/i));
  });

  it('deletes a job then refreshes the list', async () => {
    vi.mocked(api.getJobs).mockResolvedValue({ jobs: {} });
    vi.mocked(api.deleteJob).mockResolvedValue({});

    const { hook } = setup();
    await waitFor(() => expect(api.getJobs).toHaveBeenCalledTimes(1));

    await act(async () => {
      await hook.result.current.handleDeleteJob('u1');
    });

    expect(api.deleteJob).toHaveBeenCalledWith('u1');
    expect(api.getJobs).toHaveBeenCalledTimes(2); // initial + refresh
  });
});
