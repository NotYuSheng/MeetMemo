// API Service for MeetMemo Backend Communication

import {
  generatePDFFilename,
  generateMarkdownFilename,
  generateTranscriptPDFFilename,
  generateTranscriptMarkdownFilename,
} from '../utils/fileNaming';

const API_BASE_URL = '/api/v1';

/**
 * Enhanced error logging for API calls
 * Logs detailed error information to help with debugging
 */
function logApiError(method, endpoint, error, responseData = null) {
  const errorDetails = {
    timestamp: new Date().toISOString(),
    method,
    endpoint,
    error: error.message,
    stack: error.stack,
    responseData,
  };

  console.error('API Error Details:', errorDetails);

  // In production, you could send this to an error tracking service
  // Example: sendToErrorTrackingService(errorDetails);
}

/**
 * Categorize errors for better user messaging
 */
function categorizeError(response, error) {
  if (!response) {
    return {
      type: 'NETWORK_ERROR',
      message: 'Network error - please check your connection',
      userMessage: 'Unable to connect to the server. Please check your internet connection.',
    };
  }

  const status = response.status;

  if (status === 404) {
    return {
      type: 'NOT_FOUND',
      message: 'Resource not found',
      userMessage: 'The requested resource was not found.',
    };
  } else if (status === 401 || status === 403) {
    return {
      type: 'AUTHENTICATION_ERROR',
      message: 'Authentication failed',
      userMessage: 'You are not authorized to access this resource.',
    };
  } else if (status >= 400 && status < 500) {
    return {
      type: 'CLIENT_ERROR',
      message: `Client error: ${status}`,
      userMessage: 'Invalid request. Please try again.',
    };
  } else if (status >= 500) {
    return {
      type: 'SERVER_ERROR',
      message: `Server error: ${status}`,
      userMessage: 'Server error. Please try again later.',
    };
  }

  return {
    type: 'UNKNOWN_ERROR',
    message: error.message || 'An unknown error occurred',
    userMessage: 'An unexpected error occurred. Please try again.',
  };
}

// Helper function for API calls
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const method = options.method || 'GET';
  let response;

  try {
    console.log(`API Request: ${method} ${endpoint}`);

    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
      },
    });

    if (!response.ok) {
      // Try to get error details from response body
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }

      const errorCategory = categorizeError(response, new Error());
      const error = new Error(errorData?.detail || errorCategory.userMessage);
      error.status = response.status;
      error.category = errorCategory.type;
      error.responseData = errorData;

      logApiError(method, endpoint, error, errorData);
      throw error;
    }

    const data = await response.json();
    console.log(`API Response: ${method} ${endpoint} - Success`);
    return data;
  } catch (error) {
    // If error wasn't thrown by our code above, it's a network error
    if (!error.category) {
      const errorCategory = categorizeError(null, error);
      error.category = errorCategory.type;
      error.message = errorCategory.userMessage;
      logApiError(method, endpoint, error);
    }
    throw error;
  }
}

// Upload audio file
export async function uploadAudio(file, model = 'turbo') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);

  try {
    console.log('API Request: POST /jobs (File upload)');

    const response = await fetch(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }

      const errorCategory = categorizeError(response, new Error());
      const error = new Error(errorData?.detail || errorCategory.userMessage);
      error.status = response.status;
      error.category = errorCategory.type;
      error.responseData = errorData;

      logApiError('POST', '/jobs', error, errorData);
      throw error;
    }

    console.log('API Response: POST /jobs - Success');
    return await response.json();
  } catch (error) {
    if (!error.category) {
      const errorCategory = categorizeError(null, error);
      error.category = errorCategory.type;
      error.message = errorCategory.userMessage;
      logApiError('POST', '/jobs', error);
    }
    throw error;
  }
}

// Get all jobs
export async function getJobs() {
  return await apiCall('/jobs');
}

// Get job status by UUID
export async function getJobStatus(uuid) {
  return await apiCall(`/jobs/${uuid}`);
}

// Get transcript
export async function getTranscript(uuid) {
  return await apiCall(`/jobs/${uuid}/transcripts`);
}

