import "../styles.css";
import { useState } from "react";

export default function TextInterface() {
  const [messages, setMessages] = useState([]);
  const [audioFile, setAudioFile] = useState(null);

  async function handleAudioUpload() {
    try {
      const formData = new FormData();
      formData.append("file", audioFile);
      const response = await fetch("http://localhost:8000/jobs", {
        method: "POST",
        body: formData, // multipart/form-data with the audio file
      });

      if (!response.ok) {
        throw new Error("Job processing failed");
      }

      const resultData = await response.json(); // Should contain the transcription
      console.log("Jobs response:", resultData);

      // Assuming resultData is like: { transcript: "full text" }
      setMessages(resultData.transcript); // or however you display messages
    } catch (error) {
      console.error("Error during transcription job:", error);
    }
  }

  return (
    <div className="text-interface">
      <h2>Upload Audio File</h2>
      <input
        type="file"
        accept=".wav"
        onChange={(e) => setAudioFile(e.target.files[0])}
      />
      <button type="button" onClick={handleAudioUpload}>
        Send to /jobs
      </button>

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
