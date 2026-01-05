import { useState, useRef } from 'react'
import * as api from '../services/api'

/**
 * Custom hook for file selection, drag-and-drop, and upload logic
 * Handles file input, drag events, and upload process
 */
export default function useFileUpload(setError, setCurrentStep, setProcessingProgress, setJobId, setTranscriptWithColors, startPolling) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSelectedFile(file)
      // Immediately show processing UI
      setCurrentStep('processing')
      setProcessingProgress(10)
      handleUpload(file)
    }
  }

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (uploading) return

    const file = e.dataTransfer.files[0]
    if (file) {
      setSelectedFile(file)
      setCurrentStep('processing')
      setProcessingProgress(10)
      handleUpload(file)
    }
  }

  // Handle file upload
  const handleUpload = async (file, existingUuid = null) => {
    setError(null)
    setUploading(true)
    setProcessingProgress(0)

    try {
      // If resuming an existing job, skip upload and start polling
      if (existingUuid) {
        setJobId(existingUuid)
        setCurrentStep('processing')
        setUploading(false)
        startPolling(existingUuid)
        return
      }

      // Upload new file
      const response = await api.uploadAudio(file)
      setJobId(response.uuid)

      // Backend returns 202 immediately and processes in background
      if (response.status_code === 202 || response.status_code === '202') {
        setCurrentStep('processing')
        setUploading(false)
        startPolling(response.uuid)
      } else if (response.status_code === 200 || response.status_code === '200') {
        // If somehow it completes immediately
        setUploading(false)
        setProcessingProgress(100)
        if (response.transcript) {
          setTranscriptWithColors(response.transcript)
          setTimeout(() => {
            setCurrentStep('transcript')
          }, 500)
        } else {
          setCurrentStep('processing')
          startPolling(response.uuid)
        }
      } else {
        // Fallback to polling
        setCurrentStep('processing')
        setUploading(false)
        startPolling(response.uuid)
      }
    } catch (err) {
      setError(err.message || 'Failed to upload file')
      setUploading(false)
      setCurrentStep('upload')
      setProcessingProgress(0)
    }
  }

  return {
    selectedFile,
    uploading,
    fileInputRef,
    handleFileSelect,
    handleDragOver,
    handleDrop,
    handleUpload,
    setSelectedFile
  }
}
