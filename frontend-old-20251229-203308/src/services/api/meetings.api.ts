/**
 * API module for meeting-related endpoints
 */

import { apiClient } from './client';
import {
  Meeting,
  MeetingDetail,
  UploadResponse,
  RenameMeetingRequest,
} from '../../types/api.types';
import { WhisperModel } from '../../types/meeting.types';

/**
 * Meetings API service
 */
export const meetingsApi = {
  /**
   * Fetches list of all meetings
   */
  async list(): Promise<Meeting[]> {
    const response = await apiClient.get<Meeting[]>('/jobs');
    return response.data;
  },

  /**
   * Fetches detailed information for a specific meeting
   */
  async get(uuid: string): Promise<MeetingDetail> {
    const response = await apiClient.get<MeetingDetail>(`/jobs/${uuid}`);
    return response.data;
  },

  /**
   * Uploads an audio file for transcription
   */
  async upload(file: File, model: WhisperModel = 'turbo'): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', model);

    const response = await apiClient.post<UploadResponse>('/jobs', formData, {
      // Don't set timeout for large file uploads
      // The client will handle this with default timeout
    });

    return response.data;
  },

  /**
   * Deletes a meeting
   */
  async delete(uuid: string): Promise<void> {
    await apiClient.delete<void>(`/jobs/${uuid}`);
  },

  /**
   * Renames a meeting
   */
  async rename(uuid: string, newName: string): Promise<MeetingDetail> {
    const requestBody: RenameMeetingRequest = { new_name: newName };
    const response = await apiClient.patch<MeetingDetail>(
      `/jobs/${uuid}/rename`,
      requestBody
    );
    return response.data;
  },
};
