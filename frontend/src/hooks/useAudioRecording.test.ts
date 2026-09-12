import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useAudioRecording from './useAudioRecording';
import axios from 'axios';
import * as api from '../services/api';

vi.mock('axios', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock('../services/api');

// Minimal MediaRecorder stand-in that lets tests drive the stop -> upload flow.
const instances: FakeMediaRecorder[] = [];
class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';
  constructor() {
    instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio-bytes']) });
    this.onstop?.();
  }
}

function setup() {
  const setError = vi.fn();
  const setCurrentStep = vi.fn();
  const setProcessingProgress = vi.fn();
  const setJobId = vi.fn();
  const setTranscript = vi.fn();
  const startPolling = vi.fn();
  const hook = renderHook(() =>
    useAudioRecording(
      setError,
      setCurrentStep,
      setProcessingProgress,
      setJobId,
      setTranscript,
      startPolling
    )
  );
  return { hook, setError, setCurrentStep, setJobId, setTranscript, startPolling };
}

beforeEach(() => {
  instances.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAudioRecording', () => {
  it('requests the microphone and starts recording', async () => {
    const { hook } = setup();
    await act(async () => {
      await hook.result.current.startRecording();
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(hook.result.current.isRecording).toBe(true);
    expect(instances).toHaveLength(1);
  });

  it('uploads the recording on stop and starts polling for a new job', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { uuid: 'rec1', status_code: 202 } });
    const { hook, setJobId, startPolling } = setup();

    await act(async () => {
      await hook.result.current.startRecording();
    });
    await act(async () => {
      instances[0].stop();
    });

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('/api/v1/jobs', expect.anything(), expect.anything())
    );
    expect(setJobId).toHaveBeenCalledWith('rec1');
    expect(startPolling).toHaveBeenCalledWith('rec1');
  });

  it('loads the existing transcript when the recording is a duplicate (200)', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { uuid: 'rec1', status_code: 200 } });
    vi.mocked(api.getTranscript).mockResolvedValue({ segments: [] });
    const { hook, setCurrentStep, setTranscript } = setup();

    await act(async () => {
      await hook.result.current.startRecording();
    });
    await act(async () => {
      instances[0].stop();
    });

    await waitFor(() => expect(setCurrentStep).toHaveBeenCalledWith('transcript'));
    expect(setTranscript).toHaveBeenCalledWith({ segments: [] });
  });

  it('reports a permission error when the mic is blocked', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(denied);
    const { hook, setError } = setup();

    await act(async () => {
      await hook.result.current.startRecording();
    });

    expect(setError).toHaveBeenCalledWith(expect.stringMatching(/microphone access denied/i));
    expect(hook.result.current.isRecording).toBe(false);
  });
});
