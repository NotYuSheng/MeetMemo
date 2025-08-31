import { useState, useRef, useEffect } from "react";
import { Mic, Square, Pause, Play } from "lucide-react";

const LiveAudioControls = ({
  selectedModel,
  onModelChange,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcription, setTranscription] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [audioLevels, setAudioLevels] = useState([]);

  const mediaRecorderRef = useRef(null);
  const websocketRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const canvasRef = useRef(null);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const connectWebSocket = (model) => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the same host as the current page to avoid CORS/origin issues
    const host = window.location.host;
    const wsUrl = `${wsProtocol}//${host}/live-transcription`;
    
    console.log('Connecting to WebSocket at:', wsUrl);
    console.log('Current location:', window.location.href);
    console.log('Host:', host);
    
    websocketRef.current = new WebSocket(wsUrl);
    
    websocketRef.current.onopen = () => {
      setConnectionStatus('connected');
      console.log('Connected to live transcription WebSocket');
      // Send initial configuration to backend
      const config = {
        model: model || "tiny"
      };
      websocketRef.current.send(JSON.stringify(config));
      console.log('Sent initial config:', config);
    };
    
    websocketRef.current.onmessage = (event) => {
      try {
        // Whisper.cpp sends different message formats
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          // If not JSON, treat as plain text transcription
          data = { text: event.data, type: 'transcription' };
        }
        
        console.log('Received WebSocket message:', data);
        
        // Handle different message types
        if (data.text && data.text.trim()) {
          console.log('Received transcription:', data.text);
          setTranscription(prev => [...prev, {
            text: data.text.trim(),
            timestamp: Date.now(),
            id: Math.random().toString(36).substr(2, 9),
            isPartial: data.partial || false
          }]);
        } else if (data.type === 'error') {
          console.error('WebSocket error:', data.message);
        } else if (data.type === 'status') {
          console.log('Status:', data.message);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
    
    websocketRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
      // Check if this is likely an SSL certificate issue
      if (window.location.protocol === 'https:') {
        console.warn('WebSocket connection failed. This might be due to SSL certificate issues.');
        console.warn('Try accessing the backend directly at:', `${window.location.origin}/health`);
      }
    };
    
    websocketRef.current.onclose = () => {
      setConnectionStatus('disconnected');
    };
  };

  const setupAudioProcessing = async (stream) => {
    try {
      // Create AudioContext with default sample rate (let browser decide)
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      console.log('AudioContext sample rate:', audioContextRef.current.sampleRate);
      
      // Create MediaStreamSource
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create ScriptProcessorNode with larger buffer for better quality
      const processor = audioContextRef.current.createScriptProcessor(8192, 1, 1);
      
      processor.onaudioprocess = (event) => {
        if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Advanced audio preprocessing
        const processedData = new Float32Array(inputData.length);
        
        // Apply high-pass filter to remove low frequency noise
        let prevSample = 0;
        const alpha = 0.95; // High-pass filter coefficient
        for (let i = 0; i < inputData.length; i++) {
          processedData[i] = alpha * (processedData[i - 1] || 0) + alpha * (inputData[i] - prevSample);
          prevSample = inputData[i];
        }
        
        // Calculate RMS and amplitude on processed audio
        const rms = Math.sqrt(processedData.reduce((sum, sample) => sum + sample * sample, 0) / processedData.length);
        const maxAmplitude = Math.max(...processedData.map(Math.abs));
        
        // Very strict audio detection - only send clear speech
        const hasSignificantAudio = rms > 0.03 && maxAmplitude > 0.15;
        
        // Update waveform visualization
        setAudioLevels(prev => {
          const newLevels = [...prev, rms];
          // Keep only last 50 samples for smooth visualization
          return newLevels.slice(-50);
        });
        
        // Convert processed Float32Array to Int16Array with better dynamic range
        const int16Array = new Int16Array(processedData.length);
        for (let i = 0; i < processedData.length; i++) {
          const s = Math.max(-1, Math.min(1, processedData[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Only send audio with significant activity to reduce hallucination
        if (hasSignificantAudio) {
          // Convert to base64 more robustly
          const audioBytes = new Uint8Array(int16Array.buffer);
          let binaryString = '';
          for (let i = 0; i < audioBytes.length; i++) {
            binaryString += String.fromCharCode(audioBytes[i]);
          }
          const base64Audio = btoa(binaryString);
          
          websocketRef.current.send(base64Audio);
          console.log(`Sending audio chunk - RMS: ${rms.toFixed(4)}, Max: ${maxAmplitude.toFixed(4)}, Samples: ${int16Array.length}, Bytes: ${audioBytes.length}`);
        } else {
          // Skip low-activity audio to prevent hallucination
          console.log(`Skipping low-activity audio - RMS: ${rms.toFixed(4)}, Max: ${maxAmplitude.toFixed(4)}`);
          return;
        }
      };
      
      // Connect the nodes
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      
      workletNodeRef.current = processor;
      
    } catch (error) {
      console.error('Error setting up audio processing:', error);
    }
  };

  const startLiveTranscription = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "getUserMedia is not supported in this browser. Please use a modern browser or enable microphone permissions."
        );
      }

      // Connect WebSocket first
      connectWebSocket(selectedModel);
      
      // Wait for WebSocket to connect
      await new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (websocketRef.current?.readyState === WebSocket.OPEN) {
            resolve();
          } else if (websocketRef.current?.readyState === WebSocket.CLOSED) {
            reject(new Error('WebSocket connection failed'));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000  // Whisper models expect 16kHz
        } 
      });
      
      await setupAudioProcessing(stream);
      
      setRecordingTime(0);
      setIsRecording(true);
      setTranscription([]);
      
    } catch (error) {
      console.error("Error starting live transcription:", error);
      
      let errorMessage = "Failed to start live transcription. ";
      if (error.name === "NotAllowedError") {
        errorMessage += "Please allow microphone access in your browser settings and try again.";
      } else if (error.name === "NotFoundError") {
        errorMessage += "No microphone found. Please connect a microphone and try again.";
      } else if (error.name === "NotSupportedError") {
        errorMessage += "Your browser doesn't support audio recording. Please use Chrome, Firefox, or Safari.";
      } else if (error.name === "NotReadableError") {
        errorMessage += "Microphone is already in use by another application.";
      } else {
        errorMessage += error.message;
      }
      
      alert(errorMessage);
    }
  };

  const pauseLiveTranscription = () => {
    if (audioContextRef.current && !isPaused) {
      audioContextRef.current.suspend();
      setIsPaused(true);
    }
  };

  const resumeLiveTranscription = () => {
    if (audioContextRef.current && isPaused) {
      audioContextRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopLiveTranscription = () => {
    // Stop WebSocket
    if (websocketRef.current) {
      websocketRef.current.send("stop");
      websocketRef.current.close();
    }
    
    // Stop audio processing
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    setIsRecording(false);
    setIsPaused(false);
    setConnectionStatus('disconnected');
  };

  // Recording timer effect
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording, isPaused]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="card">
      <h2 className="section-title">
        <Mic className="section-icon" />
        Live Transcription
      </h2>

      <div className="controls-container">
        {/* Model select */}
        <label className="model-select-wrapper">
          <span className="model-select-label">Model:</span>
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="model-select"
            disabled={isRecording}
          >
            {["tiny", "medium", "turbo"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <div className="button-group">
          {!isRecording ? (
            <button
              onClick={startLiveTranscription}
              className="btn btn-discrete"
              title="Start Live Transcription"
            >
              <Mic className="btn-icon" />
            </button>
          ) : (
            <>
              <button
                onClick={isPaused ? resumeLiveTranscription : pauseLiveTranscription}
                className="btn btn-discrete"
                title={isPaused ? "Resume Transcription" : "Pause Transcription"}
              >
                {isPaused ? (
                  <Play className="btn-icon" />
                ) : (
                  <Pause className="btn-icon" />
                )}
              </button>

              <button
                onClick={stopLiveTranscription}
                className="btn btn-discrete"
                title="Stop Live Transcription"
              >
                <Square className="btn-icon" />
              </button>
            </>
          )}

          {isRecording && (
            <div className="recording-indicator">
              <div className={`recording-dot ${isPaused ? "paused" : ""}`}></div>
              <span className="recording-time">
                {formatTime(recordingTime)} {isPaused ? "(Paused)" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Connection status */}
        <div className="connection-status">
          Status: 
          <span className={`status-indicator ${connectionStatus}`}>
            {connectionStatus === 'connected' ? ' Connected' : 
             connectionStatus === 'error' ? ' Error' : 
             ' Disconnected'}
          </span>
        </div>

        {/* Audio waveform visualization */}
        {isRecording && (
          <div className="waveform-container">
            <div className="waveform-label">Audio Level:</div>
            <div className="waveform">
              {audioLevels.map((level, index) => (
                <div
                  key={index}
                  className="waveform-bar"
                  style={{
                    height: `${Math.min(100, level * 2000)}%`,
                    backgroundColor: level > 0.02 ? '#4CAF50' : '#E0E0E0',
                    opacity: 0.3 + (level * 10)
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live transcription display */}
      <div className="live-transcription-display">
        <h3 className="transcription-title">Live Transcription</h3>
        <div className="transcription-content">
          {transcription.length === 0 ? (
            <div className="transcription-placeholder">
              {connectionStatus === 'connected' ? 
                'Waiting for audio...' : 
                connectionStatus === 'error' ? 
                'Connection failed. Please check SSL certificate and try again.' :
                'Not connected. Click the microphone to start.'}
            </div>
          ) : (
            transcription.map((item) => (
              <div key={item.id} className="transcription-item">
                <span className="transcription-text">{item.text}</span>
                <span className="transcription-timestamp">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveAudioControls;