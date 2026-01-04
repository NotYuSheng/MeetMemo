import { Card, Button, Alert } from '@govtechsg/sgds-react'
import { Mic } from 'lucide-react'

export default function RecordingCard() {
  return (
    <Card className="h-100 record-card">
      <Card.Body className="text-center p-5">
        <div className="record-icon mb-4">
          <Mic size={64} strokeWidth={1.5} className="text-danger" />
        </div>
        <h4 className="mb-3">Record Live Meeting</h4>
        <p className="text-muted mb-4">
          Record audio directly from your microphone
        </p>
        <div className="record-info mb-4">
          <Alert variant="info" className="mb-0">
            <small>
              <strong>Tip:</strong> For best results, use a quality microphone and minimize background noise
            </small>
          </Alert>
        </div>
        <Button variant="danger" size="lg" className="w-100">
          <Mic size={20} className="me-2" />
          Start Recording
        </Button>
      </Card.Body>
    </Card>
  )
}
