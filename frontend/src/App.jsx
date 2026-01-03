import { useState, useRef, useEffect } from 'react'
import { Container, Row, Col, Card, Button, Badge, ProgressBar, Alert, Modal, Form } from '@govtechsg/sgds-react'
import { Mic, Upload as UploadIcon, FileText, Users, Sparkles, Download, Clock, CheckCircle, AlertCircle, Edit2, Check, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import * as api from './services/api'
import { getSpeakerBadgeVariant, getSpeakerBorderColor } from './utils/speakerColors'
import './App.css'

function App() {
  const [currentStep, setCurrentStep] = useState('upload') // upload, processing, transcript, summary
  const [processingProgress, setProcessingProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [transcript, setTranscript] = useState(null)
  const [summary, setSummary] = useState(null)
  const fileInputRef = useRef(null)

  // Modal states
  const [showEditSpeakersModal, setShowEditSpeakersModal] = useState(false)
  const [showEditTextModal, setShowEditTextModal] = useState(false)
  const [editingSpeakers, setEditingSpeakers] = useState({})
  const [editingSegment, setEditingSegment] = useState(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [recentJobs, setRecentJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [identifyingSpeakers, setIdentifyingSpeakers] = useState(false)
  const [speakerSuggestions, setSpeakerSuggestions] = useState(null)

  // Backend health check
  const [backendReady, setBackendReady] = useState(false)
  const [backendError, setBackendError] = useState(null)

  // Track which workflow steps have been started (to prevent race conditions)
  const workflowStepsStarted = useRef(new Set())

  // Check backend health on mount
  useEffect(() => {
    const checkBackendHealth = async () => {
      let retryCount = 0
      const maxRetries = 30 // 30 retries = 30 seconds

      while (retryCount < maxRetries) {
        try {
          await api.healthCheck()
          setBackendReady(true)
          setBackendError(null)
          return
        } catch (err) {
          retryCount++
          if (retryCount >= maxRetries) {
            setBackendError('Backend is not responding. Please check if the service is running.')
            return
          }
          // Wait 1 second before retrying
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }

    checkBackendHealth()
  }, [])

  // Fetch recent jobs on mount (only after backend is ready)
  useEffect(() => {
    if (!backendReady) return

    const fetchRecentJobs = async () => {
      try {
        setLoadingJobs(true)
        const response = await api.getJobs()

        // Convert jobs object to array
        const jobsArray = Object.entries(response.jobs || {}).map(([uuid, job]) => ({
          uuid,
          filename: job.file_name,
          status_code: job.status_code,
          created_at: job.created_at
        }))

        // Sort by most recent (you could also keep original order) and limit to 5
        const sortedJobs = jobsArray.slice(0, 5)
        setRecentJobs(sortedJobs)
      } catch (err) {
        console.error('Failed to fetch recent jobs:', err)
      } finally {
        setLoadingJobs(false)
      }
    }

    fetchRecentJobs()
  }, [backendReady])

  // Load a past job
  const handleLoadJob = async (job) => {
    try {
      setError(null)
      setJobId(job.uuid)

      // Fetch transcript
      const transcriptData = await api.getTranscript(job.uuid)
      if (transcriptData.full_transcript && typeof transcriptData.full_transcript === 'string') {
        try {
          const parsed = JSON.parse(transcriptData.full_transcript)
          setTranscript({ segments: parsed })
        } catch (e) {
          console.error('Failed to parse transcript:', e)
          setTranscript(transcriptData)
        }
      } else {
        setTranscript(transcriptData)
      }

      setSelectedFile({ name: job.filename || 'Recording' })
      setCurrentStep('transcript')
    } catch (err) {
      setError(err.message || 'Failed to load job')
    }
  }

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

  // Poll job status with workflow state tracking
  const startPolling = (uuid) => {
    // Reset the workflow steps tracker for this new job
    workflowStepsStarted.current = new Set()

    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getJobStatus(uuid)
        console.log('Workflow Debug:', {
          workflow_state: status.workflow_state,
          current_step_progress: status.current_step_progress,
          available_actions: status.available_actions,
          status_code: status.status_code
        })

        const workflowState = status.workflow_state || 'uploaded'
        const stepProgress = status.current_step_progress || 0

        // Update progress based on workflow state
        if (workflowState === 'uploaded') {
          setProcessingProgress(0)
          // Auto-start transcription (only once)
          if (!workflowStepsStarted.current.has('transcription')) {
            workflowStepsStarted.current.add('transcription')
            try {
              await api.startTranscription(uuid)
            } catch (err) {
              console.error('Failed to start transcription:', err)
              workflowStepsStarted.current.delete('transcription')
            }
          }
        } else if (workflowState === 'transcribing') {
          // Map transcription progress to 0-30%
          setProcessingProgress(Math.floor(stepProgress * 0.3))
        } else if (workflowState === 'transcribed') {
          setProcessingProgress(30)
          // Auto-start diarization (only once)
          if (!workflowStepsStarted.current.has('diarization')) {
            workflowStepsStarted.current.add('diarization')
            try {
              await api.startDiarization(uuid)
            } catch (err) {
              console.error('Failed to start diarization:', err)
              workflowStepsStarted.current.delete('diarization')
            }
          }
        } else if (workflowState === 'diarizing') {
          // Map diarization progress to 30-90%
          setProcessingProgress(30 + Math.floor(stepProgress * 0.6))
        } else if (workflowState === 'diarized') {
          setProcessingProgress(90)
          // Auto-start alignment (only once)
          if (!workflowStepsStarted.current.has('alignment')) {
            workflowStepsStarted.current.add('alignment')
            try {
              await api.startAlignment(uuid)
            } catch (err) {
              console.error('Failed to start alignment:', err)
              workflowStepsStarted.current.delete('alignment')
            }
          }
        } else if (workflowState === 'aligning') {
          // Map alignment progress to 90-100%
          setProcessingProgress(90 + Math.floor(stepProgress * 0.1))
        } else if (workflowState === 'completed') {
          clearInterval(pollInterval)
          setProcessingProgress(100)
          // Fetch the transcript
          const transcriptData = await api.getTranscript(uuid)
          if (transcriptData.full_transcript && typeof transcriptData.full_transcript === 'string') {
            try {
              const parsed = JSON.parse(transcriptData.full_transcript)
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
        } else if (workflowState === 'error' || status.status_code === '500' || status.status_code === 500) {
          clearInterval(pollInterval)
          const errorMsg = status.error_message || 'Processing failed. Please try again.'
          setError(errorMsg)
          setUploading(false)
          setCurrentStep('upload')
        }
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
      setGeneratingSummary(true)
      const summaryData = await api.generateSummary(jobId)
      setSummary(summaryData)
      setCurrentStep('summary')
    } catch (err) {
      setError(err.message || 'Failed to generate summary')
    } finally {
      setGeneratingSummary(false)
    }
  }

  // Open edit speakers modal
  const handleEditSpeakers = () => {
    if (!transcript?.segments) return

    // Get unique speakers
    const speakers = [...new Set(transcript.segments.map(s => s.speaker))]
    const speakerMap = {}
    speakers.forEach(speaker => {
      speakerMap[speaker] = speaker
    })

    setEditingSpeakers(speakerMap)
    setSpeakerSuggestions(null) // Clear previous suggestions
    setShowEditSpeakersModal(true)
  }

  // AI identify speakers
  const handleIdentifySpeakers = async () => {
    if (!jobId) return

    try {
      setError(null)
      setIdentifyingSpeakers(true)
      const result = await api.identifySpeakers(jobId)

      if (result.status === 'success' && result.suggestions) {
        setSpeakerSuggestions(result.suggestions)
        // Don't auto-fill - let user accept/reject suggestions individually
      }
    } catch (err) {
      setError(err.message || 'Failed to identify speakers')
    } finally {
      setIdentifyingSpeakers(false)
    }
  }

  // Accept a single speaker suggestion
  const handleAcceptSuggestion = (speakerLabel, suggestedName) => {
    // Convert "Speaker 1" to SPEAKER_00, "Speaker 2" to SPEAKER_01, etc.
    const speakerNumber = parseInt(speakerLabel.replace('Speaker ', '')) - 1
    const speakerKey = `SPEAKER_${String(speakerNumber).padStart(2, '0')}`

    if (editingSpeakers[speakerKey] !== undefined) {
      setEditingSpeakers({
        ...editingSpeakers,
        [speakerKey]: suggestedName
      })
    }
  }

  // Reject a single speaker suggestion (just dismiss it from the suggestions)
  const handleRejectSuggestion = (speakerLabel) => {
    const newSuggestions = { ...speakerSuggestions }
    delete newSuggestions[speakerLabel]

    // If no more suggestions, clear the suggestions state
    if (Object.keys(newSuggestions).length === 0) {
      setSpeakerSuggestions(null)
    } else {
      setSpeakerSuggestions(newSuggestions)
    }
  }

  // Save speaker names
  const handleSaveSpeakers = async () => {
    if (!jobId || !transcript) return

    try {
      setError(null)

      // Update speaker names in the transcript
      const updatedSegments = transcript.segments.map(segment => ({
        ...segment,
        speaker: editingSpeakers[segment.speaker] || segment.speaker
      }))

      setTranscript({ ...transcript, segments: updatedSegments })
      setShowEditSpeakersModal(false)
    } catch (err) {
      setError(err.message || 'Failed to update speakers')
    }
  }

  // Open edit text modal
  const handleEditText = (segment, index) => {
    setEditingSegment({ ...segment, index })
    setShowEditTextModal(true)
  }

  // Save edited segment text
  const handleSaveSegmentText = () => {
    if (!editingSegment || !transcript) return

    try {
      setError(null)

      const updatedSegments = [...transcript.segments]
      updatedSegments[editingSegment.index] = {
        ...updatedSegments[editingSegment.index],
        text: editingSegment.text
      }

      setTranscript({ ...transcript, segments: updatedSegments })
      setShowEditTextModal(false)
      setEditingSegment(null)
    } catch (err) {
      setError(err.message || 'Failed to update text')
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

  // Show loading screen while backend is initializing
  if (!backendReady && !backendError) {
    return (
      <div className="app d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Container>
          <Row className="justify-content-center">
            <Col md={6} className="text-center">
              <Card className="shadow-lg border-0">
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
    )
  }

  // Show error screen if backend failed to load
  if (backendError) {
    return (
      <div className="app d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Container>
          <Row className="justify-content-center">
            <Col md={6} className="text-center">
              <Card className="shadow-lg border-0">
                <Card.Body className="p-5">
                  <AlertCircle size={64} className="text-danger mb-4" />
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
    )
  }

  return (
    <div className="app">
      {/* Simple Header */}
      <div className="app-header">
        <Container>
          <div className="d-flex align-items-center justify-content-between py-3">
            <div
              className="d-flex align-items-center gap-3"
              style={{ cursor: 'pointer' }}
              onClick={handleStartNewMeeting}
            >
              <FileText size={32} className="text-primary" />
              <div>
                <h4 className="mb-0">MeetMemo</h4>
                <small className="text-muted">AI Meeting Transcription</small>
              </div>
            </div>
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
                          <div>
                            <div className="fw-medium">{job.filename || 'Untitled Recording'}</div>
                            <small className="text-muted">
                              {job.created_at ? new Date(job.created_at).toLocaleString() : 'Date unknown'}
                            </small>
                          </div>
                          <Badge bg={job.status_code === 200 || job.status_code === '200' ? 'success' : job.status_code === 202 || job.status_code === '202' ? 'warning' : 'secondary'}>
                            {job.status_code === 200 || job.status_code === '200' ? 'Complete' : job.status_code === 202 || job.status_code === '202' ? 'Processing' : 'Unknown'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted py-4">
                      <p className="mb-0">No recent meetings. Upload or record your first meeting to get started!</p>
                    </div>
                  )}
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
                    <div className={`processing-step ${processingProgress === 100 ? 'completed' : processingProgress >= 90 ? 'active' : ''}`}>
                      {processingProgress === 100 ? (
                        <CheckCircle size={20} className="text-success me-2" />
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

                  <div className="text-center">
                    <small className="text-muted">
                      This usually takes 2-3 minutes for a 10-minute recording
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
                    <Button variant="outline-primary" size="sm" onClick={handleEditSpeakers}>
                      <Users size={16} className="me-1" />
                      Edit Speakers
                    </Button>
                  </div>
                </Card.Header>
                <Card.Body>
                  {transcript && transcript.segments ? (
                    <div className="transcript-content">
                      {transcript.segments.map((segment, index) => (
                        <div key={index} className="transcript-segment mb-3 p-3 border-start border-3" style={{ borderColor: getSpeakerBorderColor(segment.speaker) }}>
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <Badge bg={getSpeakerBadgeVariant(segment.speaker)}>
                              {segment.speaker}
                            </Badge>
                            <div className="d-flex gap-2 align-items-center">
                              <small className="text-muted">
                                {Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, '0')} - {Math.floor(segment.end / 60)}:{String(Math.floor(segment.end % 60)).padStart(2, '0')}
                              </small>
                              <Button
                                variant="link"
                                size="sm"
                                className="text-muted p-0"
                                onClick={() => handleEditText(segment, index)}
                                title="Edit this segment"
                              >
                                <FileText size={14} />
                              </Button>
                            </div>
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
                          [...new Set(transcript.segments.map(s => s.speaker))].map((speaker) => (
                            <Badge
                              key={speaker}
                              bg={getSpeakerBadgeVariant(speaker)}
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
                    <Button
                      variant="primary"
                      className="w-100 mb-2"
                      onClick={handleGenerateSummary}
                      disabled={generatingSummary}
                    >
                      {generatingSummary ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} className="me-2" />
                          Generate AI Summary
                        </>
                      )}
                    </Button>
                    <Button variant="outline-secondary" className="w-100 mb-2" onClick={() => api.downloadMarkdown(jobId)}>
                      <Download size={18} className="me-2" />
                      Export Markdown
                    </Button>
                    <Button variant="outline-secondary" className="w-100 mb-2" onClick={() => api.downloadPDF(jobId, selectedFile?.name || 'transcript')}>
                      <Download size={18} className="me-2" />
                      Export PDF
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
                          <ReactMarkdown>{summary.summary}</ReactMarkdown>
                        </div>
                      )}
                      {summary.key_points && summary.key_points.length > 0 && (
                        <div className="mb-4">
                          <h6 className="mb-3">Key Points</h6>
                          <ul>
                            {summary.key_points.map((point, idx) => (
                              <li key={idx}><ReactMarkdown>{point}</ReactMarkdown></li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {summary.action_items && summary.action_items.length > 0 && (
                        <div className="mb-4">
                          <h6 className="mb-3">Action Items</h6>
                          <ul>
                            {summary.action_items.map((item, idx) => (
                              <li key={idx}><ReactMarkdown>{item}</ReactMarkdown></li>
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

      {/* Edit Speakers Modal */}
      <Modal show={showEditSpeakersModal} onHide={() => setShowEditSpeakersModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <Users size={20} className="me-2" />
            Edit Speaker Names
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex justify-content-between align-items-center mb-4">
            <p className="text-muted mb-0">
              Replace speaker labels with actual names. These changes will be reflected in the transcript and exports.
            </p>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={handleIdentifySpeakers}
              disabled={identifyingSpeakers}
            >
              {identifyingSpeakers ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Identifying...
                </>
              ) : (
                <>
                  <Sparkles size={16} className="me-2" />
                  AI Suggest
                </>
              )}
            </Button>
          </div>

          {/* AI Suggestions Section */}
          {speakerSuggestions && Object.keys(speakerSuggestions).length > 0 && (
            <div className="mb-4">
              <h6 className="mb-3">
                <Sparkles size={18} className="me-2" />
                AI Suggestions
              </h6>
              {Object.entries(speakerSuggestions).map(([speakerLabel, suggestedName]) => {
                const isUndetermined = suggestedName === 'Cannot be determined'
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
                )
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
          <Button variant="secondary" onClick={() => setShowEditSpeakersModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveSpeakers}>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Text Modal */}
      <Modal show={showEditTextModal} onHide={() => setShowEditTextModal(false)} size="lg">
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
                <Badge bg="primary" className="me-2">
                  {editingSegment.speaker}
                </Badge>
                <small className="text-muted">
                  {Math.floor(editingSegment.start / 60)}:{String(Math.floor(editingSegment.start % 60)).padStart(2, '0')} - {Math.floor(editingSegment.end / 60)}:{String(Math.floor(editingSegment.end % 60)).padStart(2, '0')}
                </small>
              </div>
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
          <Button variant="secondary" onClick={() => setShowEditTextModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveSegmentText}>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

export default App
