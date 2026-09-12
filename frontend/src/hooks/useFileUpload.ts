import { useState, useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import * as api from '../services/api';
import { normalizeTranscript } from '../utils/transcript';
import type { SelectedFile } from '../types/api';
import type {
  SetCurrentStep,
  SetError,
  SetJobId,
  SetProcessingProgress,
  SetTranscriptWithColors,
  StartPolling,
} from '../types/ui';

/**
 * Custom hook for file selection, drag-and-drop, and upload logic
 * Handles file input, drag events, and upload process
 */
export default function useFileUpload(
  setError: SetError,
  setCurrentStep: SetCurrentStep,
  setProcessingProgress: SetProcessingProgress,
  setJobId: SetJobId,
  setTranscriptWithColors: SetTranscriptWithColors,
  startPolling: StartPolling
) {
  const [selectedFile, setSelectedFile] = useState<SelectedFile>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null); // null = auto-detect
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle file selection
  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Immediately show processing UI
      setCurrentStep('processing');
      setProcessingProgress(10);
      handleUpload(file);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (uploading) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      setCurrentStep('processing');
      setProcessingProgress(10);
      handleUpload(file);
    }
  };

  // Handle file upload
  const handleUpload = async (
    file: File | null,
    existingUuid: string | null = null
  ): Promise<void> => {
    setError(null);
    setUploading(true);
    setProcessingProgress(0);

    try {
      // If resuming an existing job, skip upload and start polling
      if (existingUuid) {
        setJobId(existingUuid);
        setCurrentStep('processing');
        setUploading(false);
        startPolling(existingUuid);
        return;
      }

      // No file to upload (should not happen without an existing job)
      if (!file) {
        setUploading(false);
        setCurrentStep('upload');
        return;
      }

      // Upload new file
      const response = await api.uploadAudio(file, null, selectedLanguage);
      setJobId(response.uuid);

      // Backend returns 202 immediately and processes in background
      if (response.status_code === 202 || response.status_code === '202') {
        setCurrentStep('processing');
        setUploading(false);
        startPolling(response.uuid);
      } else if (response.status_code === 200 || response.status_code === '200') {
        // If somehow it completes immediately
        setUploading(false);
        setProcessingProgress(100);
        if (response.transcript) {
          setTranscriptWithColors(normalizeTranscript(response.transcript));
          setTimeout(() => {
            setCurrentStep('transcript');
          }, 500);
        } else {
          setCurrentStep('processing');
          startPolling(response.uuid);
        }
      } else {
        // Fallback to polling
        setCurrentStep('processing');
        setUploading(false);
        startPolling(response.uuid);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to upload file');
      setUploading(false);
      setCurrentStep('upload');
      setProcessingProgress(0);
    }
  };

  return {
    selectedFile,
    uploading,
    fileInputRef,
    handleFileSelect,
    handleDragOver,
    handleDrop,
    handleUpload,
    setSelectedFile,
    selectedLanguage,
    setSelectedLanguage,
  };
}
