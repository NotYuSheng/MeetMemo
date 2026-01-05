import { useState } from 'react'
import * as api from '../services/api'

/**
 * Custom hook for speaker identification and editing
 * Handles automatic speaker identification and manual speaker name editing
 */
export default function useSpeakerManagement(jobId, transcript, setTranscriptWithColors, setError) {
  const [identifyingSpeakers, setIdentifyingSpeakers] = useState(false)
  const [speakerSuggestions, setSpeakerSuggestions] = useState(null)
  const [editingSpeakers, setEditingSpeakers] = useState({})
  const [showEditSpeakersModal, setShowEditSpeakersModal] = useState(false)

  // Auto-identify speakers and apply valid names automatically
  const autoIdentifySpeakers = async (uuid) => {
    if (!uuid) return

    try {
      setIdentifyingSpeakers(true)
      const result = await api.identifySpeakers(uuid)

      if (result.status === 'success' && result.suggestions) {
        // Build mapping for speakers with valid identified names
        const speakerMapping = {}

        Object.entries(result.suggestions).forEach(([speakerLabel, suggestedName]) => {
          // Convert "Speaker 1" to SPEAKER_00, "Speaker 2" to SPEAKER_01, etc.
          const speakerNumber = parseInt(speakerLabel.replace('Speaker ', '')) - 1
          const speakerKey = `SPEAKER_${String(speakerNumber).padStart(2, '0')}`

          // Only auto-accept if a valid name/role was identified
          // Reject if the suggestion is generic/unclear (contains these keywords)
          const lowerSuggestion = (suggestedName || '').toLowerCase().trim()
          const isGeneric =
            !suggestedName ||
            lowerSuggestion.includes('speaker') ||
            lowerSuggestion.includes('unknown') ||
            lowerSuggestion.includes('cannot') ||
            lowerSuggestion.includes('not determined') ||
            lowerSuggestion.includes('not be determined') ||
            lowerSuggestion.includes('unclear') ||
            lowerSuggestion.includes('unidentified') ||
            lowerSuggestion === 'n/a' ||
            lowerSuggestion === '-'

          if (!isGeneric) {
            // Valid name/role identified - auto-apply it
            speakerMapping[speakerKey] = suggestedName
          }
          // For generic/undetermined speakers, don't add to mapping or suggestions
          // They will remain as SPEAKER_00, SPEAKER_01, etc.
        })

        // Auto-apply identified speaker names to backend
        if (Object.keys(speakerMapping).length > 0) {
          try {
            await api.updateSpeakers(uuid, speakerMapping)

            // Reload transcript to reflect updated speaker names
            const transcriptData = await api.getTranscript(uuid)
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
          } catch (err) {
            console.error('Failed to auto-apply speaker names:', err)
          }
        }
        // Undetermined speakers will remain as SPEAKER_00, SPEAKER_01, etc.
      }
    } catch (err) {
      console.error('Failed to auto-identify speakers:', err)
      // Don't show error to user - this is a background enhancement
    } finally {
      setIdentifyingSpeakers(false)
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

      // Call backend API to persist speaker name changes
      await api.updateSpeakers(jobId, editingSpeakers)

      // Update speaker names in the local transcript state
      const updatedSegments = transcript.segments.map(segment => ({
        ...segment,
        speaker: editingSpeakers[segment.speaker] || segment.speaker
      }))

      setTranscriptWithColors({ ...transcript, segments: updatedSegments })
      setShowEditSpeakersModal(false)
    } catch (err) {
      setError(err.message || 'Failed to update speakers')
    }
  }

  return {
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
    handleRejectSuggestion
  }
}
