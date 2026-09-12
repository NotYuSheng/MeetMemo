import { Card, Button } from '@govtechsg/sgds-react';
import { Download } from 'lucide-react';
import * as api from '../../services/api';
import type { SelectedFile } from '../../types/api';

interface ExportSidebarProps {
  jobId: string | null;
  selectedFile: SelectedFile;
  handleStartNewMeeting: () => void;
}

export default function ExportSidebar({
  jobId,
  selectedFile,
  handleStartNewMeeting,
}: ExportSidebarProps) {
  return (
    <Card className="sticky-sidebar">
      <Card.Header>
        <h5 className="mb-0">Export Options</h5>
      </Card.Header>
      <Card.Body>
        <h6 className="mb-2 small text-muted">AI Summary + Transcript</h6>
        <Button
          variant="primary"
          className="w-100 mb-2"
          onClick={() => jobId && api.downloadPDF(jobId, selectedFile?.name)}
        >
          <Download size={18} className="me-2" />
          Export PDF
        </Button>
        <Button
          variant="outline-primary"
          className="w-100 mb-3"
          onClick={() => jobId && api.downloadMarkdown(jobId, selectedFile?.name)}
        >
          <Download size={18} className="me-2" />
          Export Markdown
        </Button>

        <h6 className="mb-2 small text-muted">Transcript Only</h6>
        <Button
          variant="outline-secondary"
          className="w-100 mb-2"
          onClick={() => jobId && api.downloadTranscriptPDF(jobId, selectedFile?.name)}
        >
          <Download size={18} className="me-2" />
          Export PDF
        </Button>
        <Button
          variant="outline-secondary"
          className="w-100 mb-3"
          onClick={() => jobId && api.downloadTranscriptMarkdown(jobId, selectedFile?.name)}
        >
          <Download size={18} className="me-2" />
          Export Markdown
        </Button>

        <hr />

        <Button variant="outline-secondary" className="w-100" onClick={handleStartNewMeeting}>
          Start New Meeting
        </Button>
      </Card.Body>
    </Card>
  );
}
