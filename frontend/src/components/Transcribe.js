import '../styles.css';
import { useState } from 'react';

export default function TextInterface() {
  const [messages, setMessages] = useState([]);
  const [audioFile, setAudioFile] = useState(null);

  const handleAudioUpload = async () => {
    if (!audioFile) {
      alert("Please select a .wav file first.");
      return;
    }

    const formData = new FormData();
    formData.append('file', audioFile);

    try {
      const response = await fetch('http://localhost:8000/jobs', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json(); // Expecting array of { speaker, text }
      setMessages(data);
    } catch (error) {
      console.error('Error uploading audio:', error);
    }
  };

  return (
    <div className="text-interface">
      <h2>Upload Audio File</h2>
      <input
        type="file"
        accept=".wav"
        onChange={(e) => setAudioFile(e.target.files[0])}
      />
      <button onClick={handleAudioUpload}>Send to /jobs</button>

      <div className="transcripts">
        {messages.map((msg, index) => (
          <div key={index} className="message-bubble">
            <strong>{msg.speaker}</strong>: {msg.text}
          </div>
        ))}
      </div>
    </div>
  );
}
