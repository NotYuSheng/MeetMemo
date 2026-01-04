import { Row, Col, Card, Button } from '@govtechsg/sgds-react'
import { FileText, Users } from 'lucide-react'
import TranscriptSegment from './TranscriptSegment'
import MeetingInfoSidebar from './MeetingInfoSidebar'

export default function TranscriptView({
  transcript,
  selectedFile,
  jobId,
  handleEditSpeakers,
  handleEditText,
  handleGenerateSummary,
  generatingSummary,
  identifyingSpeakers
}) {
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
  )
}
