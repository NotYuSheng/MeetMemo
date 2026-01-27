import { Row, Col } from '@govtechsg/sgds-react';
import FileUploadCard from './FileUploadCard';
import RecordingCard from './RecordingCard';
import LiveAudioControls from './LiveAudioControls';
import RecentJobsList from './RecentJobsList';

export default function UploadView({
  uploading,
  selectedFile,
  fileInputRef,
  handleFileSelect,
  handleDragOver,
  handleDrop,
  recentJobs,
  loadingJobs,
  handleLoadJob,
  handleDeleteJob,
  onStartRecording,
  isRecording,
  selectedLanguage,
  onLanguageChange,
  setError,
}) {
  return (
    <Row className="justify-content-center">
      <Col lg={10}>
        <div className="text-center mb-4">
          <h2 className="mb-2">Start Your Meeting Transcription</h2>
          <p className="text-muted">
            Upload a recording or record live to get AI-powered transcription with speaker
            identification
          </p>
        </div>

        <Row className="g-4 mb-4">
          <Col md={6}>
            <FileUploadCard
              uploading={uploading}
              selectedFile={selectedFile}
              fileInputRef={fileInputRef}
              handleFileSelect={handleFileSelect}
              handleDragOver={handleDragOver}
              handleDrop={handleDrop}
              selectedLanguage={selectedLanguage}
              onLanguageChange={onLanguageChange}
            />
          </Col>

          <Col md={6}>
            <div className="d-flex flex-column h-100 gap-4">
              <RecordingCard onStartRecording={onStartRecording} isRecording={isRecording} />
              <LiveAudioControls onError={setError} />
            </div>
          </Col>
        </Row>

        <RecentJobsList
          recentJobs={recentJobs}
          loadingJobs={loadingJobs}
          handleLoadJob={handleLoadJob}
          handleDeleteJob={handleDeleteJob}
        />
      </Col>
    </Row>
  );
}
