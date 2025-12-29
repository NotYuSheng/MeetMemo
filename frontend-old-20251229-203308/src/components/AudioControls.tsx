/**
 * AudioControls component - handles audio recording and file upload
 */

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Pause, Play, Upload, Send, Trash2 } from 'lucide-react';
import { WhisperModel } from '../types';

interface AudioControlsProps {
  onAudioProcessed: (file: File) => void;
  isProcessing: boolean;
  selectedModel: WhisperModel;
  onModelChange: (model: string) => void;
}

const AudioControls: React.FC<AudioControlsProps> = ({
  onAudioProcessed,
  isProcessing,
  selectedModel,
  onModelChange,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const uploadPlayerRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "getUserMedia is not supported in this browser. Please use a modern browser or enable microphone permissions."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav",
        });
        setRecordedAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setRecordingTime(0);
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);

      // Provide user-friendly error messages
      let errorMessage = "Failed to access microphone. ";

      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          errorMessage +=
            "Please allow microphone access in your browser settings and try again.";
        } else if (error.name === "NotFoundError") {
          errorMessage +=
            "No microphone found. Please connect a microphone and try again.";
        } else if (error.name === "NotSupportedError") {
          errorMessage +=
            "Your browser doesn't support audio recording. Please use Chrome, Firefox, or Safari.";
        } else if (error.name === "NotReadableError") {
          errorMessage += "Microphone is already in use by another application.";
        } else if (error.message.includes("getUserMedia")) {
          errorMessage +=
            "Please use HTTPS or localhost to access the microphone.";
        } else {
          errorMessage += error.message;
        }
      }

      alert(errorMessage);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
    }
  };

  const processRecordedAudio = () => {
    if (recordedAudio && onAudioProcessed) {
      // Create a File object with professional filename
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yy = String(now.getFullYear()).slice(-2);
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const professionalName = `meet-record-${dd}${mm}${yy}-${hh}${min}${ss}.wav`;
      const fileWithName = new File([recordedAudio], professionalName, { type: 'audio/wav' });

      onAudioProcessed(fileWithName);
      setRecordedAudio(null); // Clear the recorded audio after processing
    }
  };

  const uploadFile = () => {
    if (selectedFile && onAudioProcessed) {
      onAudioProcessed(selectedFile);
      setSelectedFile(null);
    }
  };

  const discardRecording = () => {
    setRecordedAudio(null);
    setRecordingTime(0);
  };

  const discardUpload = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Set audio source when recordedAudio changes
  useEffect(() => {
    if (recordedAudio && audioPlayerRef.current) {
      const audioUrl = URL.createObjectURL(recordedAudio);
      audioPlayerRef.current.src = audioUrl;

      return () => {
        URL.revokeObjectURL(audioUrl);
      };
    }
  }, [recordedAudio]);

  // Set audio source when selectedFile changes
  useEffect(() => {
    if (selectedFile && uploadPlayerRef.current) {
      const audioUrl = URL.createObjectURL(selectedFile);
      uploadPlayerRef.current.src = audioUrl;

      return () => {
        URL.revokeObjectURL(audioUrl);
      };
    }
  }, [selectedFile]);

  // Recording timer effect
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  return (
    <div className="card">
      <h2 className="section-title">
        <Mic className="section-icon" />
        Audio Input
      </h2>

      <div className="controls-container">
        {/* Model select */}
        <label className="model-select-wrapper">
          <span className="model-select-label">Model:</span>
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="model-select"
          >
            {["tiny", "medium", "turbo"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <div className="button-group">
          {!isRecording && !recordedAudio && !selectedFile ? (
            <>
              <button
                onClick={startRecording}
                className="btn btn-discrete"
                title="Start Recording"
              >
                <Mic className="btn-icon" />
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-discrete"
                title="Upload Audio File"
              >
                <Upload className="btn-icon" />
              </button>
            </>
          ) : isRecording ? (
            <>
              <button
                onClick={isPaused ? resumeRecording : pauseRecording}
                className="btn btn-discrete"
                title={isPaused ? "Resume Recording" : "Pause Recording"}
              >
                {isPaused ? (
                  <Play className="btn-icon" />
                ) : (
                  <Pause className="btn-icon" />
                )}
              </button>

              <button
                onClick={stopRecording}
                className="btn btn-discrete"
                title="Stop Recording"
              >
                <Square className="btn-icon" />
              </button>
            </>
          ) : recordedAudio ? (
            <>
              <button
                onClick={discardRecording}
                className="btn btn-discrete"
                title="Discard Recording"
              >
                <Trash2 className="btn-icon" />
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-discrete"
                title="Upload Audio File"
              >
                <Upload className="btn-icon" />
              </button>
            </>
          ) : selectedFile ? (
            <>
              <button
                onClick={discardUpload}
                className="btn btn-discrete"
                title="Discard Upload"
              >
                <Trash2 className="btn-icon" />
              </button>

              <button
                onClick={startRecording}
                className="btn btn-discrete"
                title="Start Recording"
              >
                <Mic className="btn-icon" />
              </button>
            </>
          ) : null}

          <button
            onClick={recordedAudio ? processRecordedAudio : uploadFile}
            disabled={(!selectedFile && !recordedAudio) || isProcessing}
            className={`btn ${(selectedFile || recordedAudio) && !isProcessing ? "btn-discrete-prominent" : "btn-discrete"}`}
            title={isProcessing ? "Processing..." : "Process Audio"}
          >
            <Send className="btn-icon" />
            {(selectedFile || recordedAudio) && !isProcessing
              ? "Process Audio"
              : ""}
          </button>

          {isRecording && (
            <div className="recording-indicator">
              <div
                className={`recording-dot ${isPaused ? "paused" : ""}`}
              ></div>
              <span className="recording-time">
                {formatTime(recordingTime)} {isPaused ? "(Paused)" : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="file-input"
      />

      {selectedFile && (
        <div className="audio-preview">
          <h3 className="audio-preview-title">
            Upload Preview - {selectedFile.name}
          </h3>
          <audio ref={uploadPlayerRef} controls className="audio-player" />
        </div>
      )}

      {recordedAudio && (
        <div className="audio-preview">
          <h3 className="audio-preview-title">Recording Preview</h3>
          <audio ref={audioPlayerRef} controls className="audio-player" />
        </div>
      )}

      {isProcessing && (
        <div className="processing-indicator">
          <div className="spinner"></div>
          <span>Processing audio with AI...</span>
        </div>
      )}
    </div>
  );
};

export default AudioControls;
