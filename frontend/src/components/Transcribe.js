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
    // Routes resultant WAV file for download
    const uploadResponse = await fetch('http://localhost:4000/upload', {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error('Upload failed');
    }

    const uploadData = await uploadResponse.json(); // Expects { path: "/path/to/file" }

    // Then: Trigger /jobs with uploaded file info
    const jobsResponse = await fetch('http://localhost:8000/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_path: uploadData.path })  // match new field
    });


    if (!jobsResponse.ok) {
      throw new Error('Job processing failed');
    }

    const resultData = await jobsResponse.json(); // Should be [{ speaker, text }]
    setMessages(resultData);
  } catch (error) {
    console.error('Error uploading or processing audio:', error);
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
