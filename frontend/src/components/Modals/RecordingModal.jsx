import { Modal, Button, ProgressBar } from '@govtechsg/sgds-react'
import { Mic, Square } from 'lucide-react'

export default function RecordingModal({ show, onHide, recordingTime, onStop }) {
  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static" keyboard={false}>
      <Modal.Header>
        <Modal.Title>Recording in Progress</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="text-center py-4">
          <div className="mb-4">
            <Mic size={64} className="text-danger" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
          <h3 className="mb-3">{formatTime(recordingTime)}</h3>
          <p className="text-muted mb-4">
            Recording audio from your microphone...
          </p>
          <div className="mb-3">
            <ProgressBar animated now={100} variant="danger" />
          </div>
          <p className="text-muted small">
            Click "Stop Recording" when you're finished
          </p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="danger" onClick={onStop} size="lg" className="w-100">
          <Square size={20} className="me-2" />
          Stop Recording
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
