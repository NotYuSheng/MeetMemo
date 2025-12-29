/**
 * Base API client with error handling and type safety
 */

import { ApiResponse, ApiError } from '../../types/api.types';
import { apiLogger } from '../../utils/logger';
import { API_BASE_URL } from '../../utils/constants';

/**
 * API client configuration
 */
interface ApiConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * API client class for making HTTP requests
 */
class ApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = {
      timeout: 30000, // 30 seconds default
      headers: {
        'Content-Type': 'application/json',
      },
      ...config,
    };
  }

  /**
   * Makes a GET request
   */
  async get<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * Makes a POST request
   */
  async post<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
      headers: {
        ...(body instanceof FormData ? {} : this.config.headers),
        ...options?.headers,
      },
    });
  }

  /**
   * Makes a PATCH request
   */
  async patch<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
      ...options,
      headers: {
        ...this.config.headers,
        ...options?.headers,
      },
    });
  }

  /**
   * Makes a DELETE request
   */
  async delete<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      ...options,
    });
  }

  /**
   * Generic request method
   */
  private async request<T>(endpoint: string, options: RequestInit): Promise<ApiResponse<T>> {
    const url = `${this.config.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      apiLogger.debug(`${options.method} ${endpoint}`, { url });

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return await this.handleResponse<T>(response);
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.handleError(error);
    }
  }

  /**
   * Handles HTTP response
   */
  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    let data: T;

    // Check if response has content
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    if (contentLength === '0' || !contentType) {
      // No content in response
      data = null as T;
    } else if (contentType?.includes('application/json')) {
      // Parse JSON response
      data = await response.json();
    } else if (contentType?.includes('application/pdf') || contentType?.includes('application/octet-stream')) {
      // Binary response (PDF, etc.)
      const blob = await response.blob();
      data = blob as T;
    } else {
      // Text response
      const text = await response.text();
      data = text as T;
    }

    if (!response.ok) {
      const error: ApiError = {
        message: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
        statusText: response.statusText,
        details: data,
      };

      apiLogger.error(`API Error: ${response.status}`, error as any);
      throw error;
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
    };
  }

  /**
   * Handles errors during request
   */
  private handleError(error: unknown): ApiError {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        apiLogger.error('Request timeout', error as any);
        return {
          message: 'Request timeout - the server took too long to respond',
          details: error,
        };
      }

      apiLogger.error('Request failed', error as any);
      return {
        message: error.message || 'Network error occurred',
        details: error,
      };
    }

    // Unknown error type
    apiLogger.error('Unknown error', { error } as any);
    return {
      message: 'An unknown error occurred',
      details: error,
    };
  }
}

/**
 * Default API client instance
 */
export const apiClient = new ApiClient({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export default ApiClient;
