import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import * as api from '../../services/api';
import type { SystemInfo } from '../../types/api';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

/**
 * Compact, read-only display of the backend's detected hardware and the
 * resolved ML profile. Renders nothing until (and unless) /system succeeds, so
 * it never disrupts the footer on older backends or in demo mode.
 */
export default function SystemInfoBar() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    if (DEMO_MODE) return;
    let cancelled = false;
    api
      .getSystemInfo()
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        // /system is optional; stay silent if the backend doesn't expose it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;

  const gpu = info.gpu_name
    ? `${info.gpu_name}${info.vram_gb ? ` · ${info.vram_gb} GB` : ''}`
    : 'CPU';
  const diarization = info.pyannote_model_name.split('/').pop() ?? info.pyannote_model_name;

  return (
    <div
      className="system-info-bar text-muted small mt-2"
      title="Detected hardware and active models"
    >
      <Cpu size={12} className="me-1" style={{ verticalAlign: '-2px' }} />
      <span>{gpu}</span>
      {' · '}
      <span>
        profile: <strong>{info.resolved_profile}</strong>
      </span>
      {' · '}
      <span>whisper: {info.whisper_model_name}</span>
      {' · '}
      <span>diarization: {diarization}</span>
      {info.warnings.map((warning) => (
        <span key={warning} className="text-warning d-block mt-1" role="status">
          ⚠ {warning}
        </span>
      ))}
    </div>
  );
}
