import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isSecureContext,
  isRecordingSupported,
  getRecordingUnavailableReason,
} from './browserUtils';

// Helpers to (re)define non-writable globals that jsdom provides.
function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Remove any mediaDevices we injected; jsdom does not define it by default.
  if ('mediaDevices' in navigator) {
    // @ts-expect-error deleting an optional injected property for test isolation
    delete navigator.mediaDevices;
  }
});

describe('isSecureContext', () => {
  it('is true on localhost (the jsdom default host)', () => {
    expect(isSecureContext()).toBe(true);
  });
});

describe('isRecordingSupported', () => {
  it('is false when the browser lacks mediaDevices / MediaRecorder', () => {
    expect(isRecordingSupported()).toBe(false);
  });

  it('is true when getUserMedia and MediaRecorder are available', () => {
    setMediaDevices({ getUserMedia: () => Promise.resolve({}) });
    vi.stubGlobal('MediaRecorder', function MediaRecorder() {});
    expect(isRecordingSupported()).toBe(true);
  });
});

describe('getRecordingUnavailableReason', () => {
  it('reports lack of browser support when recording APIs are missing', () => {
    expect(getRecordingUnavailableReason()).toBe('Your browser does not support audio recording');
  });

  it('returns null when recording is supported in a secure context', () => {
    setMediaDevices({ getUserMedia: () => Promise.resolve({}) });
    vi.stubGlobal('MediaRecorder', function MediaRecorder() {});
    // jsdom default host is localhost, which counts as a secure context.
    expect(getRecordingUnavailableReason()).toBeNull();
  });
});
