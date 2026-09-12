import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import * as api from './api';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  } as unknown as Response;
}

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  // Silence the service's verbose request/response logging during tests.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getAudioUrl', () => {
  it('builds the audio stream URL from the job id', () => {
    expect(api.getAudioUrl('abc123')).toBe('/api/v1/jobs/abc123/audio');
  });
});

describe('apiCall (via getJobStatus / getJobs)', () => {
  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jobs: { a: { file_name: 'x.mp3' } } }));
    await expect(api.getJobs()).resolves.toEqual({ jobs: { a: { file_name: 'x.mp3' } } });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/jobs', expect.objectContaining({}));
  });

  it('categorizes a 404 as NOT_FOUND and surfaces the detail message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Job missing' }, false, 404));
    await expect(api.getJobStatus('nope')).rejects.toMatchObject({
      status: 404,
      category: 'NOT_FOUND',
      message: 'Job missing',
    });
  });

  it('categorizes a 500 as SERVER_ERROR with a friendly fallback message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));
    await expect(api.getJobStatus('boom')).rejects.toMatchObject({
      status: 500,
      category: 'SERVER_ERROR',
    });
  });

  it('categorizes a thrown fetch (network failure) as NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    await expect(api.getJobs()).rejects.toMatchObject({ category: 'NETWORK_ERROR' });
  });
});

describe('uploadAudio', () => {
  it('POSTs multipart form data to /jobs and returns the response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ uuid: 'abc', status_code: 202 }));
    const file = new File(['audio'], 'meeting.mp3', { type: 'audio/mpeg' });

    await expect(api.uploadAudio(file)).resolves.toEqual({ uuid: 'abc', status_code: 202 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/jobs');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get('file')).toBe(file);
  });
});

describe('downloadPDF (blob export helper)', () => {
  it('fetches the export, triggers a download, and cleans up the object URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, true, 200));

    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      await expect(api.downloadPDF('abc', 'meeting.mp3')).resolves.toEqual({ success: true });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/jobs/abc/exports/pdf',
        expect.objectContaining({ method: 'POST' })
      );
      expect(URL.createObjectURL).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('throws when the export request fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));
    await expect(api.downloadPDF('abc', 'meeting.mp3')).rejects.toThrow(/Download failed/);
  });
});
