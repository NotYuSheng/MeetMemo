import { Card, Badge } from '@govtechsg/sgds-react';
import { FileText } from 'lucide-react';
import { getSpeakerBadgeVariant, getSpeakerBorderColor } from '../../utils/speakerColors';

export default function CollapsibleTranscript({
  transcript,
  showFullTranscript,
  setShowFullTranscript,
}) {
  return (
    <Card>
      <Card.Header
        onClick={() => setShowFullTranscript(!showFullTranscript)}
        style={{ cursor: 'pointer' }}
        className="d-flex justify-content-between align-items-center"
      >
        <h5 className="mb-0">
          <FileText size={20} className="me-2" />
          Full Transcript
        </h5>
        <span className="text-muted">{showFullTranscript ? '▼' : '▶'}</span>
      </Card.Header>
      {showFullTranscript && (
        <Card.Body>
          {transcript && transcript.segments ? (
            <div className="transcript-content">
              {transcript.segments.map((segment, index) => (
                <div
                  key={index}
                  className="transcript-segment mb-3 p-3 border-start border-3"
                  style={{ borderColor: getSpeakerBorderColor(segment.speaker) }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <Badge bg={getSpeakerBadgeVariant(segment.speaker)}>{segment.speaker}</Badge>
                    <small className="text-muted">
                      {Math.floor(segment.start / 60)}:
                      {String(Math.floor(segment.start % 60)).padStart(2, '0')} -{' '}
                      {Math.floor(segment.end / 60)}:
                      {String(Math.floor(segment.end % 60)).padStart(2, '0')}
                    </small>
                  </div>
                  <p className="mb-0">{segment.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted py-3">
              <p className="mb-0">No transcript available</p>
            </div>
          )}
        </Card.Body>
      )}
    </Card>
  );
}
