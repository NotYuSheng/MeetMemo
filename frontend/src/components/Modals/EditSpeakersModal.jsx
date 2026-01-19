import { Modal, Button, Form, Alert } from '@govtechsg/sgds-react';
import { Users, Sparkles, Check, X } from 'lucide-react';

export default function EditSpeakersModal({
  show,
  onHide,
  editingSpeakers,
  setEditingSpeakers,
  handleSaveSpeakers,
  identifyingSpeakers,
  speakerSuggestions,
  handleAcceptSuggestion,
  handleRejectSuggestion,
}) {
  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <Users size={20} className="me-2" />
          Edit Speaker Names
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="mb-4">
          <p className="text-muted mb-2">
            Replace speaker labels with actual names. AI suggestions are automatically applied when
            available.
          </p>
          <p className="text-muted small mb-2">
            <strong>Tip:</strong> To add a new speaker, use the ✏️ button on any transcript segment.
          </p>
          {identifyingSpeakers && (
            <div className="text-muted small">
              <span
                className="spinner-border spinner-border-sm me-2"
                role="status"
                aria-hidden="true"
              ></span>
              Identifying speakers...
            </div>
          )}
        </div>

        {/* AI Suggestions Section */}
        {speakerSuggestions && Object.keys(speakerSuggestions).length > 0 && (
          <div className="mb-4">
            <h6 className="mb-3">
              <Sparkles size={18} className="me-2" />
              AI Suggestions
            </h6>
            {Object.entries(speakerSuggestions).map(([speakerLabel, suggestedName]) => {
              const isUndetermined = suggestedName === 'Cannot be determined';
              return (
                <Alert
                  key={speakerLabel}
                  variant={isUndetermined ? 'secondary' : 'success'}
                  className="d-flex justify-content-between align-items-center mb-2"
                >
                  <div>
                    <strong>{speakerLabel}:</strong>{' '}
                    <span className={isUndetermined ? 'text-muted fst-italic' : ''}>
                      {suggestedName}
                    </span>
                  </div>
                  <div className="d-flex gap-2">
                    {!isUndetermined && (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleAcceptSuggestion(speakerLabel, suggestedName)}
                        title="Accept this suggestion"
                      >
                        <Check size={16} />
                      </Button>
                    )}
                    <Button
                      variant={isUndetermined ? 'secondary' : 'danger'}
                      size="sm"
                      onClick={() => handleRejectSuggestion(speakerLabel)}
                      title="Dismiss this suggestion"
                    >
                      <X size={16} />
                    </Button>
                  </div>
                </Alert>
              );
            })}
            <hr className="my-4" />
          </div>
        )}

        {/* Manual Input Section */}
        <h6 className="mb-3">Speaker Names</h6>
        {Object.keys(editingSpeakers).map((speaker) => (
          <Form.Group key={speaker} className="mb-3">
            <Form.Label>{speaker}</Form.Label>
            <Form.Control
              type="text"
              value={editingSpeakers[speaker]}
              onChange={(e) =>
                setEditingSpeakers({
                  ...editingSpeakers,
                  [speaker]: e.target.value,
                })
              }
              placeholder="Enter speaker name"
            />
          </Form.Group>
        ))}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSaveSpeakers}>
          Save Changes
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
