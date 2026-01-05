import { useState } from 'react'
import * as api from '../services/api'

/**
 * Custom hook for summary generation and editing
 * Handles AI summary generation and manual editing
 */
export default function useSummary(jobId, setCurrentStep, setError) {
  const [summary, setSummary] = useState(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [editingSummary, setEditingSummary] = useState('')
  const [showEditSummaryModal, setShowEditSummaryModal] = useState(false)

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

  // Open edit summary modal
  const handleEditSummary = () => {
    if (!summary?.summary) return
    setEditingSummary(summary.summary)
    setShowEditSummaryModal(true)
  }

  // Save edited summary
  const handleSaveSummary = async () => {
    if (!editingSummary || !jobId) return

    try {
      setError(null)

      // Call backend API to persist summary changes
      await api.updateSummary(jobId, editingSummary)

      // Update local summary state
      setSummary({
        ...summary,
        summary: editingSummary
      })
      setShowEditSummaryModal(false)
    } catch (err) {
      setError(err.message || 'Failed to update summary')
    }
  }

  return {
    summary,
    generatingSummary,
    editingSummary,
    setEditingSummary,
    showEditSummaryModal,
    setShowEditSummaryModal,
    handleGenerateSummary,
    handleEditSummary,
    handleSaveSummary
  }
}
