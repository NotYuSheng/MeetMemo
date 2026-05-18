import { useState } from 'react';
import { Card, Badge, Button, Modal } from '@govtechsg/sgds-react';
import { Clock, AlertCircle, Trash2 } from 'lucide-react';

const DATE_TIME_FORMAT_OPTIONS = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export default function RecentJobsList({
  recentJobs,
  loadingJobs,
  handleLoadJob,
  handleDeleteJob,
}) {
  const [pendingDeleteUuid, setPendingDeleteUuid] = useState(null);

  const onDeleteClick = (uuid, e) => {
    e.stopPropagation();
    setPendingDeleteUuid(uuid);
  };

  const onConfirmDelete = () => {
    handleDeleteJob(pendingDeleteUuid);
    setPendingDeleteUuid(null);
  };

  return (
    <>
      <Card className="mt-4">
        <Card.Header>
          <h5 className="mb-0">
            <Clock size={20} className="me-2" />
            Recent Meetings
          </h5>
        </Card.Header>
        <Card.Body className="p-0">
          {loadingJobs ? (
            <div className="text-center text-muted py-4">
              <div className="spinner-border spinner-border-sm me-2" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <span>Loading recent meetings...</span>
            </div>
          ) : recentJobs.length > 0 ? (
            <div className="list-group list-group-flush">
              {recentJobs.map((job) => (
                <div
                  key={job.uuid}
                  className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleLoadJob(job)}
                >
                  <div className="flex-grow-1">
                    <div className="fw-medium">{job.filename || 'Untitled Recording'}</div>
                    <small className="text-muted">
                      {job.created_at
                        ? new Date(job.created_at).toLocaleString('en-GB', DATE_TIME_FORMAT_OPTIONS)
                        : 'Date unknown'}
                    </small>
                  </div>
                  <div className="d-flex gap-2 align-items-center">
                    <Badge
                      bg={
                        job.status_code === 200 || job.status_code === '200'
                          ? 'success'
                          : job.status_code === 202 || job.status_code === '202'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {job.status_code === 200 || job.status_code === '200'
                        ? 'Complete'
                        : job.status_code === 202 || job.status_code === '202'
                          ? 'Processing'
                          : 'Failed'}
                    </Badge>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-danger"
                      onClick={(e) => onDeleteClick(job.uuid, e)}
                      title="Delete this meeting"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted py-4">
              <p className="mb-0">
                No recent meetings. Upload or record your first meeting to get started!
              </p>
            </div>
          )}
          <div className="card-footer text-muted small">
            <AlertCircle size={14} className="me-1" />
            Meetings are automatically deleted after 12 hours
          </div>
        </Card.Body>
      </Card>

      <Modal show={!!pendingDeleteUuid} onHide={() => setPendingDeleteUuid(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete Meeting</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this meeting? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setPendingDeleteUuid(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirmDelete}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
