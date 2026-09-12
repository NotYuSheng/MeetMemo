import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useTranscript from './useTranscript';
import * as api from '../services/api';
import type { TranscriptSegment } from '../types/api';

vi.mock('../services/api');

const segments: TranscriptSegment[] = [
  { speaker: 'SPEAKER_00', start: 0, end: 2, text: 'Hello' },
  { speaker: 'SPEAKER_01', start: 2, end: 4, text: 'Hi there' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTranscript', () => {
  it('stores the transcript via setTranscriptWithColors', () => {
    const { result } = renderHook(() => useTranscript('job1', vi.fn()));
    act(() => {
      result.current.setTranscriptWithColors({ segments });
    });
    expect(result.current.transcript).toEqual({ segments });
  });

  it('opens the edit modal with the selected segment and its index', () => {
    const { result } = renderHook(() => useTranscript('job1', vi.fn()));
    act(() => {
      result.current.handleEditText(segments[1], 1);
    });
    expect(result.current.showEditTextModal).toBe(true);
    expect(result.current.editingSegment).toMatchObject({ index: 1, text: 'Hi there' });
  });

  it('saves an edited segment through the API and updates state', async () => {
    vi.mocked(api.updateTranscript).mockResolvedValue({});
    const { result } = renderHook(() => useTranscript('job1', vi.fn()));

    act(() => {
      result.current.setTranscriptWithColors({ segments });
    });
    act(() => {
      result.current.handleEditText(segments[0], 0);
    });
    act(() => {
      result.current.setEditingSegment({
        speaker: 'SPEAKER_00',
        start: 0,
        end: 2,
        text: 'Hello, everyone',
        index: 0,
      });
    });
    await act(async () => {
      await result.current.handleSaveSegmentText();
    });

    expect(api.updateTranscript).toHaveBeenCalledTimes(1);
    const [uuid, updated] = vi.mocked(api.updateTranscript).mock.calls[0];
    expect(uuid).toBe('job1');
    expect(updated[0].text).toBe('Hello, everyone');
    expect(result.current.transcript?.segments?.[0].text).toBe('Hello, everyone');
    expect(result.current.showEditTextModal).toBe(false);
  });
});
