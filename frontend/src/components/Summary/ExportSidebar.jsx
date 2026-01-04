import { Card, Button } from '@govtechsg/sgds-react'
import { Download } from 'lucide-react'
import * as api from '../../services/api'

export default function ExportSidebar({ jobId, selectedFile, handleStartNewMeeting }) {
  return (
    <Card className="sticky-sidebar">
      <Card.Header>
        <h5 className="mb-0">Export Options</h5>
      </Card.Header>
      <Card.Body>
        <h6 className="mb-2 small text-muted">AI Summary + Transcript</h6>
        <Button variant="primary" className="w-100 mb-2" onClick={() => api.downloadPDF(jobId, selectedFile?.name)}>
          <Download size={18} className="me-2" />
          Export PDF
        </Button>
        <Button variant="outline-primary" className="w-100 mb-3" onClick={() => api.downloadMarkdown(jobId, selectedFile?.name)}>
          <Download size={18} className="me-2" />
          Export Markdown
        </Button>

        <h6 className="mb-2 small text-muted">Transcript Only</h6>
        <Button variant="outline-secondary" className="w-100 mb-2" onClick={() => api.downloadTranscriptPDF(jobId, selectedFile?.name)}>
          <Download size={18} className="me-2" />
          Export PDF
        </Button>
        <Button variant="outline-secondary" className="w-100 mb-3" onClick={() => api.downloadTranscriptMarkdown(jobId, selectedFile?.name)}>
          <Download size={18} className="me-2" />
          Export Markdown
        </Button>

        <hr />

        <Button variant="outline-secondary" className="w-100" onClick={handleStartNewMeeting}>
          Start New Meeting
        </Button>
      </Card.Body>
    </Card>
  )
}
