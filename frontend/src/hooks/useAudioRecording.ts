import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import type { AxiosError } from 'axios';
import * as api from '../services/api';
import { normalizeTranscript } from '../utils/transcript';
import type { UploadResponse } from '../types/api';
import type {
  SetCurrentStep,
  SetError,
  SetJobId,
  SetProcessingProgress,
  SetTranscriptWithColors,
  StartPolling,
} from '../types/ui';

export default function useAudioRecording(
  setError: SetError,
  setCurrentStep: SetCurrentStep,
  setProcessingProgress: SetProcessingProgress,
  setJobId: SetJobId,
  setTranscript: SetTranscriptWithColors,
  startPolling: StartPolling
) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Upload recording to backend
  const uploadRecording = useCallback(
    async (audioBlob: Blob) => {
      try {
        // Create form data
        const formData = new FormData();

        // Create file from blob with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `recording-${timestamp}.webm`;
        const file = new File([audioBlob], fileName, { type: audioBlob.type });

        formData.append('file', file);
        formData.append('model_name', 'turbo');

        // Upload to backend
        setCurrentStep('processing');
        setProcessingProgress(10);

        const response = await axios.post<UploadResponse>('/api/v1/jobs', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        const newJobId = response.data.uuid;
        setJobId(newJobId);
        setProcessingProgress(20);

        // Check if this is a duplicate
        if (response.data.status_code === 200) {
          // Duplicate - load existing transcript via the shared API layer,
          // normalizing the full_transcript payload like every other load site.
          const transcriptData = await api.getTranscript(newJobId);
          setTranscript(normalizeTranscript(transcriptData));
          setCurrentStep('transcript');
          setProcessingProgress(100);
        } else {
          // New job - start polling
          startPolling(newJobId);
        }
      } catch (err) {
        console.error('Error uploading recording:', err);
        const axiosErr = err as AxiosError<{ detail?: string }>;
        setError(axiosErr.response?.data?.detail || 'Failed to upload recording');
        setCurrentStep('upload');
        setProcessingProgress(0);
      } finally {
        // Reset recording state
        setRecordingTime(0);
        audioChunksRef.current = [];
      }
    },
    [setCurrentStep, setProcessingProgress, setJobId, setTranscript, startPolling, setError]
  );

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Create MediaRecorder instance
      // Use webm with opus codec for best compatibility and quality
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000, // 128 kbps for good quality
      });

      mediaRecorderRef.current = mediaRecorder;

      // Collect audio chunks
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = async () => {
        // Create blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Upload the recording
        await uploadRecording(audioBlob);
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);

      const error = err as DOMException;
      if (error.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access to record.');
      } else if (error.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.');
      } else {
        setError(`Failed to start recording: ${error.message}`);
      }
    }
  }, [setError, uploadRecording]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, []);

  return {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    cleanup,
  };
}
