import { Card, Button, Alert } from '@govtechsg/sgds-react';
import { Mic, AlertCircle } from 'lucide-react';
import { getRecordingUnavailableReason } from '../../utils/browserUtils';

export default function RecordingCard({ onStartRecording, isRecording }) {
  const unavailableReason = getRecordingUnavailableReason();
  const isDisabled = !!unavailableReason || isRecording;

  return (
    <Card className="h-100 record-card">
      <Card.Body className="text-center p-5 d-flex flex-column justify-content-center">
        <div className="record-icon my-4">
          <Mic size={64} strokeWidth={1.5} className="text-danger" />
        </div>
        <h4 className="mb-3">Record Live Meeting</h4>
        <p className="text-muted mb-4">Record audio directly from your microphone</p>
        <div className="record-info mb-4">
          {unavailableReason ? (
            <Alert variant="warning" className="mb-0">
              <div className="d-flex align-items-start gap-2">
                <AlertCircle size={20} className="flex-shrink-0 mt-1" />
                <small>{unavailableReason}</small>
              </div>
            </Alert>
          ) : (
            <Alert variant="info" className="mb-0">
              <small>
                <strong>Tip:</strong> For best results, use a quality microphone and minimize
                background noise
              </small>
            </Alert>
          )}
        </div>
        <div title={unavailableReason || ''}>
          <Button
            variant="danger"
            size="lg"
            className="w-100"
            disabled={isDisabled}
            onClick={onStartRecording}
          >
            <Mic size={20} className="me-2" />
            {isRecording ? 'Recording...' : 'Start Recording'}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}
