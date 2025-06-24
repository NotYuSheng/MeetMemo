import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Upload, Download, Play, Pause, Square, FileText, Users, Clock, Hash } from 'lucide-react';
import './MeetingTranscriptionApp.css';

const MeetingTranscriptionApp = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [summary, setSummary] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);

  // Sample transcript data for demonstration
  const sampleTranscript = [
    { id: 1, speaker: "John Smith", text: "Good morning everyone, thank you for joining today's quarterly review meeting. I'd like to start by discussing our Q3 performance metrics.", timestamp: "00:00:15", confidence: 0.96 },
    { id: 2, speaker: "Sarah Johnson", text: "Thanks John. I have the numbers ready. Our revenue increased by 23% compared to last quarter, which exceeded our initial projections.", timestamp: "00:00:45", confidence: 0.94 },
    { id: 3, speaker: "Mike Chen", text: "That's fantastic news! I think the new marketing campaign really contributed to those results. We saw a 40% increase in lead generation.", timestamp: "00:01:20", confidence: 0.92 },
    { id: 4, speaker: "John Smith", text: "Excellent work team. Sarah, can you break down the revenue by product line?", timestamp: "00:01:45", confidence: 0.95 },
    { id: 5, speaker: "Sarah Johnson", text: "Absolutely. Product A contributed 45% of total revenue, Product B was 35%, and our new Product C launch generated 20% despite being in market for only 6 weeks.", timestamp: "00:02:10", confidence: 0.97 }
  ];

  const sampleSummary = {
    meetingTitle: "Q3 Quarterly Review Meeting",
    duration: "45 minutes",
    participants: ["John Smith", "Sarah Johnson", "Mike Chen"],
    keyPoints: [
      "Q3 revenue increased by 23% exceeding projections",
      "Marketing campaign drove 40% increase in lead generation", 
      "Product C launch successful with 20% revenue contribution in 6 weeks",
      "Product A remains top performer at 45% of total revenue"
    ],
    actionItems: [
      "Sarah to provide detailed product line breakdown by Friday",
      "Mike to prepare marketing ROI analysis for next week",
      "Team to discuss Product C expansion strategy"
    ],
    nextSteps: [
      "Schedule follow-up meeting for Q4 planning",
      "Review and approve marketing budget for next quarter"
    ]
  };

  useEffect(() => {
    // Load sample data for demonstration
    setTranscript(sampleTranscript);
    setSummary(sampleSummary);
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioFile(audioBlob);
        processAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setAudioFile(file);
      setUploadProgress(0);
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            processAudio(file);
            return 100;
          }
          return prev + 10;
        });
      }, 200);
    }
  };

  const processAudio = async (audioData) => {
    setIsProcessing(true);
    // Simulate API call to backend
    setTimeout(() => {
      setIsProcessing(false);
      // In real implementation, this would be the response from your FastAPI backend
    }, 3000);
  };

  const exportToPDF = () => {
    // In real implementation, this would call your backend to generate PDF
    const element = document.createElement('a');
    const content = `Meeting Summary\n\nTitle: ${summary.meetingTitle}\nDuration: ${summary.duration}\nParticipants: ${summary.participants.join(', ')}\n\nKey Points:\n${summary.keyPoints.map(point => `• ${point}`).join('\n')}\n\nAction Items:\n${summary.actionItems.map(item => `• ${item}`).join('\n')}`;
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'meeting-summary.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSpeakerColor = (speaker) => {
    const colors = ['speaker-blue', 'speaker-green', 'speaker-purple', 'speaker-orange'];
    const index = summary?.participants.indexOf(speaker) || 0;
    return colors[index % colors.length];
  };

  return (
    <div className="app-container">
      <div className="max-width-container">
        {/* Header */}
        <div className="header-card">
          <h1 className="header-title">Meeting Transcription Studio</h1>
          <p className="header-subtitle">Record, transcribe, and summarize your meetings with AI-powered insights</p>
        </div>

        <div className="main-grid">
          {/* Left Column - Recording Controls and Transcript */}
          <div className="left-column">
            {/* Recording Controls */}
            <div className="card">
              <h2 className="section-title">
                <Mic className="section-icon" />
                Audio Input
              </h2>
              
              <div className="controls-container">
                <div className="button-group">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
                  >
                    {isRecording ? <MicOff className="btn-icon" /> : <Mic className="btn-icon" />}
                    {isRecording ? 'Stop Recording' : 'Start Recording'}
                  </button>
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary"
                  >
                    <Upload className="btn-icon" />
                    Upload Audio
                  </button>
                </div>

                {isRecording && (
                  <div className="recording-indicator">
                    <div className="recording-dot"></div>
                    <span className="recording-time">{formatTime(recordingTime)}</span>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="file-input"
              />

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="progress-text">Uploading... {uploadProgress}%</p>
                </div>
              )}

              {isProcessing && (
                <div className="processing-indicator">
                  <div className="spinner"></div>
                  <span>Processing audio with AI...</span>
                </div>
              )}
            </div>

            {/* Transcript Section */}
            <div className="card">
              <h2 className="section-title">
                <FileText className="section-icon" />
                Live Transcript
              </h2>
              
              <div className="transcript-container">
                {transcript.length > 0 ? (
                  transcript.map((entry) => (
                    <div key={entry.id} className="transcript-entry">
                      <div className="transcript-header">
                        <span className={`speaker-badge ${getSpeakerColor(entry.speaker)}`}>
                          {entry.speaker}
                        </span>
                        <div className="transcript-meta">
                          <Clock className="meta-icon" />
                          {entry.timestamp}
                          <span className="confidence-badge">
                            {Math.round(entry.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                      <p className="transcript-text">{entry.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Mic className="empty-icon" />
                    <p className="empty-title">No transcript available</p>
                    <p className="empty-subtitle">Start recording or upload an audio file to begin</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - AI Summary */}
          <div className="right-column">
            <div className="card">
              <div className="summary-header">
                <h2 className="section-title">
                  <Hash className="section-icon" />
                  AI Summary
                </h2>
                <button
                  onClick={exportToPDF}
                  className="btn btn-success btn-small"
                >
                  <Download className="btn-icon" />
                  Export PDF
                </button>
              </div>

              {summary ? (
                <div className="summary-content">
                  {/* Meeting Info */}
                  <div className="meeting-info">
                    <h3 className="meeting-title">{summary.meetingTitle}</h3>
                    <div className="meeting-meta">
                      <div className="meta-item">
                        <Clock className="meta-icon" />
                        {summary.duration}
                      </div>
                      <div className="meta-item">
                        <Users className="meta-icon" />
                        {summary.participants.length} participants
                      </div>
                    </div>
                  </div>

                  {/* Participants */}
                  <div className="summary-section">
                    <h4 className="summary-section-title">Participants</h4>
                    <div className="participants-list">
                      {summary.participants.map((participant, index) => (
                        <span key={index} className={`speaker-badge ${getSpeakerColor(participant)}`}>
                          {participant}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Key Points */}
                  <div className="summary-section">
                    <h4 className="summary-section-title">Key Discussion Points</h4>
                    <ul className="summary-list">
                      {summary.keyPoints.map((point, index) => (
                        <li key={index} className="summary-item">
                          <div className="bullet bullet-blue"></div>
                          <span className="summary-text">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Action Items */}
                  <div className="summary-section">
                    <h4 className="summary-section-title">Action Items</h4>
                    <ul className="summary-list">
                      {summary.actionItems.map((item, index) => (
                        <li key={index} className="summary-item">
                          <div className="bullet bullet-orange"></div>
                          <span className="summary-text">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Next Steps */}
                  <div className="summary-section">
                    <h4 className="summary-section-title">Next Steps</h4>
                    <ul className="summary-list">
                      {summary.nextSteps.map((step, index) => (
                        <li key={index} className="summary-item">
                          <div className="bullet bullet-green"></div>
                          <span className="summary-text">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <Hash className="empty-icon" />
                  <p className="empty-title">No summary available</p>
                  <p className="empty-subtitle">Summary will appear after processing audio</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingTranscriptionApp;