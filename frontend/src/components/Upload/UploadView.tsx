import type { ChangeEvent, DragEvent, RefObject } from 'react';
import { Row, Col } from '@govtechsg/sgds-react';
import FileUploadCard from './FileUploadCard';
import RecordingCard from './RecordingCard';
import RecentJobsList from './RecentJobsList';
import type { RecentJob } from '../../types/api';

interface UploadViewProps {
  uploading: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  recentJobs: RecentJob[];
  loadingJobs: boolean;
  handleLoadJob: (job: RecentJob) => void;
  handleDeleteJob: (uuid: string) => Promise<void> | void;
  onStartRecording: () => void;
  isRecording: boolean;
  selectedLanguage: string | null;
  onLanguageChange: (language: string | null) => void;
}

export default function UploadView({
  uploading,
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
}: UploadViewProps) {
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

        <Row className="g-4">
          <Col md={6}>
            <FileUploadCard
              uploading={uploading}
              fileInputRef={fileInputRef}
              handleFileSelect={handleFileSelect}
              handleDragOver={handleDragOver}
              handleDrop={handleDrop}
              selectedLanguage={selectedLanguage}
              onLanguageChange={onLanguageChange}
            />
          </Col>

          <Col md={6}>
            <RecordingCard onStartRecording={onStartRecording} isRecording={isRecording} />
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
