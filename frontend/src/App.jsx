import { useState } from 'react'
import { Container, Row, Col, Card, Button, Badge, ProgressBar, Alert } from '@govtechsg/sgds-react'
import { Mic, Upload, FileText, Users, Sparkles, Download, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import './App.css'

function App() {
  const [currentStep, setCurrentStep] = useState('upload') // upload, processing, transcript, summary
  const [processingProgress, setProcessingProgress] = useState(0)

  return (
    <div className="app">
      {/* Simple Header */}
      <div className="app-header">
        <Container>
          <div className="d-flex align-items-center justify-content-between py-3">
            <div className="d-flex align-items-center gap-3">
              <FileText size={32} className="text-primary" />
              <div>
                <h4 className="mb-0">MeetMemo</h4>
                <small className="text-muted">AI Meeting Transcription</small>
              </div>
            </div>
            <Button variant="outline-primary" size="sm">
              <Clock size={16} className="me-2" />
              Past Meetings
            </Button>
          </div>
        </Container>
      </div>

      {/* Progress Steps Indicator */}
      <div className="workflow-steps bg-light py-3">
        <Container>
          <div className="steps-container">
            <div className={`step ${currentStep === 'upload' ? 'active' : 'completed'}`}>
              <div className="step-icon">
                <Upload size={20} />
              </div>
              <div className="step-label">Upload Audio</div>
            </div>
            <div className="step-divider"></div>
            <div className={`step ${currentStep === 'processing' ? 'active' : currentStep === 'transcript' || currentStep === 'summary' ? 'completed' : ''}`}>
              <div className="step-icon">
                <Users size={20} />
              </div>
              <div className="step-label">AI Processing</div>
            </div>
            <div className="step-divider"></div>
            <div className={`step ${currentStep === 'transcript' ? 'active' : currentStep === 'summary' ? 'completed' : ''}`}>
              <div className="step-icon">
                <FileText size={20} />
              </div>
              <div className="step-label">Review Transcript</div>
            </div>
            <div className="step-divider"></div>
            <div className={`step ${currentStep === 'summary' ? 'active' : ''}`}>
              <div className="step-icon">
                <Sparkles size={20} />
              </div>
              <div className="step-label">Get Summary</div>
            </div>
          </div>
        </Container>
      </div>

      {/* Main Content Area */}
      <Container className="py-5">
        {/* Step 1: Upload/Record */}
        {currentStep === 'upload' && (
          <Row className="justify-content-center">
            <Col lg={10}>
              <div className="text-center mb-4">
                <h2 className="mb-2">Start Your Meeting Transcription</h2>
                <p className="text-muted">Upload a recording or record live to get AI-powered transcription with speaker identification</p>
              </div>

              <Row className="g-4">
                <Col md={6}>
                  <Card className="h-100 upload-card">
                    <Card.Body className="text-center p-5">
                      <div className="upload-icon mb-4">
                        <Upload size={64} strokeWidth={1.5} className="text-primary" />
                      </div>
                      <h4 className="mb-3">Upload Audio File</h4>
                      <p className="text-muted mb-4">
                        Drop your audio file here or click to browse
                      </p>
                      <div className="upload-dropzone mb-3">
                        <p className="mb-2"><strong>Drag & drop</strong> or <strong>click to browse</strong></p>
                        <small className="text-muted">Supports MP3, WAV, M4A, WEBM (max 500MB)</small>
                      </div>
                      <Button variant="primary" size="lg" className="w-100">
                        Choose File
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>

                <Col md={6}>
                  <Card className="h-100 record-card">
                    <Card.Body className="text-center p-5">
                      <div className="record-icon mb-4">
                        <Mic size={64} strokeWidth={1.5} className="text-danger" />
                      </div>
                      <h4 className="mb-3">Record Live Meeting</h4>
                      <p className="text-muted mb-4">
                        Record audio directly from your microphone
                      </p>
                      <div className="record-info mb-4">
                        <Alert variant="info" className="mb-0">
                          <small>
                            <strong>Tip:</strong> For best results, use a quality microphone and minimize background noise
                          </small>
                        </Alert>
                      </div>
                      <Button variant="danger" size="lg" className="w-100">
                        <Mic size={20} className="me-2" />
                        Start Recording
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Recent Meetings Preview */}
              <Card className="mt-4">
                <Card.Header>
                  <h5 className="mb-0">
                    <Clock size={20} className="me-2" />
                    Recent Meetings
                  </h5>
                </Card.Header>
                <Card.Body>
                  <div className="text-center text-muted py-4">
                    <p className="mb-0">No recent meetings. Upload or record your first meeting to get started!</p>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}

        {/* Step 2: Processing */}
        {currentStep === 'processing' && (
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
                      <CheckCircle size={20} className="text-success me-2" />
                      <span>Audio uploaded successfully</span>
                    </div>
                    <div className="processing-step active">
                      <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                      <span>Transcribing with Whisper AI...</span>
                    </div>
                    <div className="processing-step">
                      <div className="step-number me-2">3</div>
                      <span>Identifying speakers with PyAnnote</span>
                    </div>
                    <div className="processing-step">
                      <div className="step-number me-2">4</div>
                      <span>Finalizing transcript</span>
                    </div>
                  </div>

                  <ProgressBar now={processingProgress} className="mb-3" style={{ height: '8px' }} />
                  <div className="text-center">
                    <small className="text-muted">
                      This may take a few minutes depending on the length of your recording
                    </small>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}

        {/* Step 3: Transcript View */}
        {currentStep === 'transcript' && (
          <Row>
            <Col lg={8}>
              <Card className="mb-4">
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">
                    <FileText size={20} className="me-2" />
                    Meeting Transcript
                  </h5>
                  <div className="d-flex gap-2">
                    <Button variant="outline-primary" size="sm">Edit Speakers</Button>
                    <Button variant="outline-primary" size="sm">Edit Text</Button>
                  </div>
                </Card.Header>
                <Card.Body>
                  <div className="transcript-placeholder text-center text-muted py-5">
                    <FileText size={48} className="mb-3 opacity-50" />
                    <p>Transcript will appear here after processing</p>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4}>
              <Card className="sticky-sidebar">
                <Card.Header>
                  <h5 className="mb-0">Meeting Info</h5>
                </Card.Header>
                <Card.Body>
                  <div className="meeting-info mb-4">
                    <div className="info-item mb-3">
                      <small className="text-muted">File Name</small>
                      <div>team-meeting.mp3</div>
                    </div>
                    <div className="info-item mb-3">
                      <small className="text-muted">Duration</small>
                      <div>12:34</div>
                    </div>
                    <div className="info-item mb-3">
                      <small className="text-muted">Speakers</small>
                      <div>
                        <Badge bg="primary" className="me-1">Speaker 1</Badge>
                        <Badge bg="success" className="me-1">Speaker 2</Badge>
                        <Badge bg="info">Speaker 3</Badge>
                      </div>
                    </div>
                  </div>

                  <hr />

                  <div className="actions">
                    <h6 className="mb-3">Next Steps</h6>
                    <Button variant="primary" className="w-100 mb-2" onClick={() => setCurrentStep('summary')}>
                      <Sparkles size={18} className="me-2" />
                      Generate AI Summary
                    </Button>
                    <Button variant="outline-secondary" className="w-100 mb-2">
                      <Download size={18} className="me-2" />
                      Export Transcript
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}

        {/* Step 4: Summary View */}
        {currentStep === 'summary' && (
          <Row>
            <Col lg={8}>
              <Card className="mb-4">
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">
                    <Sparkles size={20} className="me-2" />
                    AI-Generated Summary
                  </h5>
                  <div className="d-flex gap-2">
                    <Button variant="outline-primary" size="sm">Regenerate</Button>
                    <Button variant="primary" size="sm">
                      <Download size={16} className="me-2" />
                      Export
                    </Button>
                  </div>
                </Card.Header>
                <Card.Body>
                  <div className="summary-placeholder text-center text-muted py-5">
                    <Sparkles size={48} className="mb-3 opacity-50" />
                    <p>AI summary will appear here</p>
                  </div>
                </Card.Body>
              </Card>

              <Card>
                <Card.Header>
                  <h5 className="mb-0">Full Transcript</h5>
                </Card.Header>
                <Card.Body>
                  <small className="text-muted">Click to expand full transcript</small>
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4}>
              <Card className="sticky-sidebar">
                <Card.Header>
                  <h5 className="mb-0">Export Options</h5>
                </Card.Header>
                <Card.Body>
                  <Button variant="outline-primary" className="w-100 mb-2">
                    <Download size={18} className="me-2" />
                    Download PDF
                  </Button>
                  <Button variant="outline-primary" className="w-100 mb-2">
                    <Download size={18} className="me-2" />
                    Download Markdown
                  </Button>
                  <Button variant="outline-primary" className="w-100 mb-2">
                    <Download size={18} className="me-2" />
                    Download JSON
                  </Button>

                  <hr />

                  <Button variant="outline-secondary" className="w-100" onClick={() => setCurrentStep('upload')}>
                    Start New Meeting
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}

        {/* Debug Controls (temporary) */}
        <div className="mt-5 pt-4 border-top">
          <Container>
            <Row>
              <Col>
                <Alert variant="secondary">
                  <strong>Debug Controls:</strong> Test different workflow steps
                  <div className="mt-3 d-flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline-secondary" onClick={() => setCurrentStep('upload')}>
                      1. Upload
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={() => setCurrentStep('processing')}>
                      2. Processing
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={() => setCurrentStep('transcript')}>
                      3. Transcript
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={() => setCurrentStep('summary')}>
                      4. Summary
                    </Button>
                  </div>
                </Alert>
              </Col>
            </Row>
          </Container>
        </div>
      </Container>

      {/* Footer */}
      <footer className="app-footer mt-auto py-4 bg-light">
        <Container>
          <Row>
            <Col className="text-center text-muted">
              <small>
                MeetMemo &copy; 2024 - AI-Powered Meeting Transcription with Speaker Diarization
              </small>
            </Col>
          </Row>
        </Container>
      </footer>
    </div>
  )
}

export default App
