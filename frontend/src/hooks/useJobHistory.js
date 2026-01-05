import { useState, useEffect } from 'react'
import * as api from '../services/api'
import { initializeSpeakerColors } from '../utils/speakerColors'

/**
 * Custom hook for managing recent jobs history
 * Handles fetching, loading, and deleting jobs
 */
export default function useJobHistory(backendReady, setTranscriptWithColors, setCurrentStep, setJobId, setSelectedFile, setError, handleUpload) {
  const [recentJobs, setRecentJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(false)

  // Fetch recent jobs
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

      // Sort by most recent and limit to 5
      const sortedJobs = jobsArray.slice(0, 5)
      setRecentJobs(sortedJobs)
    } catch (err) {
      console.error('Failed to fetch recent jobs:', err)
    } finally {
      setLoadingJobs(false)
    }
  }

  // Fetch recent jobs on mount (only after backend is ready)
  useEffect(() => {
    if (!backendReady) return
    fetchRecentJobs()
  }, [backendReady])

  // Load a past job
  const handleLoadJob = async (job) => {
    try {
      setError(null)
      setJobId(job.uuid)
      setSelectedFile({ name: job.filename || 'Recording' })

      // Check if job is still processing
      if (job.status_code === 202 || job.status_code === '202') {
        setCurrentStep('processing')
        // Resume polling for this job
        handleUpload(null, job.uuid)
        return
      }

      // Try to fetch transcript
      try {
        const transcriptData = await api.getTranscript(job.uuid)
        if (transcriptData.full_transcript && typeof transcriptData.full_transcript === 'string') {
          try {
            const parsed = JSON.parse(transcriptData.full_transcript)
            setTranscriptWithColors({ segments: parsed })
          } catch (e) {
            console.error('Failed to parse transcript:', e)
            setTranscriptWithColors(transcriptData)
          }
        } else {
          setTranscriptWithColors(transcriptData)
        }

        setCurrentStep('transcript')
      } catch (err) {
        // Transcript not found - might be incomplete job
        if (err.message?.includes('404')) {
          setError('Transcript not found for this meeting. It may have been deleted or failed to process.')
        } else {
          throw err
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load job')
    }
  }

  // Delete a job
  const handleDeleteJob = async (uuid, event) => {
    event.stopPropagation() // Prevent triggering the job load

    if (!window.confirm('Are you sure you want to delete this meeting? This action cannot be undone.')) {
      return
    }

    try {
      setError(null)
      await api.deleteJob(uuid)

      // Refresh the jobs list
      await fetchRecentJobs()
    } catch (err) {
      setError(err.message || 'Failed to delete meeting')
    }
  }

  return {
    recentJobs,
    loadingJobs,
    fetchRecentJobs,
    handleLoadJob,
    handleDeleteJob
  }
}
