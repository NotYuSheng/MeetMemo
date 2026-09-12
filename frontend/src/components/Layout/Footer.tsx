import { Container, Row, Col } from '@govtechsg/sgds-react';

export default function Footer() {
  return (
    <footer className="app-footer mt-auto py-4 bg-light">
      <Container>
        <Row>
          <Col className="text-center text-muted">
            <small>
              MeetMemo &copy; 2025 - AI-Powered Meeting Transcription with Speaker Diarization
            </small>
          </Col>
        </Row>
      </Container>
    </footer>
  );
}
