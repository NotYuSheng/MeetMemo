import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RecentJobsList from './RecentJobsList';
import type { RecentJob } from '../../types/api';

const jobs: RecentJob[] = [
  { uuid: 'u1', filename: 'standup.mp3', status_code: 200, created_at: '2024-01-01T10:00:00Z' },
  { uuid: 'u2', filename: 'retro.wav', status_code: 202, created_at: '2024-01-02T10:00:00Z' },
];

describe('RecentJobsList', () => {
  it('shows a loading state', () => {
    render(
      <RecentJobsList
        recentJobs={[]}
        loadingJobs
        handleLoadJob={vi.fn()}
        handleDeleteJob={vi.fn()}
      />
    );
    expect(screen.getByText(/loading recent meetings/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no jobs', () => {
    render(
      <RecentJobsList
        recentJobs={[]}
        loadingJobs={false}
        handleLoadJob={vi.fn()}
        handleDeleteJob={vi.fn()}
      />
    );
    expect(screen.getByText(/no recent meetings/i)).toBeInTheDocument();
  });

  it('renders each job and loads one when its row is clicked', () => {
    const handleLoadJob = vi.fn();
    render(
      <RecentJobsList
        recentJobs={jobs}
        loadingJobs={false}
        handleLoadJob={handleLoadJob}
        handleDeleteJob={vi.fn()}
      />
    );

    expect(screen.getByText('standup.mp3')).toBeInTheDocument();
    expect(screen.getByText('retro.wav')).toBeInTheDocument();

    fireEvent.click(screen.getByText('standup.mp3'));
    expect(handleLoadJob).toHaveBeenCalledWith(jobs[0]);
  });

  it('confirms before deleting a job', async () => {
    const handleDeleteJob = vi.fn().mockResolvedValue(undefined);
    render(
      <RecentJobsList
        recentJobs={jobs}
        loadingJobs={false}
        handleLoadJob={vi.fn()}
        handleDeleteJob={handleDeleteJob}
      />
    );

    // Deleting requires confirming in the modal first.
    fireEvent.click(screen.getAllByTitle('Delete this meeting')[0]);
    expect(screen.getByText('Delete Meeting')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handleDeleteJob).toHaveBeenCalledWith('u1');
  });
});
