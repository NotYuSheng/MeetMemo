/**
 * Client-side logging utility with different log levels and structured error handling
 */

/**
 * Log level enumeration
 */
export enum LogLevel {
  ERROR = "ERROR",
  WARN = "WARN",
  INFO = "INFO",
  DEBUG = "DEBUG",
}

/**
 * Structured log entry
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
  userAgent: string;
  url: string;
}

/**
 * Error object structure
 */
interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  status?: number;
  statusText?: string;
  data?: unknown;
}

/**
 * Error data structure with optional response info
 */
interface ErrorData {
  [key: string]: unknown;
  error?: ErrorDetails;
}

/**
 * API error object (from fetch or similar)
 */
interface ApiErrorObject {
  name: string;
  message: string;
  stack?: string;
  response?: {
    status: number;
    statusText: string;
    data?: unknown;
  };
  request?: unknown;
}

/**
 * Result from handleApiError
 */
interface ApiErrorHandlerResult {
  userFriendlyMessage: string;
  error: ApiErrorObject;
  shouldRetry: boolean;
}

/**
 * Logger class for structured logging
 */
class Logger {
  private context: string;
  private enableConsoleLogging: boolean;

  constructor(context: string = "App") {
    this.context = context;
    this.enableConsoleLogging = process.env.NODE_ENV === "development";
  }

  private formatLogMessage(
    level: LogLevel,
    message: string,
    data: unknown = null
  ): LogEntry {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      timestamp,
      level,
      context: this.context,
      message,
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    if (data) {
      logEntry.data = data;
    }

    return logEntry;
  }

  error(
    message: string,
    error: ApiErrorObject | null = null,
    additionalData: Record<string, unknown> = {}
  ): LogEntry {
    const errorData: ErrorData = {
      ...additionalData,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...(error.response && {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
          }),
        },
      }),
    };

    const logEntry = this.formatLogMessage(LogLevel.ERROR, message, errorData);

    if (this.enableConsoleLogging) {
      console.error(
        `[${this.context}] ${message}`,
        error || "",
        additionalData
      );
    }

    // In production, you could send this to a logging service
    this.sendToLoggingService(logEntry);

    return logEntry;
  }

  warn(message: string, data: Record<string, unknown> = {}): LogEntry {
    const logEntry = this.formatLogMessage(LogLevel.WARN, message, data);

    if (this.enableConsoleLogging) {
      console.warn(`[${this.context}] ${message}`, data);
    }

    this.sendToLoggingService(logEntry);
    return logEntry;
  }

  info(message: string, data: Record<string, unknown> = {}): LogEntry {
    const logEntry = this.formatLogMessage(LogLevel.INFO, message, data);

    if (this.enableConsoleLogging) {
      console.info(`[${this.context}] ${message}`, data);
    }

    this.sendToLoggingService(logEntry);
    return logEntry;
  }

  debug(message: string, data: Record<string, unknown> = {}): LogEntry {
    const logEntry = this.formatLogMessage(LogLevel.DEBUG, message, data);

    if (this.enableConsoleLogging) {
      console.debug(`[${this.context}] ${message}`, data);
    }

    // Only send debug logs in development
    if (process.env.NODE_ENV === "development") {
      this.sendToLoggingService(logEntry);
    }

    return logEntry;
  }

  /**
   * Placeholder for sending logs to external service
   * In production, replace this with actual logging service integration
   */
  private sendToLoggingService(logEntry: LogEntry): void {
    if (process.env.NODE_ENV === "development") {
      // Store in localStorage for development debugging
      try {
        const logs: LogEntry[] = JSON.parse(
          localStorage.getItem("app_logs") || "[]"
        );
        logs.push(logEntry);
        // Keep only last 100 log entries
        if (logs.length > 100) {
          logs.splice(0, logs.length - 100);
        }
        localStorage.setItem("app_logs", JSON.stringify(logs));
      } catch (e) {
        console.warn("Failed to store log in localStorage:", e);
      }
    }
  }

  /**
   * Utility method to handle API errors consistently
   * @param error - Error object from API call
   * @param operation - Description of the operation that failed
   * @param additionalData - Additional context data
   * @returns User-friendly error message and retry suggestion
   */
  handleApiError(
    error: ApiErrorObject,
    operation: string,
    additionalData: Record<string, unknown> = {}
  ): ApiErrorHandlerResult {
    let userFriendlyMessage = "An unexpected error occurred";
    let logMessage = `API Error during ${operation}`;

    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      logMessage = `API Error during ${operation}: ${status} ${error.response.statusText}`;

      switch (status) {
        case 400:
          userFriendlyMessage =
            "Invalid request. Please check your input and try again.";
          break;
        case 401:
          userFriendlyMessage =
            "Authentication required. Please refresh the page and try again.";
          break;
        case 403:
          userFriendlyMessage =
            "Access denied. You don't have permission to perform this action.";
          break;
        case 404:
          userFriendlyMessage = "The requested resource was not found.";
          break;
        case 413:
          userFriendlyMessage = "File too large. Please choose a smaller file.";
          break;
        case 429:
          userFriendlyMessage =
            "Too many requests. Please wait a moment and try again.";
          break;
        case 500:
          userFriendlyMessage = "Server error. Please try again later.";
          break;
        case 502:
        case 503:
          userFriendlyMessage =
            "Service temporarily unavailable. Please try again later.";
          break;
        case 504:
          userFriendlyMessage =
            "Processing timeout - your file may be taking longer than expected. Large audio files can take several minutes to process. Please try again or use a smaller file.";
          // Extra logging for 504 timeouts since they're common with large files
          console.warn(
            "🔄 TIMEOUT: Audio processing took too long. This usually happens with large files (>30MB). Server timeouts have been increased to 6 hours."
          );
          break;
        default:
          userFriendlyMessage = `Request failed (${status}). Please try again.`;
      }
    } else if (error.request) {
      // Network error - no response received
      logMessage = `Network Error during ${operation}: No response received`;
      userFriendlyMessage =
        "Network error. Please check your connection and try again.";
    } else {
      // Other error
      logMessage = `Error during ${operation}: ${error.message}`;
      userFriendlyMessage = error.message || userFriendlyMessage;
    }

    this.error(logMessage, error, { operation, ...additionalData });

    return {
      userFriendlyMessage,
      error,
      shouldRetry: (error.response?.status ?? 0) >= 500 || !error.response,
    };
  }

  /**
   * Method to get stored logs (useful for debugging)
   * @returns Array of log entries
   */
  getLogs(): LogEntry[] {
    try {
      return JSON.parse(localStorage.getItem("app_logs") || "[]");
    } catch (e) {
      console.warn("Failed to retrieve logs from localStorage:", e);
      return [];
    }
  }

  /**
   * Clear stored logs
   */
  clearLogs(): void {
    localStorage.removeItem("app_logs");
  }
}

// Export logger instances for different contexts
export const mainLogger = new Logger("MeetingApp");
export const apiLogger = new Logger("API");
export const audioLogger = new Logger("Audio");
export const pdfLogger = new Logger("PDF");

export default Logger;
