import { Row, Col, Card } from '@govtechsg/sgds-react'
import { Users, CheckCircle } from 'lucide-react'

export default function ProcessingView({ processingProgress }) {
  return (
    <Row className="justify-content-center">
      <Col lg={8}>
        <Card>
          <Card.Body className="p-5">
            <div className="text-center mb-4">
              <div className="processing-animation mb-4">
                <Users size={64} className="text-primary" />
              </div>
              <h3 className="mb-2">Processing Your Meeting</h3>
              <p className="text-muted">Our AI is transcribing audio and identifying speakers</p>
            </div>

            <div className="processing-steps mb-4">
              <div className="processing-step completed">
                <CheckCircle size={20} className="text-secondary me-2" />
                <span>Audio uploaded successfully</span>
              </div>
              <div className={`processing-step ${processingProgress >= 30 ? 'completed' : processingProgress > 0 ? 'active' : ''}`}>
                {processingProgress >= 30 ? (
                  <CheckCircle size={20} className="text-secondary me-2" />
                ) : processingProgress > 0 ? (
                  <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                ) : (
                  <div className="step-number me-2">2</div>
                )}
                <span>Transcribing with Whisper AI...</span>
              </div>
              <div className={`processing-step ${processingProgress >= 90 ? 'completed' : processingProgress >= 30 ? 'active' : ''}`}>
                {processingProgress >= 90 ? (
                  <CheckCircle size={20} className="text-secondary me-2" />
                ) : processingProgress >= 30 ? (
                  <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                ) : (
                  <div className="step-number me-2">3</div>
                )}
                <span>Identifying speakers with PyAnnote (slowest step)</span>
              </div>
              <div className={`processing-step ${processingProgress === 100 ? 'completed' : processingProgress >= 90 ? 'active' : ''}`}>
                {processingProgress === 100 ? (
                  <CheckCircle size={20} className="text-secondary me-2" />
                ) : processingProgress >= 90 ? (
                  <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                ) : (
                  <div className="step-number me-2">4</div>
                )}
                <span>Aligning speakers with text</span>
              </div>
            </div>

            <div className="progress mb-3" style={{ height: '25px' }}>
              <div
                className="progress-bar progress-bar-animated progress-bar-striped"
                role="progressbar"
                style={{ width: `${processingProgress}%` }}
                aria-valuenow={processingProgress}
                aria-valuemin="0"
                aria-valuemax="100"
              >
                {processingProgress}%
              </div>
            </div>

            <div className="text-center">
              <small className="text-muted">
                This usually takes 2-3 minutes for a 10-minute recording
              </small>
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  )
}
