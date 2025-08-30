/**
 * Client-side logging utility with different log levels and structured error handling
 */

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN', 
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

class Logger {
  constructor(context = 'App') {
    this.context = context;
    this.enableConsoleLogging = process.env.NODE_ENV === 'development';
  }

  formatLogMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      context: this.context,
      message,
      ...(data && { data }),
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    return logEntry;
  }

  error(message, error = null, additionalData = {}) {
    const errorData = {
      ...additionalData,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...(error.response && {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          })
        }
      })
    };

    const logEntry = this.formatLogMessage(LOG_LEVELS.ERROR, message, errorData);
    
    if (this.enableConsoleLogging) {
      console.error(`[${this.context}] ${message}`, error || '', additionalData);
    }

    // In production, you could send this to a logging service
    this.sendToLoggingService(logEntry);
    
    return logEntry;
  }

  warn(message, data = {}) {
    const logEntry = this.formatLogMessage(LOG_LEVELS.WARN, message, data);
    
    if (this.enableConsoleLogging) {
      console.warn(`[${this.context}] ${message}`, data);
    }

    this.sendToLoggingService(logEntry);
    return logEntry;
  }

  info(message, data = {}) {
    const logEntry = this.formatLogMessage(LOG_LEVELS.INFO, message, data);
    
    if (this.enableConsoleLogging) {
      console.info(`[${this.context}] ${message}`, data);
    }

    this.sendToLoggingService(logEntry);
    return logEntry;
  }

  debug(message, data = {}) {
    const logEntry = this.formatLogMessage(LOG_LEVELS.DEBUG, message, data);
    
    if (this.enableConsoleLogging) {
      console.debug(`[${this.context}] ${message}`, data);
    }

    // Only send debug logs in development
    if (process.env.NODE_ENV === 'development') {
      this.sendToLoggingService(logEntry);
    }
    
    return logEntry;
  }

  // Placeholder for sending logs to external service
  // In production, replace this with actual logging service integration
  sendToLoggingService(logEntry) {
    if (process.env.NODE_ENV === 'development') {
      // Store in localStorage for development debugging
      try {
        const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
        logs.push(logEntry);
        // Keep only last 100 log entries
        if (logs.length > 100) {
          logs.splice(0, logs.length - 100);
        }
        localStorage.setItem('app_logs', JSON.stringify(logs));
      } catch (e) {
        console.warn('Failed to store log in localStorage:', e);
      }
    }
  }

  // Utility method to handle API errors consistently
  handleApiError(error, operation, additionalData = {}) {
    let userFriendlyMessage = 'An unexpected error occurred';
    let logMessage = `API Error during ${operation}`;

    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      logMessage = `API Error during ${operation}: ${status} ${error.response.statusText}`;
      
      switch (status) {
        case 400:
          userFriendlyMessage = 'Invalid request. Please check your input and try again.';
          break;
        case 401:
          userFriendlyMessage = 'Authentication required. Please refresh the page and try again.';
          break;
        case 403:
          userFriendlyMessage = 'Access denied. You don\'t have permission to perform this action.';
          break;
        case 404:
          userFriendlyMessage = 'The requested resource was not found.';
          break;
        case 413:
          userFriendlyMessage = 'File too large. Please choose a smaller file.';
          break;
        case 429:
          userFriendlyMessage = 'Too many requests. Please wait a moment and try again.';
          break;
        case 500:
          userFriendlyMessage = 'Server error. Please try again later.';
          break;
        case 502:
        case 503:
        case 504:
          userFriendlyMessage = 'Service temporarily unavailable. Please try again later.';
          break;
        default:
          userFriendlyMessage = `Request failed (${status}). Please try again.`;
      }
    } else if (error.request) {
      // Network error - no response received
      logMessage = `Network Error during ${operation}: No response received`;
      userFriendlyMessage = 'Network error. Please check your connection and try again.';
    } else {
      // Other error
      logMessage = `Error during ${operation}: ${error.message}`;
      userFriendlyMessage = error.message || userFriendlyMessage;
    }

    this.error(logMessage, error, { operation, ...additionalData });

    return {
      userFriendlyMessage,
      error,
      shouldRetry: error.response?.status >= 500 || !error.response
    };
  }

  // Method to get stored logs (useful for debugging)
  getLogs() {
    try {
      return JSON.parse(localStorage.getItem('app_logs') || '[]');
    } catch (e) {
      console.warn('Failed to retrieve logs from localStorage:', e);
      return [];
    }
  }

  // Clear stored logs
  clearLogs() {
    localStorage.removeItem('app_logs');
  }
}

// Export logger instances for different contexts
export const mainLogger = new Logger('MeetingApp');
export const apiLogger = new Logger('API');
export const audioLogger = new Logger('Audio');
export const pdfLogger = new Logger('PDF');

export default Logger;