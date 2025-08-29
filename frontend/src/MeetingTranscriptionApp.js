import { useState, useRef, useEffect, useCallback } from "react";
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
  Trash2,
  Clock,
  AlertCircle,
  RefreshCw,
  Edit,
  RotateCcw,
} from "lucide-react";
import "./MeetingTranscriptionApp.css";

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

// Generate a UUID4-like string for client-side use
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const formatSpeakerName = (speakerName) => {
  if (!speakerName) return "Speaker 1";
  
  // Convert SPEAKER_XX format to "Speaker X" format
  const match = speakerName.match(/^SPEAKER_(\d+)$/);
  if (match) {
    const speakerNumber = parseInt(match[1], 10) + 1; // Convert 0-based to 1-based
    return `Speaker ${speakerNumber}`;
  }
  
  // Return the original name if it doesn't match the SPEAKER_XX pattern
  return speakerName;
};

const getDisplaySpeakerName = (currentSpeaker, originalSpeaker, speakerNameMap) => {
  // Manual renames take priority over automatic formatting
  // Use originalSpeaker as the key for lookups, but fall back to currentSpeaker for display
  return speakerNameMap[originalSpeaker] ?? formatSpeakerName(currentSpeaker);
};

const processTranscriptWithSpeakerIds = (transcriptData) => {
  const speakerMap = {};
  let speakerCounter = 1;
  return transcriptData.map((entry) => {
    const speaker = entry.speaker ?? "SPEAKER_00";
    if (!speakerMap[speaker]) {
      speakerMap[speaker] = speakerCounter++;
    }
    return {
      id: generateUUID(),
      speaker: speaker,
      originalSpeaker: speaker, // Track original speaker ID for mapping
      speakerId: speakerMap[speaker],
      text: entry.text,
      start: entry.start,
      end: entry.end,
    };
  });
};

// Simple PDF viewer component
const PDFViewer = ({ selectedMeetingId, onPdfLoaded }) => {
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedMeetingId) {
      setPdfBlobUrl(null);
      if (onPdfLoaded) onPdfLoaded(false);
      return;
    }

    const fetchPdfBlob = async () => {
      setIsLoading(true);
      setError(null);
      
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
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(blobUrl);
        if (onPdfLoaded) onPdfLoaded(true);
      } catch (err) {
        console.error('Error fetching PDF:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPdfBlob();

    // Cleanup function for when component unmounts or selectedMeetingId changes
    return () => {
      // This cleanup will run on next effect or unmount
      setPdfBlobUrl((prevUrl) => {
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl);
        }
        return null;
      });
    };
  }, [selectedMeetingId, onPdfLoaded]);

  if (!selectedMeetingId) {
    return (
      <div className="empty-state">
        <Hash className="empty-icon" />
        <p className="empty-title">No PDF available</p>
        <p className="empty-subtitle">PDF will be generated after processing audio</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="pdf-loading-state">
        <div className="spinner"></div>
        <p>Loading PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pdf-error-state">
        <AlertCircle className="empty-icon" />
        <p className="empty-title">Failed to load PDF</p>
        <p className="empty-subtitle">{error}</p>
      </div>
    );
  }

  if (!pdfBlobUrl) {
    return (
      <div className="empty-state">
        <Hash className="empty-icon" />
        <p className="empty-title">No PDF available</p>
        <p className="empty-subtitle">PDF will be generated after processing audio</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer-container">
      <iframe
        src={pdfBlobUrl}
        className="pdf-viewer"
        title="Meeting Summary PDF"
        width="100%"
        style={{ border: 'none', borderRadius: '8px' }}
      />
    </div>
  );
};


