import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportSidebar from './ExportSidebar';
import * as api from '../../services/api';

vi.mock('../../services/api');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ExportSidebar', () => {
  it('exports the summary PDF with the job id and filename', () => {
    render(
      <ExportSidebar
        jobId="job1"
        selectedFile={{ name: 'meeting.mp3' }}
        handleStartNewMeeting={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByText('Export PDF')[0]);
    expect(api.downloadPDF).toHaveBeenCalledWith('job1', 'meeting.mp3');
  });

  it('starts a new meeting via the handler', () => {
    const handleStartNewMeeting = vi.fn();
    render(
      <ExportSidebar
        jobId="job1"
        selectedFile={null}
        handleStartNewMeeting={handleStartNewMeeting}
      />
    );
    fireEvent.click(screen.getByText('Start New Meeting'));
    expect(handleStartNewMeeting).toHaveBeenCalled();
  });

  it('does not attempt a download when there is no job id', () => {
    render(<ExportSidebar jobId={null} selectedFile={null} handleStartNewMeeting={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Export PDF')[0]);
    expect(api.downloadPDF).not.toHaveBeenCalled();
  });
});
