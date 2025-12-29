// API Service for MeetMemo Backend Communication

const API_BASE_URL = '/api'

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
  return await apiCall(`/jobs/${uuid}/status`)
}

// Get transcript
export async function getTranscript(uuid) {
  return await apiCall(`/jobs/${uuid}/transcript`)
}

// Update speaker name (identify speakers endpoint)
export async function updateSpeaker(uuid, oldName, newName) {
  return await apiCall(`/jobs/${uuid}/identify-speakers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      old_speaker_name: oldName,
      new_speaker_name: newName,
    }),
  })
}

// Generate summary
export async function generateSummary(uuid, customPrompt = null) {
  const body = customPrompt
    ? { custom_prompt: customPrompt }
    : {}

  return await apiCall(`/jobs/${uuid}/summarise`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

// Get summary - uses the same endpoint, returns generated summary
export async function getSummary(uuid) {
  return await apiCall(`/jobs/${uuid}/summarise`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
}

// Download PDF
export async function downloadPDF(uuid, filename) {
  const response = await apiCall(`/jobs/${uuid}/pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename }),
  })
  // The backend should return a URL or blob
  if (response.url) {
    window.open(response.url, '_blank')
  }
  return response
}

// Download Markdown
export async function downloadMarkdown(uuid) {
  const response = await apiCall(`/jobs/${uuid}/markdown`, {
    method: 'POST',
  })
  // The backend should return a URL or blob
  if (response.url) {
    window.open(response.url, '_blank')
  }
  return response
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
