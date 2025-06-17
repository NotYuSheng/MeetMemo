import './App.css';
import { useState, useEffect } from 'react';
import flowerLogo from './resources/flower.svg';

function Home() {
  const [fileNames, setFileNames] = useState([]);
  const [transcription, setTranscription] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

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

  const uploadFile = () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    fetch("/jobs", {
      method: "POST",
      body: formData,
    })
      .then(res => res.json())
      .then(data => setTranscription(Array.isArray(data.transcript) ? data.transcript : []))
      .catch(err => console.error("Failed to fetch transcription:", err));
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
            <button
                key={idx}
                className="file-button"
                onClick={() => window.location.href = `/file/${uuid}`}
            >
                {filename}
            </button>
            ))}
          </div>
        </div>

        {/* Right Section: Current Transcription */}
        <div className="right-panel">
            <h3>Current transcription</h3>
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
            </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