// Identify speakers with AI
export async function identifySpeakers(uuid, context = null) {
  const body = context ? { context } : {};

  return await apiCall(`/jobs/${uuid}/speaker-identifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// Update speaker names
export async function updateSpeakers(uuid, mapping) {
  return await apiCall(`/jobs/${uuid}/speakers`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mapping }),
  });
}

// Update transcript content
export async function updateTranscript(uuid, transcript) {
  return await apiCall(`/jobs/${uuid}/transcripts`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transcript }),
  });
}

// Update summary content
export async function updateSummary(uuid, summary) {
  return await apiCall(`/jobs/${uuid}/summaries`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ summary }),
  });
}

// Generate summary
export async function generateSummary(uuid, customPrompt = null) {
  const body = customPrompt ? { custom_prompt: customPrompt } : {};

  return await apiCall(`/jobs/${uuid}/summaries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// Get summary - uses the same endpoint, returns generated summary
export async function getSummary(uuid) {
  return await apiCall(`/jobs/${uuid}/summaries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

// Download PDF (Summary + Transcript)
export async function downloadPDF(uuid, originalFilename) {
  try {
    const url = `${API_BASE_URL}/jobs/${uuid}/exports/pdf`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    // Get the blob from the response
    const blob = await response.blob();

    // Generate clean filename
    const filename = generatePDFFilename(originalFilename);

    // Create a download link
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true };
  } catch (error) {
    console.error('PDF Download Error:', error);
    throw error;
  }
}

// Download Markdown (Summary + Transcript)
export async function downloadMarkdown(uuid, originalFilename) {
  try {
    const url = `${API_BASE_URL}/jobs/${uuid}/exports/markdown`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    // Get the blob from the response
    const blob = await response.blob();

    // Generate clean filename
    const filename = generateMarkdownFilename(originalFilename);

    // Create a download link
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true };
  } catch (error) {
    console.error('Markdown Download Error:', error);
    throw error;
  }
}

// Download Transcript PDF (transcript only, no AI summary)
export async function downloadTranscriptPDF(uuid, originalFilename) {
  try {
    const url = `${API_BASE_URL}/jobs/${uuid}/exports/transcript/pdf`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    // Get the blob from the response
    const blob = await response.blob();

    // Generate clean filename
    const filename = generateTranscriptPDFFilename(originalFilename);

    // Create a download link
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true };
  } catch (error) {
    console.error('Transcript PDF Download Error:', error);
    throw error;
  }
}

// Download Transcript Markdown (transcript only, no AI summary)
export async function downloadTranscriptMarkdown(uuid, originalFilename) {
  try {
    const url = `${API_BASE_URL}/jobs/${uuid}/exports/transcript/markdown`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    // Get the blob from the response
    const blob = await response.blob();

    // Generate clean filename
    const filename = generateTranscriptMarkdownFilename(originalFilename);

    // Create a download link
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true };
  } catch (error) {
    console.error('Transcript Markdown Download Error:', error);
    throw error;
  }
}

// Delete job
export async function deleteJob(uuid) {
  return await apiCall(`/jobs/${uuid}`, {
    method: 'DELETE',
  });
}

// Health check
export async function healthCheck() {
  return await apiCall('/health');
}

// ============================================================================
// New Workflow Step APIs
// ============================================================================

// Start transcription step
export async function startTranscription(uuid, model = 'turbo') {
  return await apiCall(`/jobs/${uuid}/transcriptions?model_name=${model}`, {
    method: 'POST',
  });
}

// Get transcription data
export async function getTranscriptionData(uuid) {
  return await apiCall(`/jobs/${uuid}/transcriptions`);
}

// Start diarization step
export async function startDiarization(uuid) {
  return await apiCall(`/jobs/${uuid}/diarizations`, {
    method: 'POST',
  });
}

// Get diarization data
export async function getDiarizationData(uuid) {
  return await apiCall(`/jobs/${uuid}/diarizations`);
}

// Start alignment step
export async function startAlignment(uuid) {
  return await apiCall(`/jobs/${uuid}/alignments`, {
    method: 'POST',
  });
}

// Get audio stream URL for a job
export function getAudioUrl(uuid) {
  return `${API_BASE_URL}/jobs/${uuid}/audio`;
}
