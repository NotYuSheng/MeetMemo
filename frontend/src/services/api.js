// API Service for MeetMemo Backend Communication

const API_BASE_URL = '/api/v1'

// Helper function for API calls
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('API Error:', error)
    throw error
  }
}

// Upload audio file
export async function uploadAudio(file, model = 'turbo') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('model', model)

  const response = await fetch(`${API_BASE_URL}/jobs`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`)
  }

  return await response.json()
}

// Get all jobs
export async function getJobs() {
  return await apiCall('/jobs')
}

// Get job status by UUID
export async function getJobStatus(uuid) {
  return await apiCall(`/jobs/${uuid}`)
}

// Get transcript
export async function getTranscript(uuid) {
  return await apiCall(`/jobs/${uuid}/transcript`)
}

// Identify speakers with AI
export async function identifySpeakers(uuid, context = null) {
  const body = context ? { context } : {}

  return await apiCall(`/jobs/${uuid}/speaker-identifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

// Update speaker names
export async function updateSpeakers(uuid, mapping) {
  return await apiCall(`/jobs/${uuid}/speakers`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mapping }),
  })
}

// Update transcript content
export async function updateTranscript(uuid, transcript) {
  return await apiCall(`/jobs/${uuid}/transcript`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transcript }),
  })
}

// Update summary content
export async function updateSummary(uuid, summary) {
  return await apiCall(`/jobs/${uuid}/summary`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ summary }),
  })
}

// Generate summary
export async function generateSummary(uuid, customPrompt = null) {
  const body = customPrompt
    ? { custom_prompt: customPrompt }
    : {}

  return await apiCall(`/jobs/${uuid}/summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

// Get summary - uses the same endpoint, returns generated summary
export async function getSummary(uuid) {
  return await apiCall(`/jobs/${uuid}/summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
}

// Download PDF
export async function downloadPDF(uuid, filename) {
  try {
    const url = `${API_BASE_URL}/jobs/${uuid}/exports/pdf`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`)
    }

    // Get the blob from the response
    const blob = await response.blob()

    // Create a download link
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${filename || 'transcript'}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)

    return { success: true }
  } catch (error) {
    console.error('PDF Download Error:', error)
    throw error
  }
}

// Download Markdown
export async function downloadMarkdown(uuid) {
  try {
    const url = `${API_BASE_URL}/jobs/${uuid}/exports/markdown`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`)
    }

    // Get the blob from the response
    const blob = await response.blob()

    // Create a download link
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `transcript_${uuid}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)

    return { success: true }
  } catch (error) {
    console.error('Markdown Download Error:', error)
    throw error
  }
}

// Download Transcript PDF (transcript only, no AI summary)
export async function downloadTranscriptPDF(uuid, filename) {
  try {
    const url = `${API_BASE_URL}/jobs/${uuid}/exports/transcript/pdf`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`)
    }

    // Get the blob from the response
    const blob = await response.blob()

    // Create a download link
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${filename || 'transcript'}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)

    return { success: true }
  } catch (error) {
    console.error('Transcript PDF Download Error:', error)
    throw error
  }
}

// Download Transcript Markdown (transcript only, no AI summary)
export async function downloadTranscriptMarkdown(uuid) {
  try {
    const url = `${API_BASE_URL}/jobs/${uuid}/exports/transcript/markdown`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`)
    }

    // Get the blob from the response
    const blob = await response.blob()

    // Create a download link
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `transcript_${uuid}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)

    return { success: true }
  } catch (error) {
    console.error('Transcript Markdown Download Error:', error)
    throw error
  }
}

// Delete job
export async function deleteJob(uuid) {
  return await apiCall(`/jobs/${uuid}`, {
    method: 'DELETE',
  })
}

// Health check
export async function healthCheck() {
  return await apiCall('/health')
}

// ============================================================================
// New Workflow Step APIs
// ============================================================================

// Start transcription step
export async function startTranscription(uuid, model = 'turbo') {
  return await apiCall(`/jobs/${uuid}/transcriptions?model_name=${model}`, {
    method: 'POST',
  })
}

// Get transcription data
export async function getTranscriptionData(uuid) {
  return await apiCall(`/jobs/${uuid}/transcriptions`)
}

// Start diarization step
export async function startDiarization(uuid) {
  return await apiCall(`/jobs/${uuid}/diarizations`, {
    method: 'POST',
  })
}

// Get diarization data
export async function getDiarizationData(uuid) {
  return await apiCall(`/jobs/${uuid}/diarizations`)
}

// Start alignment step
export async function startAlignment(uuid) {
  return await apiCall(`/jobs/${uuid}/alignments`, {
    method: 'POST',
  })
}
