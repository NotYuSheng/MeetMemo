export default function ErrorAlert({ error, onClose }) {
  if (!error) return null;

  return (
    <div style={{
      backgroundColor: '#f8d7da',
      border: '1px solid #f5c2c7',
      borderRadius: '0.375rem',
      padding: '1rem',
      margin: '1rem auto',
      maxWidth: '800px',
      color: '#842029',
      position: 'relative'
    }}>
      <strong>Error:</strong> {error}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          right: '1rem',
          top: '1rem',
          background: 'none',
          border: 'none',
          fontSize: '1.5rem',
          cursor: 'pointer',
          color: '#842029'
        }}
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}
