import { useState, useRef, useCallback } from 'react';
import { Row, Col, Card, Button } from '@govtechsg/sgds-react';
import { FileText, Users } from 'lucide-react';
import TranscriptSegment from './TranscriptSegment';
import MeetingInfoSidebar from './MeetingInfoSidebar';
import AudioPlayer from './AudioPlayer';

/**
 * Find the active segment index based on current playback time.
 */
function findActiveSegmentIndex(segments, currentTime) {
  if (!segments || segments.length === 0) return -1;

  for (let i = 0; i < segments.length; i++) {
    const start = parseFloat(segments[i].start);
    const end = parseFloat(segments[i].end);
    if (currentTime >= start && currentTime < end) {
      return i;
    }
  }

  // If past the last segment, return last segment
  const lastEnd = parseFloat(segments[segments.length - 1].end);
  if (currentTime >= lastEnd) {
    return segments.length - 1;
  }

  return -1;
}

export default function TranscriptView({
  transcript,
  selectedFile,
  jobId,
  handleEditSpeakers,
  handleEditText,
  handleGenerateSummary,
  generatingSummary,
  identifyingSpeakers,
}) {
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const audioPlayerRef = useRef(null);

  // Handle time update from audio player
  const handleTimeUpdate = useCallback(
    (currentTime) => {
      if (transcript?.segments) {
        const newIndex = findActiveSegmentIndex(transcript.segments, currentTime);
        setActiveSegmentIndex((prev) => (newIndex !== prev ? newIndex : prev));
      }
    },
    [transcript]
  );

  // Handle seeking to a segment
  const handleSeekToSegment = useCallback((time) => {
    if (audioPlayerRef.current?.seekTo) {
      audioPlayerRef.current.seekTo(time);
    }
  }, []);

  return (
    <Row>
      <Col lg={8}>
        <Card className="mb-4">
          <Card.Header className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">
              <FileText size={20} className="me-2" />
              Meeting Transcript
            </h5>
            <div className="d-flex gap-2">
              <Button variant="outline-primary" size="sm" onClick={handleEditSpeakers}>
                <Users size={16} className="me-1" />
                Edit Speakers
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            {transcript && transcript.segments ? (
              <div className="transcript-content">
                {transcript.segments.map((segment, index) => (
                  <TranscriptSegment
                    key={index}
                    segment={segment}
                    index={index}
                    handleEditText={handleEditText}
                    isActive={index === activeSegmentIndex}
                    onSeekToSegment={handleSeekToSegment}
                  />
                ))}
              </div>
            ) : (
              <div className="transcript-placeholder text-center text-muted py-5">
                <FileText size={48} className="mb-3 opacity-50" />
                <p>Transcript will appear here after processing</p>
              </div>
            )}
          </Card.Body>
        </Card>
      </Col>

      <Col lg={4}>
        <AudioPlayer
          jobId={jobId}
          onTimeUpdate={handleTimeUpdate}
          currentSegmentRef={audioPlayerRef}
        />
        <MeetingInfoSidebar
          selectedFile={selectedFile}
          transcript={transcript}
          identifyingSpeakers={identifyingSpeakers}
          handleEditSpeakers={handleEditSpeakers}
          handleGenerateSummary={handleGenerateSummary}
          generatingSummary={generatingSummary}
          jobId={jobId}
        />
      </Col>
    </Row>
  );
}
