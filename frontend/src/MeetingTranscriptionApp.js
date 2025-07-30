import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Upload, Download, FileText, Hash, Send, MessagesSquare, } from "lucide-react";
import "./MeetingTranscriptionApp.css";
import jsPDF from "jspdf";
import { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const [showSummary, setShowSummary] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const speakerColorMap = useRef({});
  const [selectedModel, setSelectedModel] = useState("turbo");
  
  const [speakerNameMap, setSpeakerNameMap] = useState({});
  const speakerNameMapRef = useRef(speakerNameMap);
  useEffect(() => {
    speakerNameMapRef.current = speakerNameMap;
  }, [speakerNameMap]);
  const [editingSpeaker, setEditingSpeaker] = useState(null);
  const [isSavingNames, setIsSavingNames] = useState(false);

  /////////////////////////// All functions //////////////////////////
  // Shortens transcripts with overly long file names
  const truncateFileName = (name, maxLength = 20) => {
    if (!name) return "";
    return name.length > maxLength
      ? name.slice(0, maxLength).trim() + "..."
      : name;
  };


  const handleSpeakerNameChange = (oldName, newName) => {
    if (!newName || oldName === newName) return;

    // Update transcript entries
    setTranscript((prevTranscript) =>
      prevTranscript.map((entry) =>
        entry.speaker === oldName ? { ...entry, speaker: newName } : entry
      )
    );

    // Update speaker name map
    setSpeakerNameMap((prev) => ({
      ...prev,
      [oldName]: newName,
    }));

    handleSubmitSpeakerNames(); // Save to backend
  };


  const handleSubmitSpeakerNames = () => {
    if (!selectedMeetingId) {
      alert("No meeting is selected.");
      return;
    }
    setIsSavingNames(true);

    // Use the ref to get the latest speakerNameMap
    const currentSpeakerNameMap = speakerNameMapRef.current;

    fetch(`/jobs/${selectedMeetingId}/speakers`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping: currentSpeakerNameMap }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to update speaker names");
        return res.json();
      })
      .then((data) => {
        setTranscript(data.transcript);
        setIsRenaming(false);
      })
      .catch((err) => {
        console.error("Failed to save speaker names:", err);
        alert("An error occurred while saving the new names.");
      })
      .finally(() => {
        setIsSavingNames(false);
      });
  };

  // Allows user to switch between light & dark modes
  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
    document.documentElement.setAttribute(
      "data-theme",
      !isDarkMode ? "dark" : "light",
    );
  };

  const loadPastMeeting = (uuid) => {
    setTranscript([]);
    setSummary(null);
    setSelectedMeetingId(uuid);
    getSpeakerColor.speakerMap = {};
    fetch(`/jobs/${uuid}/transcript`)
      .then((res) => res.json())
      .then((data) => {
        const parsed = JSON.parse(data.full_transcript || "[]");
        setTranscript(
          parsed.map((entry, idx) => ({
            id: idx,
            speaker: entry.speaker ?? 'SPEAKER_00',
            text: entry.text,
            start: entry.start,
            end: entry.end,
          })),
        );
        return fetch(`/jobs/${uuid}/summarise`, { method: "POST" });
      })
      .then((res) => res.json())
      .then((data) => {
          setSummary({
            meetingTitle: data.fileName,
            summary: data.summary,
          });
        })
      .catch((err) => console.error("Failed to load past meeting", err));
  };

  // Constants for the function below
  // DO NOT move these to the top
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  // Renames meetings based on user input
  const handleRename = () => {
    if (!selectedMeetingId) return;

    fetch(`/jobs/${selectedMeetingId}/rename?new_name=${newName}`, {
      method: "PATCH",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setSummary((prev) => ({ ...prev, meetingTitle: newName }));
          fetchMeetingList();
          setIsRenaming(false);
        }
      })
      .catch((err) => console.error("Failed to rename meeting", err));
  };

  // Starts recording meeting via web app interface
  const startRecording = async () => {
    try {
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
        processAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setRecordingTime(0);
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  // To stop audio recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
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
      body: formData,
    })
      .then((result) => result.json())
      .then((data) => {
        setTranscript(
          Array.isArray(data.transcript)
            ? data.transcript.map((entry, idx) => ({
                id: idx,
                speaker: entry.speaker ?? 'SPEAKER_00',
                text: entry.text,
                start: entry.start,
                end: entry.end,
              }))
            : [],
        );
        fetchSummary(data.uuid);
        fetchMeetingList();
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch transcription.", err);
        setLoading(false);
      });
  };

  // Transcribes submitted audio file, & generates a meeting summary for the user.
  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append("file", audioBlob);

    fetch("/jobs", {
      method: "POST",
      body: formData,
    })
      .then((result) => result.json())
      .then((data) => {
        setTranscript(
          Array.isArray(data.transcript)
            ? data.transcript.map((entry, idx) => ({
                id: idx,
                speaker: entry.speaker ?? 'SPEAKER_00',
                text: entry.text,
                start: entry.start,
                end: entry.end,
              }))
            : [],
        );
        fetchSummary(data.uuid);
        fetchMeetingList();
        setIsProcessing(false);
      })
      .catch((err) => {
        console.error("Failed to fetch transcription -", err);
        setIsProcessing(false);
      });
  };

  // Fetches a list of all past meetings to be displayed in side bar
  const fetchMeetingList = () => {
    fetch("/jobs")
      .then((res) => res.json())
      .then((data) => {
        const list = Object.entries(data.csv_list).map(([uuid, info]) => ({
          uuid,
          name: info.file_name,
        }));
        setMeetingList(list);
      })
      .catch((err) => console.error("Failed to fetch meeting list", err));
  };

  // Fetches summary to be displayed on front-end
  const fetchSummary = (uuid) => {
    setSummaryLoading(true);
    fetch(`/jobs/${uuid}/summarise`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          const summaryText = `
### Key Points
${data.keyPoints.map((item) => `- ${item}`).join("\n")}

### Action Items
${data.actionItems.map((item) => `- ${item}`).join("\n")}

### Next Steps
${data.nextSteps.map((item) => `- ${item}`).join("\n")}
`;
          setSummary({
            meetingTitle: data.fileName,
            summary: summaryText,
          });
        }
      })
      .catch((err) => console.error("Failed to fetch summary", err))
      .finally(() => setSummaryLoading(false));
  };

  // Handles deletion of past meeting by user
  const handleDeleteMeeting = (uuid) => {
    if (!window.confirm("Are you sure you want to delete this meeting?"))
      return;

    fetch(`/jobs/${uuid}`, {
      method: "DELETE",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to delete meeting");
        // Update UI state
        setMeetingList((prev) => prev.filter((m) => m.uuid !== uuid));
        if (selectedMeetingId === uuid) {
          setTranscript([]);
          setSummary(null);
          setSelectedMeetingId(null);
        }
      })
      .catch((err) => console.error("Delete failed:", err));
  };

  // Exports summary to PDF format for download
  const exportToPDF = () => {
    if (!summary) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineHeight = 14;
    let y = margin;

    const addLine = (text, indent = margin, fontSize = 12, isBold = false) => {
      doc.setFontSize(fontSize);
      doc.setFont(undefined, isBold ? "bold" : "normal");
      const wrapped = doc.splitTextToSize(text, pageWidth - indent - margin);
      wrapped.forEach((line) => {
        if (y + lineHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, indent, y);
        y += lineHeight;
      });
    };

    doc.setFontSize(18);
    addLine("Meeting Summary", margin, 18, true);
    y += lineHeight;

    doc.setFontSize(12);
    addLine(`Title: ${summary.meetingTitle || "N/A"}`, margin, 12, true);
    y += lineHeight;

    const lines = summary.summary.split("\n");
    lines.forEach((line) => {
      if (line.startsWith("### ")) {
        addLine(line.substring(4), margin, 14, true);
      } else if (line.startsWith("- ")) {
        addLine(line.substring(2), margin + 15);
      } else {
        addLine(line, margin);
      }
    });

    doc.save("meeting-summary.pdf");
  };

  // To export transcript to PDF for download
  const exportTranscriptToPDF = () => {
    if (transcript.length === 0) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineHeight = 14;
    let y = margin;

    const addLine = (text, indent = margin, fontSize = 12, isBold = false) => {
      doc.setFontSize(fontSize);
      doc.setFont(undefined, isBold ? "bold" : "normal");
      const wrapped = doc.splitTextToSize(text, pageWidth - indent - margin);
      wrapped.forEach((line) => {
        if (y + lineHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, indent, y);
        y += lineHeight;
      });
    };

    doc.setFontSize(18);
    addLine("Meeting Transcript", margin, 18, true);
    y += lineHeight;

    transcript.forEach(entry => {
      addLine(entry.speaker  ?? 'SPEAKER_00', margin, 12, true);
      addLine(entry.text, margin + 15);
      y += lineHeight;
    });

    doc.save("meeting-transcript.pdf");
  };

  // Formats time to be displayed (works with display of meeting recording duration)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Alternates speaker colors for more vibrant front-end display
  const getSpeakerColor = useCallback((speaker) => {
    const colors = [
      "speaker-afblue",
      "speaker-poisedgold",
      "speaker-navyblue",
      "speaker-armyred",
    ];
    if (!(speaker in speakerColorMap.current)) {
      const newColorIndex =
        Object.keys(speakerColorMap.current).length % colors.length;
      speakerColorMap.current[speaker] = colors[newColorIndex];
    }
    return speakerColorMap.current[speaker];
  }, []);

  /////////////////////////// All use effects //////////////////////////
  // Checks based on user's web settings if they prefer light or dark mode by default
  useEffect(() => {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    setIsDarkMode(prefersDark);
    document.documentElement.setAttribute(
      "data-theme",
      prefersDark ? "dark" : "light",
    );
  }, []);

  // Converts past meeting data fetched from the back-end into compatible format to feed into the display card
  useEffect(() => {
    fetch("/jobs")
      .then((res) => res.json())
      .then((data) => {
        const list = Object.entries(data.csv_list).map(([uuid, info]) => ({
          uuid,
          name: info.file_name,
        }));
        setMeetingList(list);
      })
      .catch((err) => console.error("Failed to fetch meeting list", err));
  }, []);

  // Records the duration of the meeting, if the record button is toggled directly on the app
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // Automatically loads past meetings from server side
  useEffect(() => {
    fetchMeetingList();
  }, []);

  return (
    <div className="app-container">
      <div className="max-width-container">
        {/* Header */}
        <div className="header-card">
          <h1 className="header-title">
            <MessagesSquare className="header-icon" /> MeetMemo
          </h1>
          <button
            className="btn btn-small"
            onClick={toggleDarkMode}
            style={{ float: "right" }}
          >
            {isDarkMode ? "☀ Light Mode" : "🌙 Dark Mode"}
          </button>
          <p className="header-subtitle">
            Record, transcribe, and summarize your meetings with AI-powered
            insights
          </p>
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
                {/* Select model for transcription */}
                <label className="model-select-wrapper">
                  <span className="model-select-label">Model:</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="model-select"
                  >
                    {["tiny", "base", "small", "medium", "large", "turbo"].map(
                      (m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <div className="button-group">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`btn ${isRecording ? "btn-danger" : "btn-primary"}`}
                  >
                    {isRecording ? (
                      <MicOff className="btn-icon" />
                    ) : (
                      <Mic className="btn-icon" />
                    )}
                    {isRecording ? "Stop Recording" : "Start Recording"}
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary"
                  >
                    <Upload className="btn-icon" />
                    {selectedFile ? "Change Audio File" : "Upload Audio File"}
                  </button>

                  <button
                    onClick={uploadFile}
                    disabled={!selectedFile || loading}
                    className={`btn ${selectedFile ? "btn-primary" : "btn-disabled"}`}
                  >
                    <Send className="btn-icon" />
                    {loading
                      ? "Transcribing..."
                      : selectedFile
                        ? "Start Transcription"
                        : "Start Transcription"}
                  </button>
                </div>

                {isRecording && (
                  <div className="recording-indicator">
                    <div className="recording-dot"></div>
                    <span className="recording-time">
                      {formatTime(recordingTime)}
                    </span>
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
                <div className="processing-indicator">
                  <div className="spinner"></div>
                  <span>Processing audio with AI...</span>
                </div>
              )}

              {isProcessing && (
                <div className="processing-indicator">
                  <div className="spinner"></div>
                  <span>Processing audio with AI...</span>
                </div>
              )}
            </div>
            {/* Transcript and Summary Section */}
            <div className="card">
              <div className="transcript-summary-header">
                <div className="tabs">
                  <button
                    className={`tab-button ${!showSummary ? "active" : ""}`}
                    onClick={() => setShowSummary(false)}
                  >
                    <FileText className="section-icon" />
                    Transcript
                  </button>
                  <button
                    className={`tab-button ${showSummary ? "active" : ""}`}
                    onClick={() => setShowSummary(true)}
                  >
                    <Hash className="section-icon" />
                    Summary
                  </button>
                </div>
                <div className="actions-group">
                  
                  
                  {!showSummary && (
                    <button
                      onClick={exportTranscriptToPDF}
                      className="btn btn-success btn-small"
                    >
                      <Download className="btn-icon" />
                      Export PDF
                    </button>
                  )}
                  {showSummary && (
                    <button
                      onClick={exportToPDF}
                      className="btn btn-success btn-small"
                    >
                      <Download className="btn-icon" />
                      Export PDF
                    </button>
                  )}
                </div>
              </div>
              {showSummary ? (
                summaryLoading ? (
                  <div className="processing-indicator">
                    <div className="spinner"></div>
                    <span>Generating summary with AI…</span>
                  </div>
                ) : summary && summary.summary ? (
                  <div className="summary-content">
                    {isRenaming ? (
                      <div className="rename-container">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="rename-input"
                        />
                        <button onClick={handleRename} className="btn btn-success btn-small">Save</button>
                        <button onClick={() => setIsRenaming(false)} className="btn btn-secondary btn-small">Cancel</button>
                      </div>
                    ) : (
                      <p>
                        <strong>Title:</strong> {summary.meetingTitle}
                        <button onClick={() => { setIsRenaming(true); setNewName(summary.meetingTitle); }} className="btn btn-secondary btn-small rename-btn">Rename</button>
                      </p>
                    )}
                    <div className="summary-text">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {summary.summary}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  
                  <div className="empty-state">
                    <Hash className="empty-icon" />
                    <p className="empty-title">No summary available</p>
                    <p className="empty-subtitle">
                      Summary will appear after processing audio
                    </p>
                  </div>
                )
              ) : (
                <div className="transcript-container">
                  {transcript.length > 0 ? (
                    transcript.map((entry) => (
                      <div key={entry.id} className="transcript-entry">
                        <div className="transcript-header">
                          {editingSpeaker === entry.speaker ? (
                            <div className="speaker-edit-container">
                              <input
                                type="text"
                                defaultValue={entry.speaker ?? 'SPEAKER_00'}
                                onBlur={(e) => {
                                  handleSpeakerNameChange(entry.speaker, e.target.value);
                                  setEditingSpeaker(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSpeakerNameChange(entry.speaker, e.target.value);
                                    setEditingSpeaker(null);
                                  }
                                }}
                              />
                              <button
                                onClick={() => setEditingSpeaker(null)}
                                className="btn btn-success btn-small"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <span
                              className={`speaker-badge ${getSpeakerColor(entry.speaker ?? 'SPEAKER_00')}`}
                            >
                              {speakerNameMap[entry.speaker] ?? entry.speaker}
                            </span>
                          )}
                          <span className="timestamp">{entry.start}s - {entry.end}s</span>
                        </div>
                        <p className="transcript-text">{entry.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Mic className="empty-icon" />
                      <p className="empty-title">No transcript available</p>
                      <p className="empty-subtitle">
                        Start recording or upload an audio file to begin
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column – Past Meetings */}
          <div className="right-column">
            <div className="card meetings-card">
              <h2 className="section-title">
                <FileText className="section-icon" />
                Meetings
              </h2>
              <div className="meetings-scroll-wrapper">
                {meetingList.map((meeting, index) => {
                  const colorClass = `btn-past-${(index % 4) + 1}`;
                  return (
                    <div key={meeting.uuid} className="meeting-entry">
                      <button
                        className={`space btn btn-small ${colorClass} ${
                          selectedMeetingId === meeting.uuid ? "btn-active" : ""
                        }`}
                        onClick={() => loadPastMeeting(meeting.uuid)}
                      >
                        {truncateFileName(meeting.name)}
                      </button>
                      <button
                        className="btn btn-danger btn-small delete-meeting-btn"
                        onClick={() => handleDeleteMeeting(meeting.uuid)}
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      
    </div>
  );
};

export default MeetingTranscriptionApp;
