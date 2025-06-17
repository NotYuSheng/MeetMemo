import './App.css';
import { useState, useEffect } from 'react';
import flowerLogo from './resources/flower.svg';

function App() {
  const [fileNames, setFileNames] = useState([]);
  const [transcription, setTranscription] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    fetch("/jobs")
      .then(res => res.json())
      .then(data => setFileNames(data.result))
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
      .then(data => setTranscription(Array.isArray(data.transcription) ? data.transcription : []))
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
            {fileNames.map((filename, idx) => (
              <button key={idx} className={`file-button`}>
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
            <h4>Upload new WAV file</h4>
            <input
              type="file"
              accept="audio/wav"
              onChange={(e) => setSelectedFile(e.target.files[0])}
            />
            <button onClick={uploadFile} disabled={!selectedFile}>
              Upload & Transcribe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
