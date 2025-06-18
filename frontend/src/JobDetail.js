import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';

function JobDetail() {
  const { uuid } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/file/${uuid}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch job");
        return res.json();
      })
      .then(setData)
      .catch(setError);
  }, [uuid]);

  if (error) return <div>Error: {error.message}</div>;
  if (!data) return <div>Loading job details...</div>;

  return (
    <div className="job-detail">
      <h2>Job: {uuid}</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default JobDetail;
