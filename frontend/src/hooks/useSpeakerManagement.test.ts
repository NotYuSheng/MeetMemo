import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useSpeakerManagement from './useSpeakerManagement';
import * as api from '../services/api';
import type { Transcript } from '../types/api';

vi.mock('../services/api');

const transcript: Transcript = {
  segments: [
    { speaker: 'SPEAKER_00', start: 0, end: 1, text: 'a' },
    { speaker: 'SPEAKER_01', start: 1, end: 2, text: 'b' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSpeakerManagement.autoIdentifySpeakers', () => {
  it('applies valid identified names and maps "Speaker N" to SPEAKER_0(N-1)', async () => {
    vi.mocked(api.identifySpeakers).mockResolvedValue({
      status: 'success',
      suggestions: { 'Speaker 1': 'Alice', 'Speaker 2': 'Bob' },
    });
    vi.mocked(api.updateSpeakers).mockResolvedValue({});
    vi.mocked(api.getTranscript).mockResolvedValue(transcript);

    const { result } = renderHook(() => useSpeakerManagement('job1', transcript, vi.fn(), vi.fn()));

    await act(async () => {
      await result.current.autoIdentifySpeakers('job1');
    });

    expect(api.updateSpeakers).toHaveBeenCalledWith('job1', {
      SPEAKER_00: 'Alice',
      SPEAKER_01: 'Bob',
    });
  });

  it('rejects generic / undetermined suggestions', async () => {
    vi.mocked(api.identifySpeakers).mockResolvedValue({
      status: 'success',
      suggestions: {
        'Speaker 1': 'Cannot be determined',
        'Speaker 2': 'Unknown speaker',
        'Speaker 3': 'n/a',
      },
    });

    const { result } = renderHook(() => useSpeakerManagement('job1', transcript, vi.fn(), vi.fn()));

    await act(async () => {
      await result.current.autoIdentifySpeakers('job1');
    });

    // Every suggestion is generic, so nothing is applied.
    expect(api.updateSpeakers).not.toHaveBeenCalled();
  });

  it('surfaces an error when identification fails', async () => {
    vi.mocked(api.identifySpeakers).mockRejectedValue(new Error('offline'));
    const setError = vi.fn();
    const { result } = renderHook(() =>
      useSpeakerManagement('job1', transcript, vi.fn(), setError)
    );

    await act(async () => {
      await result.current.autoIdentifySpeakers('job1');
    });

    expect(setError).toHaveBeenCalledWith('offline');
  });
});

describe('useSpeakerManagement.handleSaveSpeakers', () => {
  it('persists renamed speakers and rewrites the local transcript', async () => {
    vi.mocked(api.updateSpeakers).mockResolvedValue({});
    const setTranscriptWithColors = vi.fn();
    const { result } = renderHook(() =>
      useSpeakerManagement('job1', transcript, setTranscriptWithColors, vi.fn())
    );

    act(() => {
      result.current.setEditingSpeakers({ SPEAKER_00: 'Alice', SPEAKER_01: 'SPEAKER_01' });
    });
    await act(async () => {
      await result.current.handleSaveSpeakers();
    });

    expect(api.updateSpeakers).toHaveBeenCalledWith('job1', {
      SPEAKER_00: 'Alice',
      SPEAKER_01: 'SPEAKER_01',
    });
    const updated = setTranscriptWithColors.mock.calls.at(-1)?.[0] as Transcript;
    expect(updated.segments?.[0].speaker).toBe('Alice');
    expect(updated.segments?.[1].speaker).toBe('SPEAKER_01');
  });
});
