import { Container, Row, Col, Card, ProgressBar, Button, Alert } from '@govtechsg/sgds-react';
import { FileText, AlertCircle } from 'lucide-react';

export default function LoadingScreen({ backendError }) {
  // Show error screen if backend failed to load
  if (backendError) {
    return (
      <div
        className="app d-flex align-items-center justify-content-center"
        style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}
      >
        <Container>
          <Row className="justify-content-center">
            <Col md={6} className="text-center">
              <Card className="shadow-sm border-0">
                <Card.Body className="p-5">
                  <AlertCircle size={64} className="text-secondary mb-4" />
                  <h2 className="mb-3">Connection Error</h2>
                  <Alert variant="danger" className="mb-4">
                    {backendError}
                  </Alert>
                  <p className="text-muted mb-4">
                    Please ensure the backend service is running and try refreshing the page.
                  </p>
                  <Button variant="primary" onClick={() => window.location.reload()}>
                    Retry Connection
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  // Show loading screen while backend is initializing
  return (
    <div
      className="app d-flex align-items-center justify-content-center"
      style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}
    >
      <Container>
        <Row className="justify-content-center">
          <Col md={6} className="text-center">
            <Card className="shadow-sm border-0">
              <Card.Body className="p-5">
                <FileText size={64} className="text-primary mb-4" />
                <h2 className="mb-3">MeetMemo</h2>
                <p className="text-muted mb-4">AI-Powered Meeting Transcription</p>
                <div className="spinner-border text-primary mb-3" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="text-muted small">Connecting to backend services...</p>
                <ProgressBar animated now={100} className="mt-3" style={{ height: '4px' }} />
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
