import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Pause,
  Play,
  Upload,
  Download,
  FileText,
  Hash,
  Send,
  MessagesSquare,
  Trash2,
} from "lucide-react";
import "./MeetingTranscriptionApp.css";
import jsPDF from "jspdf";
import { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

const processTranscriptWithSpeakerIds = (transcriptData) => {
  const speakerMap = {};
  let speakerCounter = 1;
  return transcriptData.map((entry, idx) => {
    const speaker = entry.speaker ?? "SPEAKER_00";
    if (!speakerMap[speaker]) {
      speakerMap[speaker] = speakerCounter++;
    }
    return {
      id: idx,
      speaker: speaker,
      speakerId: speakerMap[speaker],
      text: entry.text,
      start: entry.start,
      end: entry.end,
    };
  });
};

const MeetingTranscriptionApp = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isPlayingUpload, setIsPlayingUpload] = useState(false);
  const audioPlayerRef = useRef(null);
  const uploadPlayerRef = useRef(null);
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
  const [customPrompt, setCustomPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showPromptInputs, setShowPromptInputs] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const speakerColorMap = useRef({});
  const [selectedModel, setSelectedModel] = useState("turbo");
  const [speakerNameMap, setSpeakerNameMap] = useState({});
  const speakerNameMapRef = useRef(speakerNameMap);
  useEffect(() => {
    speakerNameMapRef.current = speakerNameMap;
  }, [speakerNameMap]);

  // Initialize particles.js
  useEffect(() => {
    if (window.particlesJS) {
      window.particlesJS("particles-js", {
        particles: {
          number: {
            value: 80,
            density: {
              enable: true,
              value_area: 800,
            },
          },
          color: {
            value: ["#2998D5", "#265289", "#75797C", "#bba88e", "#FFFFFF"],
          },
          shape: {
            type: "circle",
            stroke: {
              width: 0,
              color: "#000000",
            },
          },
          opacity: {
            value: 0.9,
            random: false,
            anim: {
              enable: false,
              speed: 1,
              opacity_min: 0.7,
              sync: false,
            },
          },
          size: {
            value: 3,
            random: true,
            anim: {
              enable: false,
              speed: 40,
              size_min: 0.1,
              sync: false,
            },
          },
          line_linked: {
            enable: true,
            distance: 150,
            color: "#8a7c6b",
            opacity: 0.8,
            width: 2.5,
          },
          move: {
            enable: true,
            speed: 2,
            direction: "none",
            random: false,
            straight: false,
            out_mode: "out",
            bounce: false,
            attract: {
              enable: false,
              rotateX: 600,
              rotateY: 1200,
            },
          },
        },
        interactivity: {
          detect_on: "canvas",
          events: {
            onhover: {
              enable: true,
              mode: "repulse",
            },
            onclick: {
              enable: true,
              mode: "push",
            },
            resize: true,
          },
          modes: {
            grab: {
              distance: 400,
              line_linked: {
                opacity: 1,
              },
            },
            bubble: {
              distance: 400,
              size: 40,
              duration: 2,
              opacity: 8,
              speed: 3,
            },
            repulse: {
              distance: 200,
              duration: 0.4,
            },
            push: {
              particles_nb: 4,
            },
            remove: {
              particles_nb: 2,
            },
          },
        },
        retina_detect: true,
      });
    }
  }, [isDarkMode]);
  const [editingSpeaker, setEditingSpeaker] = useState(null);
  const [, setIsSavingNames] = useState(false);

  const truncateFileName = (name, maxLength = 20) => {
    if (!name) return "";
    return name.length > maxLength
      ? name.slice(0, maxLength).trim() + "..."
      : name;
  };

  const handleSpeakerNameChange = (oldName, newName) => {
    if (!newName || oldName === newName) return;
    setTranscript((prevTranscript) =>
      prevTranscript.map((entry) =>
        entry.speaker === oldName ? { ...entry, speaker: newName } : entry,
      ),
    );
    setSpeakerNameMap((prev) => ({
      ...prev,
      [oldName]: newName,
    }));
    handleSubmitSpeakerNames();
  };

  const handleSubmitSpeakerNames = () => {
    if (!selectedMeetingId) {
      alert("No meeting is selected.");
      return;
    }
    setIsSavingNames(true);
    const currentSpeakerNameMap = speakerNameMapRef.current;

    fetch(`${API_BASE_URL}/jobs/${selectedMeetingId}/speakers`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping: currentSpeakerNameMap }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to update speaker names");
        return res.json();
      })
      .then(() => {
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
    speakerColorMap.current = {};
    setSummaryLoading(true);

    fetch(`${API_BASE_URL}/jobs/${uuid}/transcript`)
      .then((res) => res.json())
      .then((data) => {
        const parsed = JSON.parse(data.full_transcript || "[]");
        setTranscript(processTranscriptWithSpeakerIds(parsed));
        return fetch(`${API_BASE_URL}/jobs/${uuid}/summarise`, {
          method: "POST",
        });
      })
      .then((res) => res.json())
      .then((data) => {
        setSummary({
          meetingTitle: data.fileName,
          summary: data.summary,
        });
      })
      .catch((err) => console.error("Failed to load past meeting", err))
      .finally(() => setSummaryLoading(false));
  };

  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const handleRename = () => {
    if (!selectedMeetingId) return;

    fetch(
      `${API_BASE_URL}/jobs/${selectedMeetingId}/rename?new_name=${newName}`,
      { method: "PATCH" },
    )
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
        setRecordedAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setRecordingTime(0);
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
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

  const processRecordedAudio = () => {
    if (recordedAudio) {
      processAudio(recordedAudio);
      setRecordedAudio(null); // Clear the recorded audio after processing
    }
  };

  const discardRecording = () => {
    setRecordedAudio(null);
    setRecordingTime(0);
  };

  const discardUpload = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const pollJobStatus = async (uuid, maxAttempts = 30) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${API_BASE_URL}/jobs/${uuid}/status`);
        const statusData = await response.json();
        
        if (statusData.status === 'completed') {
          // Job completed, fetch transcript
          const transcriptResponse = await fetch(`${API_BASE_URL}/jobs/${uuid}/transcript`);
          const transcriptData = await transcriptResponse.json();
          
          if (transcriptData.full_transcript) {
            const parsed = JSON.parse(transcriptData.full_transcript || "[]");
            setTranscript(processTranscriptWithSpeakerIds(parsed));
            setSelectedMeetingId(uuid);
            fetchSummary(uuid);
            fetchMeetingList();
            return true;
          }
        } else if (statusData.status === 'failed' || statusData.status === 'error') {
          throw new Error(statusData.error_message || 'Job failed');
        }
        
        // Job still processing, wait and retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Error polling job status:', error);
        throw error;
      }
    }
    throw new Error('Job polling timeout - processing took too long');
  };

  const uploadFile = async () => {
    if (!selectedFile) return;
    speakerColorMap.current = {};
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json();
      
      // Check if the response indicates success and has expected data
      if (data.error || (!data.uuid && !data.transcript)) {
        throw new Error(data.error || 'Invalid response from server');
      }

      // If we get a transcript immediately, use it
      if (data.transcript && Array.isArray(data.transcript)) {
        setTranscript(processTranscriptWithSpeakerIds(data.transcript));
        setSelectedMeetingId(data.uuid);
        fetchSummary(data.uuid);
        fetchMeetingList();
      } else if (data.uuid) {
        // Otherwise, poll for status
        await pollJobStatus(data.uuid);
      } else {
        throw new Error('No transcript or job ID returned');
      }
      
      setSelectedFile(null);
    } catch (err) {
      console.error("Failed to process uploaded file:", err);
      alert(`Failed to process file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    
    try {
      const formData = new FormData();
      formData.append("file", audioBlob);

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json();
      
      // Check if the response indicates success and has expected data
      if (data.error || (!data.uuid && !data.transcript)) {
        throw new Error(data.error || 'Invalid response from server');
      }

      // If we get a transcript immediately, use it
      if (data.transcript && Array.isArray(data.transcript)) {
        setTranscript(processTranscriptWithSpeakerIds(data.transcript));
        setSelectedMeetingId(data.uuid);
        fetchSummary(data.uuid);
        fetchMeetingList();
      } else if (data.uuid) {
        // Otherwise, poll for status
        await pollJobStatus(data.uuid);
      } else {
        throw new Error('No transcript or job ID returned');
      }
    } catch (err) {
      console.error("Failed to process recorded audio:", err);
      alert(`Failed to process recording: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchMeetingList = () => {
    fetch(`${API_BASE_URL}/jobs`)
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

  const fetchSummary = (uuid, forceRegenerate = false) => {
    setSummaryLoading(true);

    const generateSummary = () => {
      // Prepare request body with custom prompts if provided
      const requestBody = {};
      if (customPrompt.trim()) {
        requestBody.custom_prompt = customPrompt.trim();
      }
      if (systemPrompt.trim()) {
        requestBody.system_prompt = systemPrompt.trim();
      }

      const requestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      };

      // Only add body if we have custom prompts
      if (Object.keys(requestBody).length > 0) {
        requestOptions.body = JSON.stringify(requestBody);
      }

      fetch(`${API_BASE_URL}/jobs/${uuid}/summarise`, requestOptions)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.summary) {
            setSummary({
              meetingTitle: data.fileName,
              summary: data.summary,
            });
          }
        })
        .catch((err) => console.error("Failed to fetch summary", err))
        .finally(() => setSummaryLoading(false));
    };

    if (forceRegenerate) {
      // First delete the cached summary, then generate a new one
      fetch(`${API_BASE_URL}/jobs/${uuid}/summary`, {
        method: "DELETE",
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("Summary deletion result:", data);
          // Generate new summary regardless of deletion result
          generateSummary();
        })
        .catch((err) => {
          console.error("Failed to delete cached summary", err);
          // Still try to generate new summary even if deletion failed
          generateSummary();
        });
    } else {
      // Normal fetch - will return cached if available
      generateSummary();
    }
  };

  const handleDeleteMeeting = (uuid) => {
    if (!window.confirm("Are you sure you want to delete this meeting?"))
      return;

    fetch(`${API_BASE_URL}/jobs/${uuid}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to delete meeting");
        setMeetingList((prev) => prev.filter((m) => m.uuid !== uuid));
        if (selectedMeetingId === uuid) {
          setTranscript([]);
          setSummary(null);
          setSelectedMeetingId(null);
        }
      })
      .catch((err) => console.error("Delete failed:", err));
  };

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

  const exportTranscriptToTxt = () => {
    if (transcript.length === 0) return;
    let textContent = "Meeting Transcript\n\n";
    transcript.forEach((entry) => {
      const speaker = speakerNameMap[entry.speaker] ?? entry.speaker;
      textContent += `${speaker}: ${entry.text}\n\n`;
    });

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "meeting-transcript.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

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

  useEffect(() => {
    fetch(`${API_BASE_URL}/jobs`)
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
          <label className="theme-toggle" style={{ float: "right" }}>
            <input
              type="checkbox"
              checked={isDarkMode}
              onChange={toggleDarkMode}
            />
            <span className="toggle-slider"></span>
          </label>
          <p className="header-subtitle">
            Record, transcribe, and summarize your meetings with AI-powered
            insights
          </p>
        </div>

        <div className="main-grid">
          {/* Left Column */}
          <div className="left-column">
            {/* Recording Controls */}
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
                    onChange={(e) => setSelectedModel(e.target.value)}
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
                    disabled={(!selectedFile && !recordedAudio) || loading}
                    className={`btn ${(selectedFile || recordedAudio) && !loading ? "btn-discrete-prominent" : "btn-discrete"}`}
                    title={loading ? "Processing..." : "Process Audio"}
                  >
                    <Send className="btn-icon" />
                    {((selectedFile || recordedAudio) && !loading) ? "Process Audio" : ""}
                  </button>

                  {isRecording && (
                    <div className="recording-indicator">
                      <div className={`recording-dot ${isPaused ? 'paused' : ''}`}></div>
                      <span className="recording-time">
                        {formatTime(recordingTime)} {isPaused ? '(Paused)' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                className="file-input"
              />

              {selectedFile && (
                <div className="audio-preview">
                  <h3 className="audio-preview-title">Upload Preview - {selectedFile.name}</h3>
                  <audio 
                    ref={uploadPlayerRef} 
                    controls 
                    className="audio-player"
                    onPlay={() => setIsPlayingUpload(true)}
                    onPause={() => setIsPlayingUpload(false)}
                    onEnded={() => setIsPlayingUpload(false)}
                  />
                </div>
              )}

              {recordedAudio && (
                <div className="audio-preview">
                  <h3 className="audio-preview-title">Recording Preview</h3>
                  <audio 
                    ref={audioPlayerRef} 
                    controls 
                    className="audio-player"
                    onPlay={() => setIsPlayingRecording(true)}
                    onPause={() => setIsPlayingRecording(false)}
                    onEnded={() => setIsPlayingRecording(false)}
                  />
                </div>
              )}

              {(loading || isProcessing) && (
                <div className="processing-indicator">
                  <div className="spinner"></div>
                  <span>Processing audio with AI...</span>
                </div>
              )}
            </div>

            {/* Transcript & Summary */}
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
                      onClick={exportTranscriptToTxt}
                      className="btn btn-success btn-small"
                    >
                      <Download className="btn-icon" />
                      Export TXT
                    </button>
                  )}
                  {showSummary && (
                    <div className="summary-actions-group">
                      <button
                        onClick={() => setShowPromptInputs(!showPromptInputs)}
                        className="btn btn-secondary btn-small"
                      >
                        {showPromptInputs ? "Hide Prompts" : "Custom Prompts"}
                      </button>
                      <button
                        onClick={exportToPDF}
                        className="btn btn-success btn-small"
                      >
                        <Download className="btn-icon" />
                        Export PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Custom Prompts Section */}
              {showSummary && showPromptInputs && (
                <div className="custom-prompts-section">
                  <div className="prompt-input-group">
                    <label htmlFor="system-prompt">
                      System Prompt (Optional):
                    </label>
                    <textarea
                      id="system-prompt"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="e.g., You are a helpful assistant that summarizes meeting transcripts with focus on technical decisions..."
                      className="prompt-textarea"
                      rows={3}
                    />
                  </div>
                  <div className="prompt-input-group">
                    <label htmlFor="custom-prompt">
                      Custom User Prompt (Optional):
                    </label>
                    <textarea
                      id="custom-prompt"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g., Please summarize this meeting focusing on action items and deadlines..."
                      className="prompt-textarea"
                      rows={3}
                    />
                  </div>
                  <button
                    onClick={() =>
                      selectedMeetingId && fetchSummary(selectedMeetingId, true)
                    }
                    className="btn btn-primary btn-small"
                    disabled={!selectedMeetingId}
                  >
                    Regenerate Summary
                  </button>
                </div>
              )}
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
                        <div className="rename-buttons-group">
                          <button
                            onClick={handleRename}
                            className="btn btn-success btn-small"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setIsRenaming(false)}
                            className="btn btn-secondary btn-small"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>
                        <strong>Title:</strong> {summary.meetingTitle}
                        <button
                          onClick={() => {
                            setIsRenaming(true);
                            setNewName(summary.meetingTitle);
                          }}
                          className="btn btn-secondary btn-small rename-btn"
                        >
                          Rename
                        </button>
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
                                defaultValue={entry.speaker ?? "SPEAKER_00"}
                                onBlur={(e) => {
                                  handleSpeakerNameChange(
                                    entry.speaker,
                                    e.target.value,
                                  );
                                  setEditingSpeaker(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleSpeakerNameChange(
                                      entry.speaker,
                                      e.target.value,
                                    );
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
                            <div className="speaker-container">
                              <span
                                className={`speaker-badge ${getSpeakerColor(entry.speakerId)}`}
                              >
                                {speakerNameMap[entry.speaker] ?? entry.speaker}
                              </span>
                              <button
                                onClick={() => setEditingSpeaker(entry.speaker)}
                                className="btn btn-secondary btn-small rename-speaker-btn"
                              >
                                Rename
                              </button>
                            </div>
                          )}
                          <span className="timestamp">
                            {entry.start}s - {entry.end}s
                          </span>
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
                        className="btn btn-discrete btn-small delete-meeting-btn"
                        onClick={() => handleDeleteMeeting(meeting.uuid)}
                        title="Delete Meeting"
                      >
                        <Trash2 className="btn-icon" />
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
