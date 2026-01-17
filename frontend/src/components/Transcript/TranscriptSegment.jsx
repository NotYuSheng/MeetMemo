import { Badge, Button } from '@govtechsg/sgds-react';
import { Pencil } from 'lucide-react';
import { getSpeakerBadgeVariant, getSpeakerBorderColor } from '../../utils/speakerColors';

export default function TranscriptSegment({ segment, index, handleEditText }) {
  return (
    <div
      className="transcript-segment mb-3 p-3 border-start border-3"
      style={{ borderColor: getSpeakerBorderColor(segment.speaker) }}
    >
      <div className="d-flex justify-content-between align-items-center mb-2">
        <Badge bg={getSpeakerBadgeVariant(segment.speaker)}>{segment.speaker}</Badge>
        <div className="d-flex gap-2 align-items-center">
          <small className="text-muted">
            {Math.floor(segment.start / 60)}:
            {String(Math.floor(segment.start % 60)).padStart(2, '0')} -{' '}
            {Math.floor(segment.end / 60)}:{String(Math.floor(segment.end % 60)).padStart(2, '0')}
          </small>
          <Button
            variant="link"
            size="sm"
            className="p-0"
            onClick={() => handleEditText(segment, index)}
            title="Edit this segment"
            style={{ color: '#f0ad4e' }}
          >
            <Pencil size={14} />
          </Button>
        </div>
      </div>
      <p className="mb-0">{segment.text}</p>
    </div>
  );
}
