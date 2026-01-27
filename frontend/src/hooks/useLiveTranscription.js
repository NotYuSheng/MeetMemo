import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook for live audio transcription via WebSockets.
 */
export default function useLiveTranscription(onError) {
  const [isLive, setIsLive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);

  const startLive = useCallback(async (model = 'small', language = null) => {
    try {
      // 1. Initialize WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/transcribe/live`;
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('Live WebSocket connected');
        // Send initial config
        socket.send(JSON.stringify({
          type: 'config',
          model: model,
          language: language
        }));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'partial') {
          setTranscript(data.text);
        } else if (data.type === 'error') {
          onError(data.message);
        }
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
        onError('WebSocket connection error');
      };

      socket.onclose = () => {
        console.log('Live WebSocket closed');
        setIsLive(false);
      };

      // 2. Initialize Audio Capture
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      
      // Use ScriptProcessor for simplicity in downsampling/buffering
      // Buffer size of 4096 at 16kHz is ~250ms
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (socket.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate audio level (RMS)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setAudioLevel(rms);

        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          // Clip and scale
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send binary data
        socket.send(pcmData.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsLive(true);
      setTranscript('');

    } catch (err) {
      console.error('Failed to start live transcription:', err);
      onError(`Failed to start live transcription: ${err.message}`);
      stopLive();
    }
  }, [onError]);

  const stopLive = useCallback(() => {
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'stop' }));
      }
      socketRef.current.close();
      socketRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsLive(false);
  }, []);

  useEffect(() => {
    return () => stopLive();
  }, [stopLive]);

  return {
    isLive,
    transcript,
    audioLevel,
    startLive,
    stopLive
  };
}
