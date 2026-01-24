import './ErrorAlert.css';

export default function ErrorAlert({ error, onClose }) {
  if (!error) return null;

  return (
    <div className="error-alert" role="alert">
      <strong>Error:</strong> {error}
      <button onClick={onClose} className="error-alert-close-button" aria-label="Close">
        ×
      </button>
    </div>
  );
}
