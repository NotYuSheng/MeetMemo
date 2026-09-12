import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useSummary from './useSummary';
import * as api from '../services/api';

vi.mock('../services/api');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSummary', () => {
  it('generates a summary and advances to the summary step', async () => {
    vi.mocked(api.generateSummary).mockResolvedValue({ summary: 'All done' });
    const setCurrentStep = vi.fn();
    const { result } = renderHook(() => useSummary('job1', setCurrentStep, vi.fn()));

    await act(async () => {
      await result.current.handleGenerateSummary();
    });

    expect(api.generateSummary).toHaveBeenCalledWith('job1');
    expect(result.current.summary).toEqual({ summary: 'All done' });
    expect(setCurrentStep).toHaveBeenCalledWith('summary');
  });

  it('does nothing without a jobId', async () => {
    const { result } = renderHook(() => useSummary(null, vi.fn(), vi.fn()));
    await act(async () => {
      await result.current.handleGenerateSummary();
    });
    expect(api.generateSummary).not.toHaveBeenCalled();
  });

  it('reports an error when generation fails', async () => {
    vi.mocked(api.generateSummary).mockRejectedValue(new Error('boom'));
    const setError = vi.fn();
    const { result } = renderHook(() => useSummary('job1', vi.fn(), setError));

    await act(async () => {
      await result.current.handleGenerateSummary();
    });

    expect(setError).toHaveBeenCalledWith('boom');
  });

  it('persists an edited summary and updates local state', async () => {
    vi.mocked(api.updateSummary).mockResolvedValue({});
    const { result } = renderHook(() => useSummary('job1', vi.fn(), vi.fn()));

    act(() => {
      result.current.setEditingSummary('edited text');
    });
    await act(async () => {
      await result.current.handleSaveSummary();
    });

    expect(api.updateSummary).toHaveBeenCalledWith('job1', 'edited text');
    expect(result.current.summary).toMatchObject({ summary: 'edited text' });
    expect(result.current.showEditSummaryModal).toBe(false);
  });
});
