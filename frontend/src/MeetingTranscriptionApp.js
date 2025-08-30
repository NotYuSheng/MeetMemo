import { useState, useRef, useEffect, useCallback } from "react";
import { FileText, Hash } from "lucide-react";
import "./MeetingTranscriptionApp.css";

import Header from "./components/Header";
import AudioControls from "./components/AudioControls";
import TranscriptView from "./components/TranscriptView";
import SummaryView from "./components/SummaryView";
import MeetingsList from "./components/MeetingsList";

import {
  formatSpeakerName,
  getDisplaySpeakerName,
  processTranscriptWithSpeakerIds,
  generateProfessionalFilename
} from "./utils/helpers";

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

const MeetingTranscriptionApp = () => {
  const [transcript, setTranscript] = useState([]);
  const [originalTranscript, setOriginalTranscript] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
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
  const [speakerNameMaps, setSpeakerNameMaps] = useState({});
  const speakerNameMapRef = useRef({});
  const [isPdfLoaded, setIsPdfLoaded] = useState(false);
  const [speakerIdentificationLoading, setSpeakerIdentificationLoading] = useState(false);
  const [speakerSuggestions, setSpeakerSuggestions] = useState(null);
  const [transcriptSaveStatus, setTranscriptSaveStatus] = useState(null);
  const [, setIsSavingTranscript] = useState(false);

  // Debounced transcript saving
  const debounceTimeoutRef = useRef(null);

  const handlePdfLoaded = useCallback((loaded) => {
    setIsPdfLoaded(loaded);
  }, []);

  // Get current meeting's speaker mapping
  const currentSpeakerNameMap = speakerNameMaps[selectedMeetingId] || {};

  useEffect(() => {
    speakerNameMapRef.current = currentSpeakerNameMap;
  }, [currentSpeakerNameMap]);

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

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
    document.documentElement.setAttribute(
      "data-theme",
      !isDarkMode ? "dark" : "light",
    );
  };

  const fetchMeetingList = () => {
    fetch(`${API_BASE_URL}/jobs`)
      .then((res) => res.json())
      .then((data) => {
        const list = Object.entries(data.csv_list).map(([uuid, info]) => ({
          uuid,
          name: info.file_name,
          status_code: info.status_code,
        }));
        setMeetingList(list);
      })
      .catch((err) => console.error("Failed to fetch meeting list", err));
  };

  const pollJobStatus = async (uuid, maxAttempts = 30) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${API_BASE_URL}/jobs/${uuid}/status`);
        const statusData = await response.json();

        if (statusData.status === "completed") {
          // Job completed, fetch transcript
          const transcriptResponse = await fetch(
            `${API_BASE_URL}/jobs/${uuid}/transcript`,
          );
          const transcriptData = await transcriptResponse.json();

          if (transcriptData.full_transcript) {
            const parsed = JSON.parse(transcriptData.full_transcript || "[]");
            const processedTranscript = processTranscriptWithSpeakerIds(parsed);
            setTranscript(processedTranscript);
            setOriginalTranscript(processedTranscript);
            setSelectedMeetingId(uuid);
            fetchSummary(uuid);
            fetchMeetingList();
            identifySpeakers(uuid);
            return true;
          }
        } else if (
          statusData.status === "failed" ||
          statusData.status === "error"
        ) {
          throw new Error(statusData.error_message || "Job failed");
        }

        // Job still processing, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error polling job status:", error);
        throw error;
      }
    }
    throw new Error("Job polling timeout - processing took too long");
  };

  const handleAudioProcessed = async (audioFile) => {
    setIsProcessing(true);
    speakerColorMap.current = {};

    try {
      const formData = new FormData();
      formData.append("file", audioFile);

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        body: formData,
      });

      // Check for HTTP 413 error (Request Entity Too Large)
      if (response.status === 413) {
        throw new Error("File too large. Please upload a file smaller than 100MB.");
      }
      
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const data = await response.json();

      // Check if the response indicates success and has expected data
      if (data.error || (!data.uuid && !data.transcript)) {
        throw new Error(data.error || "Invalid response from server");
      }

      // If we get a transcript immediately, use it
      if (data.transcript && Array.isArray(data.transcript)) {
        const processedTranscript = processTranscriptWithSpeakerIds(data.transcript);
        setTranscript(processedTranscript);
        setOriginalTranscript(processedTranscript);
        setSelectedMeetingId(data.uuid);
        fetchSummary(data.uuid);
        fetchMeetingList();
        identifySpeakers(data.uuid);
      } else if (data.uuid) {
        // Otherwise, poll for status
        await pollJobStatus(data.uuid);
      } else {
        throw new Error("No transcript or job ID returned");
      }
    } catch (err) {
      console.error("Failed to process audio:", err);
      alert(`Failed to process audio: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const loadPastMeeting = (uuid) => {
    setTranscript([]);
    setOriginalTranscript([]);
    setSummary(null);
    setSelectedMeetingId(uuid);
    speakerColorMap.current = {};
    setTranscriptSaveStatus(null);
    setSummaryLoading(true);

    fetch(`${API_BASE_URL}/jobs/${uuid}/transcript`)
      .then((res) => res.json())
      .then((data) => {
        const parsed = JSON.parse(data.full_transcript || "[]");
        const processedTranscript = processTranscriptWithSpeakerIds(parsed);
        setTranscript(processedTranscript);
        setOriginalTranscript(processedTranscript);
        setSummary({
          meetingTitle: data.file_name || `Meeting ${uuid}`,
        });
        identifySpeakers(uuid);
      })
      .catch((err) => console.error("Failed to load past meeting", err))
      .finally(() => setSummaryLoading(false));
  };

  const fetchSummary = (uuid, forceRegenerate = false) => {
    setSummaryLoading(true);

    const generateSummary = () => {
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

      if (Object.keys(requestBody).length > 0) {
        requestOptions.body = JSON.stringify(requestBody);
      }

      fetch(`${API_BASE_URL}/jobs/${uuid}/summarise`, requestOptions)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.fileName) {
            setSummary({
              meetingTitle: data.fileName,
              summary: data.summary || null,
            });
          }
        })
        .catch((err) => console.error("Failed to fetch summary", err))
        .finally(() => setSummaryLoading(false));
    };

    if (forceRegenerate) {
      fetch(`${API_BASE_URL}/jobs/${uuid}/summary`, {
        method: "DELETE",
      })
        .then(() => generateSummary())
        .catch(() => generateSummary());
    } else {
      generateSummary();
    }
  };

  const identifySpeakers = (uuid, context = "") => {
    setSpeakerIdentificationLoading(true);
    setSpeakerSuggestions(null);

    const requestBody = context.trim() ? { context: context.trim() } : {};

    fetch(`${API_BASE_URL}/jobs/${uuid}/identify-speakers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success" && data.suggestions) {
          const filteredSuggestions = Object.fromEntries(
            Object.entries(data.suggestions).filter(([, suggestion]) => 
              suggestion && suggestion !== "Cannot be determined" && !suggestion.toLowerCase().includes("cannot be determined")
            )
          );
          setSpeakerSuggestions(filteredSuggestions);
          console.log("Speaker identification suggestions (filtered):", filteredSuggestions);
        } else {
          console.error("Speaker identification failed:", data.error || "Unknown error");
        }
      })
      .catch((err) => {
        console.error("Failed to identify speakers:", err);
      })
      .finally(() => {
        setSpeakerIdentificationLoading(false);
      });
  };

  const handleSpeakerNameChange = (originalSpeaker, newName) => {
    if (!newName) return;
    
    setTranscript((prevTranscript) =>
      prevTranscript.map((entry) =>
        entry.originalSpeaker === originalSpeaker ? { ...entry, speaker: newName } : entry,
      ),
    );
    
    const updatedMapping = {
      ...currentSpeakerNameMap,
      [originalSpeaker]: newName,
    };
    
    setSpeakerNameMaps(prev => ({
      ...prev,
      [selectedMeetingId]: updatedMapping
    }));
    
    handleSubmitSpeakerNames(updatedMapping);
  };

  const handleSubmitSpeakerNames = (mappingOverride = null) => {
    if (!selectedMeetingId) return;
    
    const currentSpeakerNameMap = mappingOverride || speakerNameMapRef.current;

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
        setSummary(prev => prev ? { ...prev, summary: null } : null);
        if (summary) {
          fetchSummary(selectedMeetingId, true);
        }
      })
      .catch((err) => {
        console.error("Failed to save speaker names:", err);
        alert("An error occurred while saving the new names.");
      });
  };

  const saveTranscriptToServer = useCallback(async (updatedTranscript) => {
    if (!selectedMeetingId) return;
    
    setIsSavingTranscript(true);
    setTranscriptSaveStatus('saving');
    
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${selectedMeetingId}/transcript`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: updatedTranscript })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save transcript');
      }
      
      setTranscriptSaveStatus('saved');
      setTimeout(() => setTranscriptSaveStatus(null), 2000);
    } catch (error) {
      console.error('Error saving transcript:', error);
      setTranscriptSaveStatus('error');
      setTimeout(() => setTranscriptSaveStatus(null), 3000);
    } finally {
      setIsSavingTranscript(false);
    }
  }, [selectedMeetingId]);

  const debouncedSaveTranscript = useCallback((updatedTranscript) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      saveTranscriptToServer(updatedTranscript);
    }, 1000);
  }, [saveTranscriptToServer]);

  const handleTranscriptTextChange = (entryId, newText) => {
    const updatedTranscript = transcript.map(entry => 
      entry.id === entryId ? { ...entry, text: newText } : entry
    );
    
    setTranscript(updatedTranscript);
    debouncedSaveTranscript(updatedTranscript);
  };

  const applySpeakerSuggestion = (originalSpeaker, suggestedName) => {
    if (!selectedMeetingId || !suggestedName) return;
    
    handleSpeakerNameChange(originalSpeaker, suggestedName);
    setSpeakerSuggestions(prev => {
      const updated = { ...prev };
      delete updated[formatSpeakerName(originalSpeaker)];
      return Object.keys(updated).length > 0 ? updated : null;
    });
  };

  const dismissSpeakerSuggestion = (speakerName) => {
    setSpeakerSuggestions(prev => {
      const updated = { ...prev };
      delete updated[speakerName];
      return Object.keys(updated).length > 0 ? updated : null;
    });
  };

  const resetTranscriptEdits = () => {
    if (!originalTranscript.length) return;
    
    if (window.confirm("Are you sure you want to reset all transcript edits? This will revert all text changes back to the original.")) {
      setTranscript([...originalTranscript]);
      console.log("Reset transcript to original version");
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
          setOriginalTranscript([]);
          setSummary(null);
          setSelectedMeetingId(null);
        }
      })
      .catch((err) => console.error("Delete failed:", err));
  };

  const handleRename = (newName) => {
    if (!selectedMeetingId) return;

    fetch(
      `${API_BASE_URL}/jobs/${selectedMeetingId}/rename?new_name=${newName}`,
      { method: "PATCH" },
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setSummary((prev) => ({ ...prev, meetingTitle: data.new_name }));
          fetchMeetingList();
        }
      })
      .catch((err) => console.error("Failed to rename meeting", err));
  };

  const exportTranscriptToJson = () => {
    if (transcript.length === 0) return;
    
    const transcriptData = transcript.map((entry) => ({
      speaker: getDisplaySpeakerName(entry.speaker, entry.originalSpeaker, currentSpeakerNameMap),
      text: entry.text,
      start: entry.start,
      end: entry.end,
      speakerId: entry.speakerId
    }));

    const jsonContent = JSON.stringify({
      filename: summary?.meetingTitle || "Meeting Transcript",
      transcript: transcriptData,
      exportedAt: new Date().toISOString()
    }, null, 2);

    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = generateProfessionalFilename(summary?.meetingTitle, 'json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportSummaryToMarkdown = async () => {
    if (!summary || !summary.meetingTitle || !selectedMeetingId) return;
    
    try {
      const currentTime = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
      
      const response = await fetch(`${API_BASE_URL}/jobs/${selectedMeetingId}/markdown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          generated_on: currentTime
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to generate markdown: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = generateProfessionalFilename(summary.meetingTitle, 'md');
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Failed to export markdown:', error);
      alert(`Failed to export markdown: ${error.message}`);
    }
  };

  const exportToPDF = async () => {
    if (!summary || !selectedMeetingId) return;
    
    try {
      const currentTime = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
      
      const response = await fetch(`${API_BASE_URL}/jobs/${selectedMeetingId}/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          generated_on: currentTime
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to generate PDF: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = generateProfessionalFilename(summary.meetingTitle, 'pdf');
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert(`Failed to export PDF: ${error.message}`);
    }
  };

  // Initialize theme
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

  // Load meeting list on mount
  useEffect(() => {
    fetchMeetingList();
  }, []);

  return (
    <div className={`app-container ${isPdfLoaded ? 'pdf-expanded' : ''}`}>
      <div className="max-width-container">
        <Header isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />

        <div className="main-grid">
          {/* Left Column */}
          <div className="left-column">
            <AudioControls 
              onAudioProcessed={handleAudioProcessed}
              isProcessing={isProcessing}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />

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
              </div>

              {showSummary ? (
                <SummaryView 
                  summary={summary}
                  summaryLoading={summaryLoading}
                  selectedMeetingId={selectedMeetingId}
                  customPrompt={customPrompt}
                  systemPrompt={systemPrompt}
                  showPromptInputs={showPromptInputs}
                  onCustomPromptChange={setCustomPrompt}
                  onSystemPromptChange={setSystemPrompt}
                  onTogglePromptInputs={() => setShowPromptInputs(!showPromptInputs)}
                  onRegenerateSummary={(uuid) => fetchSummary(uuid, true)}
                  onExportMarkdown={exportSummaryToMarkdown}
                  onExportPDF={exportToPDF}
                  onRename={handleRename}
                  isPdfLoaded={isPdfLoaded}
                  onPdfLoaded={handlePdfLoaded}
                />
              ) : (
                <TranscriptView
                  transcript={transcript}
                  originalTranscript={originalTranscript}
                  selectedMeetingId={selectedMeetingId}
                  speakerNameMaps={speakerNameMaps}
                  speakerSuggestions={speakerSuggestions}
                  speakerIdentificationLoading={speakerIdentificationLoading}
                  transcriptSaveStatus={transcriptSaveStatus}
                  currentSpeakerNameMap={currentSpeakerNameMap}
                  onSpeakerNameChange={handleSpeakerNameChange}
                  onTranscriptTextChange={handleTranscriptTextChange}
                  onIdentifySpeakers={identifySpeakers}
                  onExportTranscript={exportTranscriptToJson}
                  onResetTranscript={resetTranscriptEdits}
                  onApplySpeakerSuggestion={applySpeakerSuggestion}
                  onDismissSpeakerSuggestion={dismissSpeakerSuggestion}
                  getSpeakerColor={getSpeakerColor}
                  formatSpeakerName={formatSpeakerName}
                  getDisplaySpeakerName={getDisplaySpeakerName}
                />
              )}
            </div>
          </div>

          {/* Right Column – Past Meetings */}
          <div className="right-column">
            <MeetingsList 
              meetingList={meetingList}
              selectedMeetingId={selectedMeetingId}
              onMeetingSelect={loadPastMeeting}
              onMeetingDelete={handleDeleteMeeting}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingTranscriptionApp;