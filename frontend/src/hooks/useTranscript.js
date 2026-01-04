import { useState } from 'react'
import * as api from '../services/api'
import { initializeSpeakerColors } from '../utils/speakerColors'

/**
 * Custom hook for transcript data management and editing
 * Handles transcript state and segment editing
 */
export default function useTranscript(jobId, setError) {
  const [transcript, setTranscript] = useState(null)
  const [editingSegment, setEditingSegment] = useState(null)
  const [showEditTextModal, setShowEditTextModal] = useState(false)

  // Helper function to set transcript and initialize speaker colors
  const setTranscriptWithColors = (transcriptData) => {
    setTranscript(transcriptData)
    if (transcriptData?.segments) {
      initializeSpeakerColors(transcriptData.segments)
    }
  }

  // Open edit text modal
  const handleEditText = (segment, index) => {
    setEditingSegment({ ...segment, index })
    setShowEditTextModal(true)
  }

  // Save edited segment text and speaker
  const handleSaveSegmentText = async () => {
    if (!editingSegment || !transcript || !jobId) return

    try {
      setError(null)

      const updatedSegments = [...transcript.segments]
      updatedSegments[editingSegment.index] = {
        ...updatedSegments[editingSegment.index],
        text: editingSegment.text,
        speaker: editingSegment.speaker
      }

      // Call backend API to persist transcript changes (including speaker reassignment)
      await api.updateTranscript(jobId, updatedSegments)

      setTranscriptWithColors({ ...transcript, segments: updatedSegments })
      setShowEditTextModal(false)
      setEditingSegment(null)
    } catch (err) {
      setError(err.message || 'Failed to update segment')
    }
  }

  return {
    transcript,
    setTranscriptWithColors,
    editingSegment,
    setEditingSegment,
    showEditTextModal,
    setShowEditTextModal,
    handleEditText,
    handleSaveSegmentText
  }
}
