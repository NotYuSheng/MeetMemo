import './App.css';
import { useState, useEffect } from 'react';
import flowerLogo from './resources/flower.svg';

function Home() {
  const [fileNames, setFileNames] = useState([]);
  const [transcription, setTranscription] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);

  const startRecording = async () => {
    setSummary("");
    setTranscription([]);
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      setRecordedChunks([]);

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          setRecordedChunks(prev => [...prev, event.data]);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: "audio/wav" });
        const formData = new FormData();
        formData.append("file", blob, "recorded_audio.wav");

        fetch("/jobs", {
          method: "POST",
          body: formData,
        })
          .then(res => res.json())
          .then(data => {
            setTranscription(Array.isArray(data.transcript) ? data.transcript : []);
            setLoading(false);
            if (data.uuid) summarizeTranscript(data.uuid);
          })
          .catch(err => {
            console.error("Failed to transcribe recorded audio:", err);
            setLoading(false);
          });
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setLoading(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const summarizeTranscript = async (uuid) => {
    if (!uuid) return;

    setIsSummarizing(true);
    setSummary("");

    try {
      const res = await fetch(`/jobs/${uuid}/summarise`, { method: "POST" });
      const data = await res.json();
      if (data.summary) {
        setSummary(data.summary);
      } else {
        setSummary("No summary available.");
      }
    } catch (err) {
      console.error("Failed to summarize transcript:", err);
      setSummary("An error occurred while summarizing.");
    } finally {
      setIsSummarizing(false);
    }
  };

  useEffect(() => {
    fetch("/jobs")
      .then(res => res.json())
      .then(data => {
        console.log("Data from /jobs:", data);
        if (data.csv_list && typeof data.csv_list === "object") {
            setFileNames(data.csv_list);
        } else {
            setFileNames({});
        }
        })
      .catch(err => console.error("Failed to fetch file names:", err));
  }, []);

  const deleteFile = (uuid) => {
    if (!window.confirm("Are you sure you want to delete this transcription?")) return;

    fetch(`/jobs/${uuid}`, {
      method: "DELETE",
    })
      .then(res => res.json())
      .then(data => {
        console.log("Deleted:", data);
        // Remove from UI
        setFileNames(prev => {
          const updated = { ...prev };
          delete updated[uuid];
          return updated;
        });
      })
      .catch(err => console.error("Failed to delete file:", err));
  };

  const uploadFile = () => {
    if (!selectedFile) return;

    setLoading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    fetch("/jobs", {
      method: "POST",
      body: formData,
    })
      .then(res => res.json())
      .then(data => {
      setTranscription(Array.isArray(data.transcript) ? data.transcript : []);
      setLoading(false);
      if (data.uuid) summarizeTranscript(data.uuid);
    })

      .catch(err => {
        console.error("Failed to fetch transcription:", err);
        setLoading(false);
      });
  };

  return (
    <div className="App">
      <header className="App-header">
        <img src={flowerLogo} alt="logo" className='App-logo'/> Meet Memo
      </header>

      <div className="main-content">
        {/* Left Section: Past Transcriptions */}
        <div className="left-panel">
          <h3>Past transcriptions:</h3>
          <div className="file-button-container">
            {Object.entries(fileNames).map(([uuid, filename], idx) => (
              <div key={idx} className="file-entry">
                <button
                  className="file-button"
                  onClick={() => window.location.href = `/file/${uuid}`}
                >
                  {filename}
                </button>
                <button
                  className="delete-button"
                  onClick={() => deleteFile(uuid)}
                  title="Delete this file"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right Section: Current Transcription */}
        <div className="right-panel">
            <h3>Current transcription</h3>
            {loading && <div className="loading-indicator">Transcribing... Please wait.</div>}
            <div className="transcription-container">
                {transcription.map((entry, idx) => {
                const [speaker, utterance] = Object.entries(entry)[0];
                return (
                    <div key={idx} className={`message-bubble ${idx % 2 === 0 ? 'speaker-1' : 'speaker-2'}`}>
                    <strong>{speaker}:</strong> {utterance}
                    </div>
                );
                })}
            </div>
            {isSummarizing && (
              <div className="loading-indicator">Summarizing... Please wait.</div>
            )}

            {summary && !isSummarizing && (
              <div className="summary-output">
                <h4>Meeting Summary:</h4>
                <p>{summary}</p>
              </div>
            )}

            <div className="upload-section">
                <h4 className="upload-title">Upload new WAV file</h4>
            
                <div className="upload-form">
                    <input
                    type="file"
                    accept="audio/wav"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    className="file-input"
                    />
                    <button
                    onClick={uploadFile}
                    disabled={!selectedFile}
                    className={`upload-button ${selectedFile ? 'active' : ''}`}
                    >
                        Upload & Transcribe
                    </button>
                </div>

              <div className="record-section">
                <h4 className="upload-title">Or record directly</h4>
                <div className="record-controls">
                  {!isRecording ? (
                    <button onClick={startRecording} className="record-button">
                      🎤 Start Recording
                    </button>
                  ) : (
                    <button onClick={stopRecording} className="stop-button">
                      ⏹️ Stop Recording
                    </button>
                  )}
                </div>
              </div>

            </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
