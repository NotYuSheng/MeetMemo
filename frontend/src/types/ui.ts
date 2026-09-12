// Shared UI-layer callback/setter types threaded through hooks and components

import type { Dispatch, SetStateAction } from 'react';
import type { SelectedFile, Transcript, WorkflowStep } from './api';

export type SetError = Dispatch<SetStateAction<string | null>>;
export type SetCurrentStep = Dispatch<SetStateAction<WorkflowStep>>;
export type SetProcessingProgress = Dispatch<SetStateAction<number>>;
export type SetJobId = Dispatch<SetStateAction<string | null>>;
export type SetSelectedFile = Dispatch<SetStateAction<SelectedFile>>;
export type SetUploading = Dispatch<SetStateAction<boolean>>;

export type SetTranscriptWithColors = (transcript: Transcript | null) => void;
export type StartPolling = (uuid: string) => void;
export type AutoIdentifySpeakers = (uuid: string) => Promise<void>;
export type HandleUpload = (file: File | null, existingUuid?: string | null) => Promise<void>;