const MeetingTranscriptionApp = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
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
  const [speakerNameMaps, setSpeakerNameMaps] = useState({}); // Per-meeting mapping
  const speakerNameMapRef = useRef({});
  const [isPdfLoaded, setIsPdfLoaded] = useState(false);
  
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
  const [editingSpeaker, setEditingSpeaker] = useState(null);
  const [, setIsSavingNames] = useState(false);
  const [speakerIdentificationLoading, setSpeakerIdentificationLoading] = useState(false);
  const [speakerSuggestions, setSpeakerSuggestions] = useState(null);
  const [originalTranscript, setOriginalTranscript] = useState([]); // Store original transcript for reset functionality
  const [editingTranscriptEntry, setEditingTranscriptEntry] = useState(null);
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [transcriptSaveStatus, setTranscriptSaveStatus] = useState(null);

  const truncateFileName = (name, maxLength = 35) => {
    if (!name) return "";
    return name.length > maxLength
      ? name.slice(0, maxLength).trim() + "..."
      : name;
  };

  const handleSpeakerNameChange = (originalSpeaker, newName) => {
    if (!newName) return;
    
    // Update transcript entries that match this original speaker
    setTranscript((prevTranscript) =>
      prevTranscript.map((entry) =>
        entry.originalSpeaker === originalSpeaker ? { ...entry, speaker: newName } : entry,
      ),
    );
    
    // Create updated mapping for current meeting
    const updatedMapping = {
      ...currentSpeakerNameMap,
      [originalSpeaker]: newName,
    };
    
    // Update state for current meeting only
    setSpeakerNameMaps(prev => ({
      ...prev,
      [selectedMeetingId]: updatedMapping
    }));
    
    // Submit with the updated mapping immediately
    handleSubmitSpeakerNames(updatedMapping);
  };

  const handleSubmitSpeakerNames = (mappingOverride = null) => {
    if (!selectedMeetingId) {
      alert("No meeting is selected.");
      return;
    }
    setIsSavingNames(true);
    const currentSpeakerNameMap = mappingOverride || speakerNameMapRef.current;
    console.log("Submitting speaker mapping:", currentSpeakerNameMap);

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
        // Clear current summary and regenerate with updated speaker names
        setSummary(prev => prev ? { ...prev, summary: null } : null);
        
        // Always regenerate summary if one exists, to reflect updated speaker names
        if (summary) {
          fetchSummary(selectedMeetingId, true);
        }
      })
      .catch((err) => {
        console.error("Failed to save speaker names:", err);
        alert("An error occurred while saving the new names.");
      })
      .finally(() => {
        setIsSavingNames(false);
      });
  };

  // Debounced function to save transcript changes
  const debounceTimeoutRef = useRef(null);
  
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
    }, 1000); // 1 second delay
  }, [saveTranscriptToServer]);

  const handleTranscriptTextChange = (entryId, newText) => {
    const updatedTranscript = transcript.map(entry => 
      entry.id === entryId ? { ...entry, text: newText } : entry
    );
    
    setTranscript(updatedTranscript);
    debouncedSaveTranscript(updatedTranscript);
  };

  const toggleTextEditing = (entryId) => {
    setEditingTranscriptEntry(
      editingTranscriptEntry === entryId ? null : entryId
    );
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
    setOriginalTranscript([]); // Clear original transcript too
    setSummary(null);
    setSelectedMeetingId(uuid);
    speakerColorMap.current = {};
    setEditingSpeaker(null); // Clear any active speaker editing
    setEditingTranscriptEntry(null); // Clear any active transcript editing
    setTranscriptSaveStatus(null); // Clear any save status
    setSummaryLoading(true);

    fetch(`${API_BASE_URL}/jobs/${uuid}/transcript`)
      .then((res) => res.json())
      .then((data) => {
        const parsed = JSON.parse(data.full_transcript || "[]");
        const processedTranscript = processTranscriptWithSpeakerIds(parsed);
        setTranscript(processedTranscript);
        setOriginalTranscript(processedTranscript); // Store original for reset functionality
        setSummary({
          meetingTitle: data.file_name || `Meeting ${uuid}`,
        });
        // Auto-run speaker identification for loaded meetings
        identifySpeakers(uuid);
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
          setSummary((prev) => ({ ...prev, meetingTitle: data.new_name }));
          fetchMeetingList();
          setIsRenaming(false);
        }
      })
      .catch((err) => console.error("Failed to rename meeting", err));
  };

  const startRecording = async () => {
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia is not supported in this browser. Please use a modern browser or enable microphone permissions.");
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
      
      if (error.name === "NotAllowedError") {
        errorMessage += "Please allow microphone access in your browser settings and try again.";
      } else if (error.name === "NotFoundError") {
        errorMessage += "No microphone found. Please connect a microphone and try again.";
      } else if (error.name === "NotSupportedError") {
        errorMessage += "Your browser doesn't support audio recording. Please use Chrome, Firefox, or Safari.";
      } else if (error.name === "NotReadableError") {
        errorMessage += "Microphone is already in use by another application.";
      } else if (error.message.includes("getUserMedia")) {
        errorMessage += "Please use HTTPS or localhost to access the microphone.";
      } else {
        errorMessage += error.message;
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
      fileInputRef.current.value = "";
    }
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
            setOriginalTranscript(processedTranscript); // Store original for reset functionality
            setSelectedMeetingId(uuid);
            fetchSummary(uuid);
            fetchMeetingList();
            // Auto-run speaker identification for new transcripts
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
        setOriginalTranscript(processedTranscript); // Store original for reset functionality
        setSelectedMeetingId(data.uuid);
        fetchSummary(data.uuid);
        fetchMeetingList();
      } else if (data.uuid) {
        // Otherwise, poll for status
        await pollJobStatus(data.uuid);
      } else {
        throw new Error("No transcript or job ID returned");
      }
      
      // Auto-run speaker identification for uploaded files  
      if (data.uuid) {
        identifySpeakers(data.uuid);
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

      // Check for HTTP 413 error (Request Entity Too Large)
      if (response.status === 413) {
        throw new Error("Recording too large. Please record a shorter audio clip or upload a smaller file.");
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
        setOriginalTranscript(processedTranscript); // Store original for reset functionality
        setSelectedMeetingId(data.uuid);
        fetchSummary(data.uuid);
        fetchMeetingList();
        // Auto-run speaker identification for recorded audio
        identifySpeakers(data.uuid);
      } else if (data.uuid) {
        // Otherwise, poll for status
        await pollJobStatus(data.uuid);
      } else {
        throw new Error("No transcript or job ID returned");
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
          status_code: info.status_code,
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
          if (data && data.fileName) {
            setSummary({
              meetingTitle: data.fileName,
              summary: data.summary || null, // Include the actual summary content
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
          // Filter out "Cannot be determined" suggestions
          const filteredSuggestions = Object.fromEntries(
            Object.entries(data.suggestions).filter(([, suggestion]) => 
              suggestion && suggestion !== "Cannot be determined" && !suggestion.toLowerCase().includes("cannot be determined")
            )
          );
          setSpeakerSuggestions(filteredSuggestions);
          console.log("Speaker identification suggestions (filtered):", filteredSuggestions);
          
          // Show message if no confident suggestions were made
          if (Object.keys(filteredSuggestions).length === 0) {
            console.log("No confident speaker identifications could be made");
            // Could optionally show a subtle message to user here
          }
        } else {
          console.error("Speaker identification failed:", data.error || "Unknown error");
          alert(`Speaker identification failed: ${data.error || "Unknown error"}`);
        }
      })
      .catch((err) => {
        console.error("Failed to identify speakers:", err);
        alert("An error occurred while identifying speakers. Please try again.");
      })
      .finally(() => {
        setSpeakerIdentificationLoading(false);
      });
  };

  const applySpeakerSuggestion = (originalSpeaker, suggestedName) => {
    if (!selectedMeetingId || !suggestedName) return;
    
    handleSpeakerNameChange(originalSpeaker, suggestedName);
    // Remove the suggestion after applying it
    setSpeakerSuggestions(prev => {
      const updated = { ...prev };
      delete updated[formatSpeakerName(originalSpeaker)];
      return Object.keys(updated).length > 0 ? updated : null;
    });
  };

  const handleTranscriptTextEdit = (entryId, newText) => {
    if (!selectedMeetingId || !newText.trim()) return;
    
    // Update local transcript immediately for responsive UI
    setTranscript(prevTranscript =>
      prevTranscript.map(entry =>
        entry.id === entryId
          ? { ...entry, text: newText.trim() }
          : entry
      )
    );
    
    // TODO: In a real implementation, you might want to save these edits to the backend
    // For now, changes are only local and will be lost on page reload
    console.log(`Updated transcript entry ${entryId}:`, newText.trim());
  };

  const resetTranscriptEdits = () => {
    if (!originalTranscript.length) return;
    
    if (window.confirm("Are you sure you want to reset all transcript edits? This will revert all text changes back to the original.")) {
      setTranscript([...originalTranscript]); // Reset to original transcript
      setEditingTranscriptEntry(null); // Clear any active editing
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
          setOriginalTranscript([]); // Clear original transcript too
          setSummary(null);
          setSelectedMeetingId(null);
          setEditingTranscriptEntry(null); // Clear any active text editing
        }
      })
      .catch((err) => console.error("Delete failed:", err));
  };

  const exportToPDF = async () => {
    if (!summary || !selectedMeetingId) return;
    
    console.log('🔧 Using ReportLab PDF export via backend endpoint');
    
    try {
      // Call backend ReportLab PDF generation endpoint
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
      
      // Get the PDF blob and trigger download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Create download link and trigger download
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename from response headers or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'meetmemo-summary.pdf';
      
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
    link.download = "meeting-transcript.json";
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
      
      // Get the markdown blob and trigger download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Create download link and trigger download
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename from response headers or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'meeting-summary.md';
      
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
          status_code: info.status_code,
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
    <div className={`app-container ${isPdfLoaded ? 'pdf-expanded' : ''}`}>
      <div className="max-width-container">
        {/* Header */}
        <div className="header-card">
          <h1 className="header-title">
            <img src="/logo.png" alt="MeetMemo Logo" className="header-logo" />{" "}
            MeetMemo
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
                        title={
                          isPaused ? "Resume Recording" : "Pause Recording"
                        }
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
                    {(selectedFile || recordedAudio) && !loading
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
                onChange={(e) => setSelectedFile(e.target.files[0])}
                className="file-input"
              />

              {selectedFile && (
                <div className="audio-preview">
                  <h3 className="audio-preview-title">
                    Upload Preview - {selectedFile.name}
                  </h3>
                  <audio
                    ref={uploadPlayerRef}
                    controls
                    className="audio-player"
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
                    <>
                      <button
                        onClick={() => selectedMeetingId && identifySpeakers(selectedMeetingId)}
                        className="btn btn-primary btn-small"
                        disabled={!selectedMeetingId || speakerIdentificationLoading}
                      >
                        <RefreshCw className={`btn-icon ${speakerIdentificationLoading ? 'spinning' : ''}`} />
                        {speakerIdentificationLoading ? "Refreshing..." : "Refresh Speaker"}
                      </button>
                      <button
                        onClick={resetTranscriptEdits}
                        className="btn btn-warning btn-small"
                        disabled={!originalTranscript.length || originalTranscript.length === 0}
                        title="Reset all transcript edits to original"
                      >
                        <RotateCcw className="btn-icon" />
                        Reset Edits
                      </button>
                      <button
                        onClick={exportTranscriptToJson}
                        className="btn btn-success btn-small"
                      >
                        <Download className="btn-icon" />
                        Export JSON
                      </button>
                    </>
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
                        onClick={exportSummaryToMarkdown}
                        className="btn btn-success btn-small"
                      >
                        <Download className="btn-icon" />
                        Export Markdown
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
                ) : summary && summary.meetingTitle ? (
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
                        <strong>File Name:</strong> {summary.meetingTitle}
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
                    <div className="summary-pdf">
                      <PDFViewer 
                        selectedMeetingId={selectedMeetingId} 
                        onPdfLoaded={handlePdfLoaded}
                      />
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
                  {transcriptSaveStatus && (
                    <div className={`save-status save-status-${transcriptSaveStatus}`}>
                      {transcriptSaveStatus === 'saving' && 'Saving changes...'}
                      {transcriptSaveStatus === 'saved' && '✓ Changes saved'}
                      {transcriptSaveStatus === 'error' && '⚠ Error saving changes'}
                    </div>
                  )}
                  {transcript.length > 0 ? (
                    transcript.map((entry) => (
                      <div key={entry.id} className="transcript-entry">
                        <div className="transcript-header">
                          {editingSpeaker === entry.originalSpeaker ? (
                            <div className="speaker-edit-container">
                              <input
                                type="text"
                                defaultValue={formatSpeakerName(entry.speaker ?? "SPEAKER_00")}
                                onBlur={(e) => {
                                  handleSpeakerNameChange(
                                    entry.originalSpeaker,
                                    e.target.value,
                                  );
                                  setEditingSpeaker(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleSpeakerNameChange(
                                      entry.originalSpeaker,
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
                              <div className="speaker-name-row">
                                <span
                                  className={`speaker-badge ${getSpeakerColor(entry.speakerId)}`}
                                >
                                  {getDisplaySpeakerName(entry.speaker, entry.originalSpeaker, currentSpeakerNameMap)}
                                </span>
                                <button
                                  onClick={() => setEditingSpeaker(entry.originalSpeaker)}
                                  className="btn btn-secondary btn-small rename-speaker-btn"
                                >
                                  Rename
                                </button>
                              </div>
                              {/* Speaker Suggestion */}
                              {speakerSuggestions && 
                               speakerSuggestions[formatSpeakerName(entry.speaker)] && 
                               speakerSuggestions[formatSpeakerName(entry.speaker)] !== "Cannot be determined" &&
                               !speakerSuggestions[formatSpeakerName(entry.speaker)].toLowerCase().includes("cannot be determined") && (
                                <div className="speaker-suggestion">
                                  <span className="suggestion-text">
                                    AI suggests: {speakerSuggestions[formatSpeakerName(entry.speaker)]}
                                  </span>
                                  <button
                                    onClick={() => applySpeakerSuggestion(entry.originalSpeaker, speakerSuggestions[formatSpeakerName(entry.speaker)])}
                                    className="btn btn-success btn-small apply-suggestion-btn"
                                  >
                                    Apply
                                  </button>
                                  <button
                                    onClick={() => setSpeakerSuggestions(prev => {
                                      const updated = { ...prev };
                                      delete updated[formatSpeakerName(entry.speaker)];
                                      return Object.keys(updated).length > 0 ? updated : null;
                                    })}
                                    className="btn btn-secondary btn-small dismiss-suggestion-btn"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          <span className="timestamp">
                            {entry.start}s - {entry.end}s
                          </span>
                        </div>
                        <div className="transcript-content">
                          {editingTranscriptEntry === entry.id ? (
                            <div
                              className="transcript-text editable"
                              contentEditable
                              suppressContentEditableWarning={true}
                              autoFocus
                              onBlur={(e) => {
                                const newText = e.target.textContent;
                                handleTranscriptTextChange(entry.id, newText);
                                setEditingTranscriptEntry(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  const newText = e.target.textContent;
                                  handleTranscriptTextChange(entry.id, newText);
                                  setEditingTranscriptEntry(null);
                                } else if (e.key === 'Escape') {
                                  e.target.textContent = entry.text; // Restore original text
                                  setEditingTranscriptEntry(null);
                                }
                              }}
                              dangerouslySetInnerHTML={{ __html: entry.text }}
                            />
                          ) : (
                            <p 
                              className="transcript-text clickable"
                              onClick={() => toggleTextEditing(entry.id)}
                              title="Click to edit transcript text"
                            >
                              {entry.text}
                            </p>
                          )}
                        </div>
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
                  // Create gradient pattern: 1-2-3-4-3-2-1-2-3-4-3-2...
                  const pattern = [1, 2, 3, 4, 3, 2];
                  const colorClass = `btn-past-${pattern[index % pattern.length]}`;
                  const isProcessing = meeting.status_code === "202";
                  const hasError = meeting.status_code === "500";
                  
                  return (
                    <div key={meeting.uuid} className="meeting-entry">
                      <button
                        className={`space btn btn-small ${colorClass} ${
                          selectedMeetingId === meeting.uuid ? "btn-active" : ""
                        } ${isProcessing ? "btn-disabled" : ""}`}
                        onClick={() => {
                          if (!isProcessing) {
                            loadPastMeeting(meeting.uuid);
                          }
                        }}
                        disabled={isProcessing}
                        title={isProcessing ? "This file is still processing" : ""}
                      >
                        {truncateFileName(meeting.name)}
                        {isProcessing && <Clock className="btn-icon status-icon" />}
                        {hasError && <AlertCircle className="btn-icon status-icon error-icon" />}
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
