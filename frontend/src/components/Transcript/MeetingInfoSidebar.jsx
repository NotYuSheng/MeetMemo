import { Card, Button, Badge } from '@govtechsg/sgds-react';
import { Users, Sparkles, Download, AlertCircle } from 'lucide-react';
import { getSpeakerBadgeVariant } from '../../utils/speakerColors';
import * as api from '../../services/api';

export default function MeetingInfoSidebar({
  selectedFile,
  transcript,
  identifyingSpeakers,
  handleEditSpeakers,
  handleGenerateSummary,
  generatingSummary,
  jobId,
}) {
  return (
    <Card className="sticky-sidebar">
      <Card.Header>
        <h5 className="mb-0">Meeting Info</h5>
      </Card.Header>
      <Card.Body>
        <div className="meeting-info mb-4">
          <div className="info-item mb-3">
            <small className="text-muted">File Name</small>
            <div>{selectedFile?.name || 'Unknown'}</div>
          </div>
          <div className="info-item mb-3">
            <small className="text-muted">Duration</small>
            <div>
              {transcript?.segments && transcript.segments.length > 0
                ? `${Math.floor(transcript.segments[transcript.segments.length - 1].end / 60)}:${String(Math.floor(transcript.segments[transcript.segments.length - 1].end % 60)).padStart(2, '0')}`
                : 'N/A'}
            </div>
          </div>
          <div className="info-item mb-3">
            <small className="text-muted">Speakers</small>
            <div className="mb-2">
              {transcript?.segments ? (
                [...new Set(transcript.segments.map((s) => s.speaker))].map((speaker) => (
                  <Badge key={speaker} bg={getSpeakerBadgeVariant(speaker)} className="me-1">
                    {speaker}
                  </Badge>
                ))
              ) : (
                <span className="text-muted">N/A</span>
              )}
            </div>
            {identifyingSpeakers && (
              <div className="small text-muted">
                <Sparkles size={12} className="me-1" />
                AI is identifying speakers...
              </div>
            )}
            <div className="small text-muted" style={{ fontSize: '0.75rem', lineHeight: '1.3' }}>
              <AlertCircle size={12} className="me-1" />
              Speaker names are auto-identified by AI when possible. Use "Edit Speakers" to make
              changes.
            </div>
          </div>
        </div>

        <hr />

        <div className="actions">
          <h6 className="mb-3">Next Steps</h6>
          <Button
            variant="primary"
            className="w-100 mb-2"
            onClick={handleGenerateSummary}
            disabled={generatingSummary}
          >
            {generatingSummary ? (
              <>
                <span
                  className="spinner-border spinner-border-sm me-2"
                  role="status"
                  aria-hidden="true"
                ></span>
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={18} className="me-2" />
                Generate AI Summary
              </>
            )}
          </Button>
          <Button
            variant="outline-secondary"
            className="w-100 mb-2"
            onClick={() => api.downloadTranscriptMarkdown(jobId, selectedFile?.name)}
          >
            <Download size={18} className="me-2" />
            Export Markdown
          </Button>
          <Button
            variant="outline-secondary"
            className="w-100 mb-2"
            onClick={() => api.downloadTranscriptPDF(jobId, selectedFile?.name)}
          >
            <Download size={18} className="me-2" />
            Export PDF
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}
