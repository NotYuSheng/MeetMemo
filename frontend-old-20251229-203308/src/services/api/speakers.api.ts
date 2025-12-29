/**
 * API module for speaker identification and management
 */

import { apiClient } from './client';
import {
  SpeakerSuggestions,
  UpdateSpeakerMappingsRequest,
  IdentifySpeakersRequest,
  IdentifySpeakersResponse,
} from '../../types/api.types';
import { SpeakerMapping } from '../../types/transcript.types';

/**
 * Speakers API service
 */
export const speakersApi = {
  /**
   * Identifies speakers in a meeting using AI
   */
  async identify(uuid: string, context?: string): Promise<SpeakerSuggestions> {
    const requestBody: IdentifySpeakersRequest = context ? { context } : {};
    const response = await apiClient.post<IdentifySpeakersResponse>(
      `/jobs/${uuid}/identify-speakers`,
      requestBody
    );
    return response.data.speakers;
  },

  /**
   * Updates speaker name mappings for a meeting
   */
  async updateMappings(uuid: string, mappings: SpeakerMapping): Promise<void> {
    const requestBody: UpdateSpeakerMappingsRequest = {
      speaker_mappings: mappings,
    };
    await apiClient.patch<void>(`/jobs/${uuid}/speakers`, requestBody);
  },
};
