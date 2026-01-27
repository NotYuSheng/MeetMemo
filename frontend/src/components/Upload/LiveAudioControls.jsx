import { useState } from 'react';
import { Card, Button, Form, Badge } from '@govtechsg/sgds-react';
import { Mic, MicOff, Settings, AlertCircle } from 'lucide-react';
import useLiveTranscription from '../../hooks/useLiveTranscription';

export default function LiveAudioControls({ onError }) {
  const [model, setModel] = useState('small');
  const [language, setLanguage] = useState('');
  const { isLive, transcript, audioLevel, startLive, stopLive } = useLiveTranscription(onError);

  const handleToggleLive = () => {
    if (isLive) {
      stopLive();
    } else {
      startLive(model, language || null);
    }
  };

  // Calculate meter height based on audio level (0 to 1)
  const meterLevel = Math.min(100, Math.floor(audioLevel * 1000));

  return (
    <Card className="h-100 shadow-sm border-0">
      <Card.Body className="d-flex flex-column">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <Card.Title className="mb-0 d-flex align-items-center">
            <Mic size={24} className="me-2 text-primary" />
            Live Transcription
          </Card.Title>
          {isLive && (
            <Badge bg="danger" className="pulse-animation">
              LIVE
            </Badge>
          )}
        </div>

        <p className="text-muted small mb-4">
          Transcribe your speech in real-time. Audio is processed locally using Whisper.
        </p>

        <div className="mb-4 bg-light p-3 rounded position-relative" style={{ minHeight: '120px' }}>
          {isLive ? (
            <>
              <div className="transcript-container" style={{ maxHeight: '100px', overflowY: 'auto' }}>
                <p className="mb-0">{transcript || 'Listening...'}</p>
              </div>
              <div 
                className="audio-meter mt-3" 
                style={{ 
                  height: '4px', 
                  width: '100%', 
                  background: '#e9ecef', 
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}
              >
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${meterLevel}%`, 
                    background: meterLevel > 50 ? '#dc3545' : '#198754',
                    transition: 'width 0.1s ease-out'
                  }}
                />
              </div>
            </>
          ) : (
            <div className="h-100 d-flex flex-column justify-content-center align-items-center text-muted">
              <MicOff size={32} className="mb-2 opacity-50" />
              <p className="small mb-0">Click "Start Live" to begin streaming</p>
            </div>
          )}
        </div>

        <div className="mt-auto">
          <div className="row g-2 mb-3">
            <div className="col-6">
              <Form.Group controlId="liveModel">
                <Form.Label className="small">Model</Form.Label>
                <Form.Select 
                  size="sm" 
                  value={model} 
                  onChange={(e) => setModel(e.target.value)}
                  disabled={isLive}
                >
                  <option value="tiny">Tiny (Fastest)</option>
                  <option value="base">Base</option>
                  <option value="small">Small (Balanced)</option>
                  <option value="medium">Medium</option>
                  <option value="turbo">Turbo (Accurate)</option>
                </Form.Select>
              </Form.Group>
            </div>
            <div className="col-6">
              <Form.Group controlId="liveLanguage">
                <Form.Label className="small">Language</Form.Label>
                <Form.Select 
                  size="sm" 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={isLive}
                >
                  <option value="">Auto-detect</option>
                  <option value="en">English</option>
                  <option value="zh">Chinese</option>
                  <option value="ms">Malay</option>
                  <option value="ta">Tamil</option>
                </Form.Select>
              </Form.Group>
            </div>
          </div>

          <Button 
            variant={isLive ? 'outline-danger' : 'primary'} 
            className="w-100 d-flex align-items-center justify-content-center py-2"
            onClick={handleToggleLive}
          >
            {isLive ? (
              <>
                <MicOff size={18} className="me-2" />
                Stop Live
              </>
            ) : (
              <>
                <Mic size={18} className="me-2" />
                Start Live Transcription
              </>
            )}
          </Button>
        </div>
      </Card.Body>
      <style>{`
        .pulse-animation {
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        .transcript-container::-webkit-scrollbar {
          width: 4px;
        }
        .transcript-container::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 2px;
        }
      `}</style>
    </Card>
  );
}
