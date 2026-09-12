import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useBackendHealth from './useBackendHealth';
import * as api from '../services/api';

vi.mock('../services/api');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useBackendHealth', () => {
  it('becomes ready once the health check succeeds', async () => {
    vi.mocked(api.healthCheck).mockResolvedValue({});
    const { result } = renderHook(() => useBackendHealth());

    await waitFor(() => expect(result.current.backendReady).toBe(true));
    expect(result.current.backendError).toBeNull();
    expect(api.healthCheck).toHaveBeenCalled();
  });
});
