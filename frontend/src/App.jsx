import { useState } from 'react';
import { Container } from '@govtechsg/sgds-react';

// Custom Hooks
import useBackendHealth from './hooks/useBackendHealth';
import useJobHistory from './hooks/useJobHistory';
import useFileUpload from './hooks/useFileUpload';
import useAudioRecording from './hooks/useAudioRecording';
import useTranscriptPolling from './hooks/useTranscriptPolling';
import useTranscript from './hooks/useTranscript';
import useSpeakerManagement from './hooks/useSpeakerManagement';
import useSummary from './hooks/useSummary';

// Layout Components
import Header from './components/Layout/Header';
import WorkflowSteps from './components/Layout/WorkflowSteps';
import Footer from './components/Layout/Footer';

// Common Components
import LoadingScreen from './components/Common/LoadingScreen';
import ErrorAlert from './components/Common/ErrorAlert';

// View Components
import UploadView from './components/Upload/UploadView';
import ProcessingView from './components/Processing/ProcessingView';
import TranscriptView from './components/Transcript/TranscriptView';
import SummaryView from './components/Summary/SummaryView';

// Modal Components
import EditSpeakersModal from './components/Modals/EditSpeakersModal';
import EditTextModal from './components/Modals/EditTextModal';
import EditSummaryModal from './components/Modals/EditSummaryModal';
import RecordingModal from './components/Modals/RecordingModal';

import './App.css';

function App() {
  // Core application state
  const [currentStep, setCurrentStep] = useState('upload');
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState(null);

  // Backend health check
  const { backendReady, backendError } = useBackendHealth();

  // Transcript management
  const {
    transcript,
    setTranscriptWithColors,
    editingSegment,
    setEditingSegment,
    showEditTextModal,
    setShowEditTextModal,
    handleEditText,
    handleSaveSegmentText,
  } = useTranscript(jobId, setError);

  // Speaker management
  const {
    identifyingSpeakers,
    speakerSuggestions,
    editingSpeakers,
    setEditingSpeakers,
    showEditSpeakersModal,
    setShowEditSpeakersModal,
    autoIdentifySpeakers,
    handleEditSpeakers,
    handleSaveSpeakers,
    handleAcceptSuggestion,
    handleRejectSuggestion,
  } = useSpeakerManagement(jobId, transcript, setTranscriptWithColors, setError);

  // Transcript polling
  const { processingProgress, startPolling, stopPolling, setProcessingProgress } =
    useTranscriptPolling(setTranscriptWithColors, setCurrentStep, () => {}, autoIdentifySpeakers);

  // File upload
  const {
    selectedFile,
    uploading,
    fileInputRef,
    handleFileSelect,
    handleDragOver,
    handleDrop,
    handleUpload,
    setSelectedFile,
    selectedLanguage,
    setSelectedLanguage,
  } = useFileUpload(
    setError,
    setCurrentStep,
    setProcessingProgress,
    setJobId,
    setTranscriptWithColors,
    startPolling
  );

  // Audio recording
  const {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    cleanup: cleanupRecording,
  } = useAudioRecording(
    setError,
    setCurrentStep,
    setProcessingProgress,
    setJobId,
    setTranscriptWithColors,
    startPolling
  );

  // Job history
  const { recentJobs, loadingJobs, fetchRecentJobs, handleLoadJob, handleDeleteJob } =
    useJobHistory(
      backendReady,
      setTranscriptWithColors,
      setCurrentStep,
      setJobId,
      setSelectedFile,
      setError,
      handleUpload
    );

  // Summary management
  const {
    summary,
    generatingSummary,
    editingSummary,
    setEditingSummary,
    showEditSummaryModal,
    setShowEditSummaryModal,
    handleGenerateSummary,
    handleEditSummary,
    handleSaveSummary,
  } = useSummary(jobId, setCurrentStep, setError);

  // Start new meeting handler
  const handleStartNewMeeting = () => {
    stopPolling();
    cleanupRecording();
    setCurrentStep('upload');
    setSelectedFile(null);
    setJobId(null);
    setError(null);
    setProcessingProgress(0);
    fetchRecentJobs();
  };

  // Show loading screen while backend is initializing
  if (!backendReady && !backendError) {
    return <LoadingScreen backendError={backendError} />;
  }

  // Show error screen if backend failed to load
  if (backendError) {
    return <LoadingScreen backendError={backendError} />;
  }

  return (
    <div className="app">
      <Header onStartNewMeeting={handleStartNewMeeting} />
      <WorkflowSteps currentStep={currentStep} />

      <Container className="py-5">
        <ErrorAlert error={error} onClose={() => setError(null)} />

        {/* Step 1: Upload */}
        {currentStep === 'upload' && (
          <UploadView
            uploading={uploading}
            selectedFile={selectedFile}
            fileInputRef={fileInputRef}
            handleFileSelect={handleFileSelect}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            recentJobs={recentJobs}
            loadingJobs={loadingJobs}
            handleLoadJob={handleLoadJob}
            handleDeleteJob={handleDeleteJob}
            onStartRecording={startRecording}
            isRecording={isRecording}
            selectedLanguage={selectedLanguage}
            onLanguageChange={setSelectedLanguage}
          />
        )}

        {/* Step 2: Processing */}
        {currentStep === 'processing' && <ProcessingView processingProgress={processingProgress} />}

        {/* Step 3: Transcript */}
        {currentStep === 'transcript' && (
          <TranscriptView
            transcript={transcript}
            selectedFile={selectedFile}
            jobId={jobId}
            handleEditSpeakers={handleEditSpeakers}
            handleEditText={handleEditText}
            handleGenerateSummary={handleGenerateSummary}
            generatingSummary={generatingSummary}
            identifyingSpeakers={identifyingSpeakers}
          />
        )}

        {/* Step 4: Summary */}
        {currentStep === 'summary' && (
          <SummaryView
            summary={summary}
            transcript={transcript}
            selectedFile={selectedFile}
            jobId={jobId}
            handleEditSummary={handleEditSummary}
            handleStartNewMeeting={handleStartNewMeeting}
          />
        )}
      </Container>

      <Footer />

      {/* Modals */}
      <EditSpeakersModal
        show={showEditSpeakersModal}
        onHide={() => setShowEditSpeakersModal(false)}
        editingSpeakers={editingSpeakers}
        setEditingSpeakers={setEditingSpeakers}
        handleSaveSpeakers={handleSaveSpeakers}
        identifyingSpeakers={identifyingSpeakers}
        speakerSuggestions={speakerSuggestions}
        handleAcceptSuggestion={handleAcceptSuggestion}
        handleRejectSuggestion={handleRejectSuggestion}
      />

      <EditTextModal
        show={showEditTextModal}
        onHide={() => setShowEditTextModal(false)}
        editingSegment={editingSegment}
        setEditingSegment={setEditingSegment}
        handleSaveSegmentText={handleSaveSegmentText}
        transcript={transcript}
        editingSpeakers={editingSpeakers}
      />

      <EditSummaryModal
        show={showEditSummaryModal}
        onHide={() => setShowEditSummaryModal(false)}
        editingSummary={editingSummary}
        setEditingSummary={setEditingSummary}
        handleSaveSummary={handleSaveSummary}
      />

      <RecordingModal
        show={isRecording}
        onHide={() => {}}
        recordingTime={recordingTime}
        onStop={stopRecording}
      />
    </div>
  );
}

export default App;
