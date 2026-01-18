import { useRef, useState, useEffect, useCallback } from 'react';
import { Card, Button } from '@govtechsg/sgds-react';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from 'lucide-react';
import * as api from '../../services/api';
import { formatTime } from '../../utils/timeFormat';

/**
 * AudioPlayer component with playback controls and progress tracking.
 * Syncs with transcript segments via onTimeUpdate callback.
 */
export default function AudioPlayer({ jobId, onTimeUpdate, currentSegmentRef }) {
  const audioRef = useRef(null);
  const progressRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [volume, setVolume] = useState(1);

  // Get audio URL
  const audioUrl = jobId ? api.getAudioUrl(jobId) : null;

  // Handle audio metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoading(false);
    }
  }, []);

  // Handle time update during playback
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    }
  }, [onTimeUpdate]);

  // Handle audio ended
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Handle audio error
  const handleError = useCallback(() => {
    setError('Failed to load audio file');
    setIsLoading(false);
  }, []);

  // Handle can play
  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch((err) => {
          console.error('Playback failed:', err);
          setError('Playback failed. Please try again.');
        });
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Seek to specific time
  const seekTo = useCallback(
    (time) => {
      if (audioRef.current) {
        audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
      }
    },
    [duration]
  );

  // Handle progress bar click
  const handleProgressClick = useCallback(
    (e) => {
      if (progressRef.current && duration > 0) {
        const rect = progressRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const newTime = percentage * duration;
        seekTo(newTime);
      }
    },
    [duration, seekTo]
  );

  // Skip backward 10 seconds
  const skipBackward = useCallback(() => {
    seekTo(currentTime - 10);
  }, [currentTime, seekTo]);

  // Skip forward 10 seconds
  const skipForward = useCallback(() => {
    seekTo(currentTime + 10);
  }, [currentTime, seekTo]);

  // Handle volume change
  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    setIsMuted(newVolume === 0);
  }, []);

  // Expose seekTo method for external segment clicks
  useEffect(() => {
    if (currentSegmentRef) {
      currentSegmentRef.current = { seekTo };
    }
  }, [currentSegmentRef, seekTo]);

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!jobId) {
    return null;
  }

  return (
    <Card className="audio-player-card mb-3">
      <Card.Body className="p-3">
        <div className="audio-player">
          {/* Hidden audio element */}
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onError={handleError}
            onCanPlay={handleCanPlay}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          {/* Error display */}
          {error && <div className="audio-error text-danger small mb-2">{error}</div>}

          {/* Loading state */}
          {isLoading && !error && (
            <div className="audio-loading text-muted small mb-2">Loading audio...</div>
          )}

          {/* Progress bar */}
          <div
            ref={progressRef}
            className="audio-progress-container"
            onClick={handleProgressClick}
            role="slider"
            aria-label="Audio progress"
            aria-valuenow={currentTime}
            aria-valuemin={0}
            aria-valuemax={duration}
            tabIndex={0}
          >
            <div className="audio-progress-bar">
              <div className="audio-progress-fill" style={{ width: `${progressPercentage}%` }} />
              <div className="audio-progress-handle" style={{ left: `${progressPercentage}%` }} />
            </div>
          </div>

          {/* Time display */}
          <div className="audio-time-display d-flex justify-content-between mb-2">
            <small className="text-muted">{formatTime(currentTime)}</small>
            <small className="text-muted">{formatTime(duration)}</small>
          </div>

          {/* Controls */}
          <div className="audio-controls d-flex align-items-center justify-content-center gap-2">
            {/* Skip backward */}
            <Button
              variant="link"
              size="sm"
              className="audio-control-btn p-1"
              onClick={skipBackward}
              title="Skip back 10 seconds"
              disabled={isLoading}
            >
              <SkipBack size={18} />
            </Button>

            {/* Play/Pause */}
            <Button
              variant="primary"
              size="sm"
              className="audio-play-btn rounded-circle p-2"
              onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
              disabled={isLoading || !!error}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </Button>

            {/* Skip forward */}
            <Button
              variant="link"
              size="sm"
              className="audio-control-btn p-1"
              onClick={skipForward}
              title="Skip forward 10 seconds"
              disabled={isLoading}
            >
              <SkipForward size={18} />
            </Button>

            {/* Volume control */}
            <div className="audio-volume-control d-flex align-items-center ms-3">
              <Button
                variant="link"
                size="sm"
                className="audio-control-btn p-1"
                onClick={toggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </Button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="audio-volume-slider"
                aria-label="Volume"
              />
            </div>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
