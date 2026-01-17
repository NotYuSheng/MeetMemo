import { Modal, Button, Form } from '@govtechsg/sgds-react';
import { Edit2 } from 'lucide-react';

export default function EditSummaryModal({
  show,
  onHide,
  editingSummary,
  setEditingSummary,
  handleSaveSummary,
}) {
  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <Edit2 size={20} className="me-2" />
          Edit AI Summary
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted mb-3">
          Edit the AI-generated summary to correct any inaccuracies or add additional details before
          exporting.
        </p>
        <Form.Group>
          <Form.Label>Summary Text</Form.Label>
          <Form.Control
            as="textarea"
            rows={15}
            value={editingSummary}
            onChange={(e) => setEditingSummary(e.target.value)}
            placeholder="Enter summary text..."
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSaveSummary}>
          Save Changes
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
