/**
 * Check if the page is being accessed via HTTPS
 * @returns {boolean} True if protocol is HTTPS or localhost
 */
export const isSecureContext = () => {
  // HTTPS is required for getUserMedia except on localhost
  return (
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  )
}

/**
 * Check if browser supports audio recording
 * @returns {boolean} True if MediaRecorder and getUserMedia are supported
 */
export const isRecordingSupported = () => {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.MediaRecorder
  )
}

/**
 * Get recording unavailability reason
 * @returns {string|null} Reason why recording is unavailable, or null if available
 */
export const getRecordingUnavailableReason = () => {
  if (!isRecordingSupported()) {
    return 'Your browser does not support audio recording'
  }

  if (!isSecureContext()) {
    return 'Recording requires HTTPS. Please access this page via HTTPS to enable microphone access'
  }

  return null
}
