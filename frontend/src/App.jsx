import { useState, useRef, useEffect } from 'react'
import { Container, Row, Col, Card, Button, Badge, ProgressBar, Alert } from '@govtechsg/sgds-react'
import { Mic, Upload as UploadIcon, FileText, Users, Sparkles, Download, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import * as api from './services/api'
import './App.css'

function App() {
  const [currentStep, setCurrentStep] = useState('upload') // upload, processing, transcript, summary
  const [processingProgress, setProcessingProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [transcript, setTranscript] = useState(null)
  const [summary, setSummary] = useState(null)
  const fileInputRef = useRef(null)

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSelectedFile(file)
      // Immediately show processing UI
      setCurrentStep('processing')
      setProcessingProgress(10)
      handleUpload(file)
    }
  }

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (uploading) return

    const file = e.dataTransfer.files[0]
    if (file) {
      setSelectedFile(file)
      setCurrentStep('processing')
      setProcessingProgress(10)
      handleUpload(file)
    }
  }

  // Handle file upload
  const handleUpload = async (file) => {
    setError(null)
    setUploading(true)
    setProcessingProgress(0)

    try {
      // Note: Backend now uses async processing with 202 response
      const response = await api.uploadAudio(file)

      setJobId(response.uuid)

      // Backend returns 202 immediately and processes in background
      if (response.status_code === 202 || response.status_code === '202') {
        setCurrentStep('processing')
        setUploading(false)
        startPolling(response.uuid)
      } else if (response.status_code === 200 || response.status_code === '200') {
        // If somehow it completes immediately
        setUploading(false)
        setProcessingProgress(100)
        if (response.transcript) {
          setTranscript(response.transcript)
          setTimeout(() => {
            setCurrentStep('transcript')
          }, 500)
        } else {
          setCurrentStep('processing')
          startPolling(response.uuid)
        }
      } else {
        // Fallback to polling
        setCurrentStep('processing')
        setUploading(false)
        startPolling(response.uuid)
      }
    } catch (err) {
      setError(err.message || 'Failed to upload file')
      setUploading(false)
      setCurrentStep('upload')
      setProcessingProgress(0)
    }
  }

  // Poll job status
  const startPolling = (uuid) => {
    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getJobStatus(uuid)
        console.log('Progress Debug:', {
          percentage: status.progress_percentage,
          stage: status.processing_stage,
          status_code: status.status_code
        })
        setJobStatus(status)

        // Update progress with actual percentage from backend
        if (status.progress_percentage !== undefined) {
          setProcessingProgress(status.progress_percentage)
        }

        if (status.status_code === '200' || status.status_code === 200) {
          clearInterval(pollInterval)
          setProcessingProgress(100)
          // Fetch the transcript
          const transcriptData = await api.getTranscript(uuid)
          // Parse full_transcript JSON string if needed
          if (transcriptData.full_transcript && typeof transcriptData.full_transcript === 'string') {
            try {
              const parsed = JSON.parse(transcriptData.full_transcript)
              // The parsed data is an array of segments, wrap it in an object
              setTranscript({ segments: parsed })
            } catch (e) {
              console.error('Failed to parse transcript:', e)
              setTranscript(transcriptData)
            }
          } else {
            setTranscript(transcriptData)
          }
          setCurrentStep('transcript')
          setUploading(false)
        } else if (status.status_code === '500' || status.status_code === 500) {
          clearInterval(pollInterval)
          const errorMsg = status.error_message || 'Processing failed. Please try again.'
          setError(errorMsg)
          setUploading(false)
        }
        // else continue polling (status 202 - still processing)
      } catch (err) {
        console.error('Polling error:', err)
        clearInterval(pollInterval)
        setError('Failed to check processing status')
        setUploading(false)
      }
    }, 2000) // Poll every 2 seconds
  }

  // Generate summary
  const handleGenerateSummary = async () => {
    if (!jobId) return

    try {
      setError(null)
      const summaryData = await api.generateSummary(jobId)
      setSummary(summaryData)
      setCurrentStep('summary')
    } catch (err) {
      setError(err.message || 'Failed to generate summary')
    }
  }

  // Start new meeting
  const handleStartNewMeeting = () => {
    setCurrentStep('upload')
    setSelectedFile(null)
    setJobId(null)
    setJobStatus(null)
    setTranscript(null)
    setSummary(null)
    setError(null)
    setProcessingProgress(0)
    setUploading(false)
  }

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
                <UploadIcon size={20} />
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
        {/* Error Display */}
        {error && (
          <Row className="justify-content-center mb-4">
            <Col lg={10}>
              <Alert variant="danger" dismissible onClose={() => setError(null)}>
                <AlertCircle size={20} className="me-2" />
                <strong>Error:</strong> {error}
              </Alert>
            </Col>
          </Row>
        )}

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
                        <UploadIcon size={64} strokeWidth={1.5} className="text-primary" />
                      </div>
                      <h4 className="mb-3">Upload Audio File</h4>
                      <p className="text-muted mb-4">
                        Drag & drop your audio file or click to browse
                      </p>
                      <div
                        className="upload-dropzone mb-3"
                        onClick={() => !uploading && fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        style={{ cursor: uploading ? 'default' : 'pointer' }}
                      >
                        <p className="mb-2"><strong>Click to browse</strong> or drag & drop</p>
                        <small className="text-muted">Supports MP3, WAV, M4A, WEBM (max 500MB)</small>
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept=".mp3,.wav,.m4a,.webm,.ogg,.flac,.aac"
                        style={{ display: 'none' }}
                      />
                      {uploading && (
                        <div className="text-center">
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          <span>Uploading...</span>
                        </div>
                      )}
                      {selectedFile && !uploading && (
                        <div className="mt-3">
                          <small className="text-success">Selected: {selectedFile.name}</small>
                        </div>
                      )}
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
                    <div className={`processing-step ${processingProgress >= 30 ? 'completed' : processingProgress > 0 ? 'active' : ''}`}>
                      {processingProgress >= 30 ? (
                        <CheckCircle size={20} className="text-success me-2" />
                      ) : (
                        <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      )}
                      <span>Transcribing with Whisper AI...</span>
                    </div>
                    <div className={`processing-step ${processingProgress >= 95 ? 'completed' : processingProgress >= 30 ? 'active' : ''}`}>
                      {processingProgress >= 95 ? (
                        <CheckCircle size={20} className="text-success me-2" />
                      ) : processingProgress >= 30 ? (
                        <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      ) : (
                        <div className="step-number me-2">3</div>
                      )}
                      <span>Identifying speakers with PyAnnote (slowest step)</span>
                    </div>
                    <div className={`processing-step ${processingProgress === 100 ? 'completed' : processingProgress >= 95 ? 'active' : ''}`}>
                      {processingProgress === 100 ? (
                        <CheckCircle size={20} className="text-success me-2" />
                      ) : processingProgress >= 95 ? (
                        <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      ) : (
                        <div className="step-number me-2">4</div>
                      )}
                      <span>Finalizing transcript</span>
                    </div>
                  </div>

                  <ProgressBar
                    now={processingProgress}
                    variant="primary"
                    className="mb-3"
                    style={{ height: '8px' }}
                  />
                  <div className="text-center">
                    <small className="text-muted">
                      {processingProgress}% complete - This usually takes 2-3 minutes for a 10-minute recording
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
                  {transcript && transcript.segments ? (
                    <div className="transcript-content">
                      {transcript.segments.map((segment, index) => (
                        <div key={index} className="transcript-segment mb-3 p-3 border-start border-3" style={{ borderColor: segment.speaker === 'SPEAKER_00' ? '#0d6efd' : segment.speaker === 'SPEAKER_01' ? '#198754' : '#0dcaf0' }}>
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <Badge bg={segment.speaker === 'SPEAKER_00' ? 'primary' : segment.speaker === 'SPEAKER_01' ? 'success' : 'info'}>
                              {segment.speaker}
                            </Badge>
                            <small className="text-muted">
                              {Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, '0')} - {Math.floor(segment.end / 60)}:{String(Math.floor(segment.end % 60)).padStart(2, '0')}
                            </small>
                          </div>
                          <p className="mb-0">{segment.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="transcript-placeholder text-center text-muted py-5">
                      <FileText size={48} className="mb-3 opacity-50" />
                      <p>Transcript will appear here after processing</p>
                    </div>
                  )}
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
                      <div>
                        {transcript?.segments ? (
                          [...new Set(transcript.segments.map(s => s.speaker))].map((speaker, idx) => (
                            <Badge
                              key={speaker}
                              bg={idx === 0 ? 'primary' : idx === 1 ? 'success' : 'info'}
                              className="me-1"
                            >
                              {speaker}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <hr />

                  <div className="actions">
                    <h6 className="mb-3">Next Steps</h6>
                    <Button variant="primary" className="w-100 mb-2" onClick={handleGenerateSummary}>
                      <Sparkles size={18} className="me-2" />
                      Generate AI Summary
                    </Button>
                    <Button variant="outline-secondary" className="w-100 mb-2" onClick={() => api.downloadMarkdown(jobId)}>
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
                  {summary ? (
                    <div className="summary-content">
                      {summary.summary && (
                        <div className="mb-4">
                          <h6 className="mb-3">Summary</h6>
                          <p>{summary.summary}</p>
                        </div>
                      )}
                      {summary.key_points && summary.key_points.length > 0 && (
                        <div className="mb-4">
                          <h6 className="mb-3">Key Points</h6>
                          <ul>
                            {summary.key_points.map((point, idx) => (
                              <li key={idx}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {summary.action_items && summary.action_items.length > 0 && (
                        <div className="mb-4">
                          <h6 className="mb-3">Action Items</h6>
                          <ul>
                            {summary.action_items.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="summary-placeholder text-center text-muted py-5">
                      <Sparkles size={48} className="mb-3 opacity-50" />
                      <p>AI summary will appear here</p>
                    </div>
                  )}
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
                  <Button variant="outline-primary" className="w-100 mb-2" onClick={() => api.downloadPDF(jobId, selectedFile?.name || 'transcript')}>
                    <Download size={18} className="me-2" />
                    Download PDF
                  </Button>
                  <Button variant="outline-primary" className="w-100 mb-2" onClick={() => api.downloadMarkdown(jobId)}>
                    <Download size={18} className="me-2" />
                    Download Markdown
                  </Button>

                  <hr />

                  <Button variant="outline-secondary" className="w-100" onClick={handleStartNewMeeting}>
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
