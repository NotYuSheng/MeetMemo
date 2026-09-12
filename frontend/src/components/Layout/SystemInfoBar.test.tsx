import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SystemInfoBar from './SystemInfoBar';
import * as api from '../../services/api';
import type { SystemInfo } from '../../types/api';

vi.mock('../../services/api');

const gpuInfo: SystemInfo = {
  hardware_profile_requested: 'auto',
  resolved_profile: 'high',
  gpu_name: 'NVIDIA RTX 3060',
  vram_gb: 12,
  device: 'cuda:0',
  whisper_model_name: 'large-v3',
  compute_type: 'float16',
  pyannote_model_name: 'pyannote/speaker-diarization-community-1',
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SystemInfoBar', () => {
  it('renders the GPU, profile, and models once loaded', async () => {
    vi.mocked(api.getSystemInfo).mockResolvedValue(gpuInfo);
    render(<SystemInfoBar />);

    await waitFor(() => expect(screen.getByText(/NVIDIA RTX 3060/)).toBeInTheDocument());
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText(/whisper: large-v3/)).toBeInTheDocument();
    // Diarization model is shown by its short name, not the full HF path.
    expect(screen.getByText(/diarization: speaker-diarization-community-1/)).toBeInTheDocument();
  });

  it('shows CPU when no GPU is detected', async () => {
    vi.mocked(api.getSystemInfo).mockResolvedValue({
      ...gpuInfo,
      resolved_profile: 'cpu',
      gpu_name: null,
      vram_gb: null,
      device: 'cpu',
      whisper_model_name: 'base',
    });
    render(<SystemInfoBar />);

    await waitFor(() => expect(screen.getByText('CPU')).toBeInTheDocument());
    expect(screen.getByText('cpu')).toBeInTheDocument();
  });

  it('surfaces a fit warning when present', async () => {
    vi.mocked(api.getSystemInfo).mockResolvedValue({
      ...gpuInfo,
      vram_gb: 8,
      warnings: ['community-1 diarization is memory-hungry (~12 GB VRAM recommended)'],
    });
    render(<SystemInfoBar />);

    await waitFor(() => expect(screen.getByText(/memory-hungry/)).toBeInTheDocument());
  });

  it('renders every warning, not just the first', async () => {
    vi.mocked(api.getSystemInfo).mockResolvedValue({
      ...gpuInfo,
      warnings: ['first warning', 'second warning'],
    });
    render(<SystemInfoBar />);

    await waitFor(() => expect(screen.getByText(/first warning/)).toBeInTheDocument());
    expect(screen.getByText(/second warning/)).toBeInTheDocument();
  });

  it('renders nothing when /system is unavailable', async () => {
    vi.mocked(api.getSystemInfo).mockRejectedValue(new Error('404'));
    const { container } = render(<SystemInfoBar />);
    // Wait until the failed fetch has been attempted and settled, then confirm
    // the component stayed empty (info never set).
    await waitFor(() => expect(api.getSystemInfo).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
