/**
 * Logger utility for MeetMemo frontend
 * Provides structured logging for errors and API failures
 */
class Logger {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  /**
   * Log general errors
   * @param {string} message - Error message
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  error(message, error, context = {}) {
    if (this.isDevelopment) {
      console.error('[MeetMemo Error]', {
        message,
        error: error?.message || error,
        stack: error?.stack,
        context,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Log API-specific errors
   * @param {string} endpoint - API endpoint that failed
   * @param {Error} error - Error object
   * @param {Object} requestData - Request data that was sent
   */
  apiError(endpoint, error, requestData = {}) {
    const errorInfo = {
      type: 'API_ERROR',
      endpoint,
      error: error?.message || error,
      requestData,
      timestamp: new Date().toISOString(),
    };

    if (this.isDevelopment) {
      console.error('[MeetMemo API Error]', errorInfo);
    }
  }

  /**
   * Log warnings
   * @param {string} message - Warning message
   * @param {Object} context - Additional context
   */
  warn(message, context = {}) {
    if (this.isDevelopment) {
      console.warn('[MeetMemo Warning]', {
        message,
        context,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Log info messages
   * @param {string} message - Info message
   * @param {Object} context - Additional context
   */
  info(message, context = {}) {
    if (this.isDevelopment) {
      console.info('[MeetMemo Info]', {
        message,
        context,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

const logger = new Logger();
export default logger;