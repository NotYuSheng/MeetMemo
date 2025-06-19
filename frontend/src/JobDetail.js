import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './JobDetail.css';

function JobDetail() {
  const { uuid } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const fetchSummary = () => {
    setIsSummarizing(true);
    fetch(`/jobs/${uuid}/summarise`, {
      method: "POST",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.summary) {
          setSummary(data.summary);
        } else {
          setSummary("Failed to summarize transcript.");
        }
        setIsSummarizing(false);
      })
      .catch((err) => {
        setSummary("Error fetching summary.");
        setIsSummarizing(false);
      });
  };

  useEffect(() => {
    fetch(`/jobs/${uuid}/transcript`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch job");
        return res.json();
      })
      .then(setData)
      .catch(setError);
  }, [uuid]);

  useEffect(() => {
    fetch(`/jobs/${uuid}/filename`)
      .then(res => res.json())
      .then(data => {
        if (data.name) {
          setFileName(data.name);
        }
      })
      .catch(err => console.error("Failed to fetch file name:", err));
  }, [uuid]);

  if (error) return <div>Error: {error.message}</div>;
  if (!data) return <div>Loading job details...</div>;

  return (
    <div className="job-detail">
      <h2>Transcription for: {fileName}</h2>
      <div className="transcription-container">
        {Array.isArray(data.result) && data.result.map((entry, idx) => {
          const [speaker, utterance] = Object.entries(entry)[0];
          return (
            <div key={idx} className={`message-bubble ${idx % 2 === 0 ? 'speaker-1' : 'speaker-2'}`}>
              <strong>{speaker}:</strong> {utterance}
            </div>
          );
        })}
      </div>

      <div className="summary-section">
        <button 
          onClick={fetchSummary} 
          disabled={isSummarizing} 
          className={`summary-button ${isSummarizing ? 'disabled' : ''}`}
        >
          {isSummarizing ? "Summarizing..." : "Summarize Transcript"}
        </button>

        {isSummarizing && (
          <div className="loading-spinner">
            <div className="spinner" />
            <p>Working on your summary... This may take a few moments.</p>
          </div>
        )}

        {summary && !isSummarizing && (
          <div className="summary-output">
            <h3>Meeting Summary:</h3>
            <p>{summary}</p>
          </div>
        )}
      </div>

      <a href='/'>Back to home</a>
    </div>
  );
}

export default JobDetail;
