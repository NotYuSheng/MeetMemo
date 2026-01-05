import { useState } from 'react'
import { Row, Col, Card, Button } from '@govtechsg/sgds-react'
import { Sparkles, Edit2 } from 'lucide-react'
import SummaryContent from './SummaryContent'
import CollapsibleTranscript from './CollapsibleTranscript'
import ExportSidebar from './ExportSidebar'

export default function SummaryView({
  summary,
  transcript,
  selectedFile,
  jobId,
  handleEditSummary,
  handleStartNewMeeting
}) {
  const [showFullTranscript, setShowFullTranscript] = useState(false)

  return (
    <Row>
      <Col lg={8}>
        <Card className="mb-4">
          <Card.Header className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">
              <Sparkles size={20} className="me-2" />
              AI-Generated Summary
            </h5>
            <div className="d-flex gap-2">
              <Button variant="outline-primary" size="sm" onClick={handleEditSummary} disabled={!summary?.summary}>
                <Edit2 size={16} className="me-1" />
                Edit
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            <SummaryContent summary={summary} />
          </Card.Body>
        </Card>

        <CollapsibleTranscript
          transcript={transcript}
          showFullTranscript={showFullTranscript}
          setShowFullTranscript={setShowFullTranscript}
        />
      </Col>

      <Col lg={4}>
        <ExportSidebar
          jobId={jobId}
          selectedFile={selectedFile}
          handleStartNewMeeting={handleStartNewMeeting}
        />
      </Col>
    </Row>
  )
}
