import { Modal, Button, Form } from '@govtechsg/sgds-react'
import { Edit2 } from 'lucide-react'

export default function EditTextModal({
  show,
  onHide,
  editingSegment,
  setEditingSegment,
  handleSaveSegmentText,
  transcript,
  editingSpeakers
}) {
  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <Edit2 size={20} className="me-2" />
          Edit Transcript Segment
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {editingSegment && (
          <>
            <div className="mb-3">
              <small className="text-muted">
                {Math.floor(editingSegment.start / 60)}:{String(Math.floor(editingSegment.start % 60)).padStart(2, '0')} - {Math.floor(editingSegment.end / 60)}:{String(Math.floor(editingSegment.end % 60)).padStart(2, '0')}
              </small>
            </div>
            <Form.Group className="mb-3">
              <Form.Label>Speaker</Form.Label>
              <Form.Select
                value={editingSegment.speaker}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === '__new__') {
                    const newSpeaker = prompt('Enter new speaker name (e.g., John Smith or SPEAKER_03):')
                    if (newSpeaker && newSpeaker.trim()) {
                      setEditingSegment({
                        ...editingSegment,
                        speaker: newSpeaker.trim(),
                      })
                    }
                  } else {
                    setEditingSegment({
                      ...editingSegment,
                      speaker: value,
                    })
                  }
                }}
              >
                {/* Get unique speakers from transcript, plus the currently editing speaker if it's new */}
                {transcript && (() => {
                  const existingSpeakers = [...new Set(transcript.segments.map(s => s.speaker))]
                  // If editing speaker is not in existing list, add it (newly added speaker)
                  if (editingSegment.speaker && !existingSpeakers.includes(editingSegment.speaker)) {
                    existingSpeakers.push(editingSegment.speaker)
                  }
                  return existingSpeakers.sort().map(speaker => (
                    <option key={speaker} value={speaker}>
                      {editingSpeakers && editingSpeakers[speaker] ? editingSpeakers[speaker] : speaker}
                    </option>
                  ))
                })()}
                <option value="__new__">+ Add New Speaker</option>
              </Form.Select>
              <Form.Text className="text-muted">
                Select an existing speaker or add a new one
              </Form.Text>
            </Form.Group>
            <Form.Group>
              <Form.Label>Transcript Text</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={editingSegment.text}
                onChange={(e) =>
                  setEditingSegment({
                    ...editingSegment,
                    text: e.target.value,
                  })
                }
              />
            </Form.Group>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSaveSegmentText}>
          Save Changes
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
