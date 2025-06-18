import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './JobDetail.css';

function JobDetail() {
  const { uuid } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState("");

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
    fetch(`/name/${uuid}`)
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
      <h2>Transcription for: {fileName || uuid}</h2>
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
      <a href='/'>Back to home</a>
    </div>
  );
}

export default JobDetail;
