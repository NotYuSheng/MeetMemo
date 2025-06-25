import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Upload, Download, Play, Pause, Square, FileText, Users, Clock, Hash } from 'lucide-react';
import './MeetingTranscriptionApp.css';

const MeetingTranscriptionApp = () => {
    /////////////////////////// All constants ///////////////////////////
    // Constants for transcription function
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [transcript, setTranscript] = useState([]);
    const [summary, setSummary] = useState(null);
    const [audioFile, setAudioFile] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const fileInputRef = useRef(null);
    const timerRef = useRef(null);
    const [jobUUID, setJobUUID] = useState(null);

    // Transcript should include:
    //      id [int]
    //      speaker[str]
    //      text[str]

    // Transcript summary should include:
    //      meetingTitle[str]
    //      duration[str]
    //      participants, keyPoints, actionItems, nextSteps[List[str]]

    useEffect(() => {
        if (isRecording) {
            timerRef.current = setInterval(() => {
            setRecordingTime(prev => prev + 1);
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
        }, [isRecording]
    );

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

    // Uploads file to the back-end via the /jobs post method
    const uploadFile = () => {
        if (!selectedFile) return;

        setLoading(true);
        const formData = new FormData();
        formData.append("file", selectedFile);

        fetch("/jobs", {
            method: "POST",
            body: formData
        })
        .then(result => result.json())
        .then(data => {
            setTranscript(Array.isArray(data.transcript) ? data.transcript : []);
            setJobUUID(data.uuid);
            fetchSummary(data.uuid);
            setLoading(false);
        })
        .catch(err => {
            console.error("Failed to fetch transcription.", err);
            setLoading(false);
        });
    };

    const processAudio = async (audioBlob) => {
        setIsProcessing(true);
        const formData = new FormData();
        formData.append("file", audioBlob);

        fetch("/jobs", {
            method: "POST",
            body: formData
        })
        .then(result => result.json())
        .then(data => {
            setTranscript(Array.isArray(data.transcript) ? data.transcript : []);
            setJobUUID(data.uuid);
            fetchSummary(data.uuid);
            setIsProcessing(false);
        })
        .catch(err => {
            console.error("Failed to fetch transcription -", err);
            setIsProcessing(false);
        });
    };

    const fetchSummary = (uuid) => {
        fetch(`/jobs/${uuid}/summarise`, { method: "POST" })
            .then(res => res.json())
            .then(data => {
                if (data && data.summary) {
                    const participants = [...new Set(transcript.map(t => t.speaker))];
                    setSummary({
                    meetingTitle: `Meeting UUID ${uuid}`,
                    duration: formatTime(recordingTime),
                    participants,
                    keyPoints: [data.summary],
                    actionItems: [],
                    nextSteps: []
                    });
                }
            })
        .catch(err => console.error("Failed to fetch summary", err));
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
            <h1 className="header-title">🧠 MeetMemo</h1>
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
                        onClick={uploadFile}
                        disabled={!selectedFile || loading}
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
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    className="file-input"
                />

                {/* Uploading progress indicator */}
                {loading && (
                    <div className="progress-container">
                    <div className="progress-bar">
                        <div 
                        className="progress-fill"
                        ></div>
                    </div>
                    <p className="progress-text">Uploading...</p>
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