import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Upload, Download, FileText, Users, Clock, Hash } from 'lucide-react';
import './MeetingTranscriptionApp.css';
import jsPDF from "jspdf";
import { useCallback } from 'react';

const MeetingTranscriptionApp = () => {
    /////////////////////////// All constants ///////////////////////////
    // Constants for transcription function
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [transcript, setTranscript] = useState([]);
    const [summary, setSummary] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const fileInputRef = useRef(null);
    const timerRef = useRef(null);
    const [meetingList, setMeetingList] = useState([]);
    const [selectedMeetingId, setSelectedMeetingId] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);


    const truncateFileName = (name, maxLength = 20) => {
        if (!name) return "";
        return name.length > maxLength ? name.slice(0, maxLength).trim() + "..." : name;
    };


    const toggleDarkMode = () => {
        setIsDarkMode(prev => !prev);
        document.documentElement.setAttribute('data-theme', !isDarkMode ? 'dark' : 'light');
    };

    useEffect(() => {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setIsDarkMode(prefersDark);
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }, []);

    useEffect(() => {
        fetch("/jobs")
            .then(res => res.json())
            .then(data => {
                const list = Object.entries(data.csv_list).map(([uuid, info]) => ({
                    uuid,
                    name: info.file_name
                }));
                setMeetingList(list);
            })
            .catch(err => console.error("Failed to fetch meeting list", err));
    }, []);

    const loadPastMeeting = (uuid) => {
        getSpeakerColor.speakerMap = {};
        fetch(`/jobs/${uuid}/transcript`)
            .then(res => res.json())
            .then(data => {
                const parsed = JSON.parse(data.full_transcript || "[]");
                setTranscript(
                    parsed.map((entry, idx) => {
                        const speaker = Object.keys(entry)[0];
                        const text = entry[speaker];
                        return { id: idx, speaker, text };
                    })
                );
                return fetch(`/jobs/${uuid}/summarise`, { method: "POST" });
            })
            .then(res => res.json())
            .then(data => {
                setSummary({
                    meetingTitle: data.fileName,
                    duration: "N/A",
                    participants: data.participants,
                    keyPoints: data.keyPoints,
                    actionItems: data.actionItems,
                    nextSteps: data.nextSteps
                });
                setSelectedMeetingId(uuid);
            })
            .catch(err => console.error("Failed to load past meeting", err));
    };

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
                processAudio(audioBlob);
            };

            mediaRecorderRef.current.start();
            setRecordingTime(0);
            setIsRecording(true);
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
        getSpeakerColor.speakerMap = {}; // Reset color cache
        setLoading(true);
        const formData = new FormData();
        formData.append("file", selectedFile);

        fetch("/jobs", {
            method: "POST",
            body: formData
        })
        .then(result => result.json())
        .then(data => {
            setTranscript(
                Array.isArray(data.transcript)
                    ? data.transcript.map((entry, idx) => {
                        const speaker = Object.keys(entry)[0];
                        const text = entry[speaker];
                        return { id: idx, speaker, text };
                    })
                    : []
                );
            fetchSummary(data.uuid);
            fetchMeetingList();
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
            setTranscript(
                Array.isArray(data.transcript)
                    ? data.transcript.map((entry, idx) => {
                        const speaker = Object.keys(entry)[0];
                        const text = entry[speaker];
                        return { id: idx, speaker, text };
                    })
                    : []
                );
            fetchSummary(data.uuid);
            fetchMeetingList();
            setIsProcessing(false);
        })
        .catch(err => {
            console.error("Failed to fetch transcription -", err);
            setIsProcessing(false);
        });
    };


    const fetchMeetingList = useCallback(() => {
        fetch("/jobs")
            .then(res => res.json())
            .then(data => {
                const list = Object.entries(data.csv_list).map(([uuid, info]) => ({
                    uuid,
                    name: info.file_name
                }));
                setMeetingList(list);
            })
            .catch(err => console.error("Failed to fetch meeting list", err));
    }, []);


    useEffect(() => {
        fetchMeetingList();
    }, [fetchMeetingList]);


    const fetchSummary = (uuid) => {
        setSummaryLoading(true);
        fetch(`/jobs/${uuid}/summarise`, { method: "POST" })
            .then(res => res.json())
            .then(data => {
                if (data) {
                    setSummary({
                        meetingTitle: data.fileName,
                        duration: formatTime(recordingTime),
                        participants: data.participants,
                        keyPoints: data.keyPoints,
                        actionItems: data.actionItems,
                        nextSteps: data.nextSteps
                    });
                }
            })
            .catch(err => console.error("Failed to fetch summary", err))
            .finally(() => setSummaryLoading(false));
    };


    const handleDeleteMeeting = (uuid) => {
        if (!window.confirm("Are you sure you want to delete this meeting?")) return;

        fetch(`/jobs/${uuid}`, {
            method: "DELETE",
        })
        .then(res => {
            if (!res.ok) throw new Error("Failed to delete meeting");
            // Update UI state
            setMeetingList(prev => prev.filter(m => m.uuid !== uuid));
            if (selectedMeetingId === uuid) {
                setTranscript([]);
                setSummary(null);
                setSelectedMeetingId(null);
            }
        })
        .catch(err => console.error("Delete failed:", err));
    };


    const exportToPDF = () => {
        if (!summary) return;
        const doc = new jsPDF();
        let y = 10;
        const lineHeight = 8;
        const pageHeight = doc.internal.pageSize.height;
        const addLine = (text, indent = 10) => {
            if (y + lineHeight > pageHeight - 10) {
                doc.addPage();
                y = 10;
            }
            doc.text(text, indent, y);
            y += lineHeight;
        };
        doc.setFontSize(16);
        addLine("Meeting Summary");
        doc.setFontSize(12);
        addLine(`Title: ${summary.meetingTitle || "N/A"}`);
        addLine(`Duration: ${summary.duration || "N/A"}`);
        addLine(`Participants: ${(summary.participants || []).join(', ') || "N/A"}`);
        const addList = (title, items, bullet = "•") => {
            if (!Array.isArray(items) || items.length === 0) return;
            addLine("");
            addLine(`${title}:`);
            (items || []).forEach(item => {
                addLine(`${bullet} ${item}`, 14);
            });
        };
        addList("Key Discussion Points", summary.keyPoints);
        addList("Action Items", summary.actionItems);
        addList("Next Steps", summary.nextSteps);
        doc.save("meeting-summary.pdf");
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const speakerColorMap = useRef({});

    const getSpeakerColor = useCallback((speaker) => {
        const colors = ['speaker-blue', 'speaker-green', 'speaker-purple', 'speaker-orange'];
        if (!(speaker in speakerColorMap.current)) {
            const newColorIndex = Object.keys(speakerColorMap.current).length % colors.length;
            speakerColorMap.current[speaker] = colors[newColorIndex];
        }
        return speakerColorMap.current[speaker];
    }, []);

    return (
        <div className="app-container">
            <div className="max-width-container">
                {/* Header */}
                <div className="header-card">
                <h1 className="header-title">🧠 MeetMemo</h1>
                <button
                className="btn btn-small"
                onClick={toggleDarkMode}
                style={{ float: "right" }}
                >
                    {isDarkMode ? "☀ Light Mode" : "🌙 Dark Mode"}
                </button>
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
                                {selectedFile ? "Change Audio File" : "Choose Audio File"}
                            </button>
                            
                            <button
                            onClick={uploadFile}
                            disabled={!selectedFile || loading}
                            className={`btn ${selectedFile ? 'btn-primary' : 'btn-disabled'}`}
                            >
                                <Upload className="btn-icon" />
                                {loading ? "Uploading..." : selectedFile ? "Upload Selected File" : "Upload Audio"}
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
                    {/* Past Meetings */}
                    <div className="card">
                        <h2 className="section-title">
                            <FileText className="section-icon" />
                            Past Meetings
                        </h2>
                        {meetingList.map((meeting, index) => {
                            const colorClass = `btn-past-${(index % 4) + 1}`;
                            return (
                                <div key={meeting.uuid} className="meeting-entry">
                                    <button
                                        className={`space btn btn-small ${colorClass} ${selectedMeetingId === meeting.uuid ? 'btn-active' : ''}`}
                                        onClick={() => loadPastMeeting(meeting.uuid)}
                                    >
                                        {truncateFileName(meeting.name)}

                                    </button>
                                    <button
                                        className="btn btn-danger btn-small"
                                        onClick={() => handleDeleteMeeting(meeting.uuid)}
                                        style={{ marginLeft: "0.5rem" }}
                                    >
                                        🗑
                                    </button>
                                </div>
                            );
                        })}
                    </div>
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

                    {summaryLoading ? (
                        <div className="processing-indicator">
                            <div className="spinner"></div>
                            <span>Generating summary with AI...</span>
                        </div>
                        ) : (
                        summary?.participants && summary.participants.length > 0 ? (
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
                    )
                    )}
                    </div>
                </div>
                </div>
            </div>
        </div>
    );
    };

export default MeetingTranscriptionApp;