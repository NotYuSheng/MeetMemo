import { Row, Col, Alert } from '@govtechsg/sgds-react';
import { AlertCircle } from 'lucide-react';

export default function ErrorAlert({ error, onClose }) {
  if (!error) return null;

  return (
    <Row className="justify-content-center mb-4">
      <Col lg={10}>
        <Alert variant="danger" dismissible onClose={onClose}>
          <AlertCircle size={20} className="me-2" />
          <strong>Error:</strong> {error}
        </Alert>
      </Col>
    </Row>
  );
}
