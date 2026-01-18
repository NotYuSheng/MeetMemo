import { useRef, useEffect } from 'react';
import { Badge, Button } from '@govtechsg/sgds-react';
import { Pencil, Play } from 'lucide-react';
import { getSpeakerBadgeVariant, getSpeakerBorderColor } from '../../utils/speakerColors';

export default function TranscriptSegment({
  segment,
  index,
  handleEditText,
  isActive,
  onSeekToSegment,
}) {
  const segmentRef = useRef(null);

  // Auto-scroll to active segment
  useEffect(() => {
    if (isActive && segmentRef.current) {
      segmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [isActive]);

  const handlePlayFromHere = (e) => {
    e.stopPropagation();
    if (onSeekToSegment) {
      onSeekToSegment(parseFloat(segment.start));
    }
  };

  return (
    <div
      ref={segmentRef}
      className={`transcript-segment mb-3 p-3 border-start border-3 ${isActive ? 'transcript-segment-active' : ''}`}
      style={{ borderColor: getSpeakerBorderColor(segment.speaker) }}
      onClick={handlePlayFromHere}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handlePlayFromHere(e);
        }
      }}
    >
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="d-flex align-items-center gap-2">
          <Badge bg={getSpeakerBadgeVariant(segment.speaker)}>{segment.speaker}</Badge>
          {isActive && (
            <span className="audio-playing-indicator" title="Currently playing">
              <span className="audio-playing-dot"></span>
            </span>
          )}
        </div>
        <div className="d-flex gap-2 align-items-center">
          <Button
            variant="link"
            size="sm"
            className="p-0 segment-play-btn"
            onClick={handlePlayFromHere}
            title="Play from here"
            style={{ color: '#2563eb' }}
          >
            <Play size={14} />
          </Button>
          <small className="text-muted segment-timestamp">
            {Math.floor(segment.start / 60)}:
            {String(Math.floor(segment.start % 60)).padStart(2, '0')} -{' '}
            {Math.floor(segment.end / 60)}:{String(Math.floor(segment.end % 60)).padStart(2, '0')}
          </small>
          <Button
            variant="link"
            size="sm"
            className="p-0"
            onClick={(e) => {
              e.stopPropagation();
              handleEditText(segment, index);
            }}
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
