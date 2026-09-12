import { useState, useEffect } from 'react';
import * as api from '../services/api';
import { normalizeTranscript } from '../utils/transcript';
import type { RecentJob } from '../types/api';
import type {
  HandleUpload,
  SetCurrentStep,
  SetError,
  SetJobId,
  SetSelectedFile,
  SetTranscriptWithColors,
} from '../types/ui';

/**
 * Custom hook for managing recent jobs history
 * Handles fetching, loading, and deleting jobs
 */
export default function useJobHistory(
  backendReady: boolean,
  setTranscriptWithColors: SetTranscriptWithColors,
  setCurrentStep: SetCurrentStep,
  setJobId: SetJobId,
  setSelectedFile: SetSelectedFile,
  setError: SetError,
  handleUpload: HandleUpload
) {
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Fetch recent jobs
  const fetchRecentJobs = async () => {
    try {
      setLoadingJobs(true);
      const response = await api.getJobs();

      // Convert jobs object to array
      const jobsArray: RecentJob[] = Object.entries(response.jobs || {}).map(([uuid, job]) => ({
        uuid,
        filename: job.file_name,
        status_code: job.status_code,
        created_at: job.created_at,
      }));

      // Sort by most recent (newest created_at first) and limit to 5
      const sortedJobs = jobsArray
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, 5);
      setRecentJobs(sortedJobs);
    } catch (err) {
      console.error('Failed to fetch recent jobs:', err);
      // Don't show error to user - recent jobs is optional feature
      // User can still upload new files even if history fails to load
    } finally {
      setLoadingJobs(false);
    }
  };

  // Fetch recent jobs on mount (only after backend is ready).
  // fetchRecentJobs sets a loading flag synchronously so the spinner shows
  // immediately; this one-shot data fetch is an intentional effect.
  useEffect(() => {
    if (!backendReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount with an immediate loading indicator
    fetchRecentJobs();
  }, [backendReady]);

  // Load a past job
  const handleLoadJob = async (job: RecentJob) => {
    try {
      setError(null);
      setJobId(job.uuid);
      setSelectedFile({ name: job.filename || 'Recording' });

      // Check if job is still processing
      if (job.status_code === 202 || job.status_code === '202') {
        setCurrentStep('processing');
        // Resume polling for this job
        handleUpload(null, job.uuid);
        return;
      }

      // Try to fetch transcript
      try {
        const transcriptData = await api.getTranscript(job.uuid);
        setTranscriptWithColors(normalizeTranscript(transcriptData));
        setCurrentStep('transcript');
      } catch (err) {
        // Transcript not found - might be incomplete job
        if ((err as Error).message?.includes('404')) {
          setError(
            'Transcript not found for this meeting. It may have been deleted or failed to process.'
          );
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load job');
    }
  };

  // Delete a job
  const handleDeleteJob = async (uuid: string) => {
    try {
      setError(null);
      await api.deleteJob(uuid);

      // Refresh the jobs list
      await fetchRecentJobs();
    } catch (err) {
      setError((err as Error).message || 'Failed to delete meeting');
    }
  };

  return {
    recentJobs,
    loadingJobs,
    fetchRecentJobs,
    handleLoadJob,
    handleDeleteJob,
  };
}
