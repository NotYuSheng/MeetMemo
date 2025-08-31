# WebSocket Connection Issue - Persistent Problem

## Problem Description
The WebSocket connection consistently fails when trying to connect to live transcription due to IP resolution issues.

## Root Cause
The frontend uses `window.location.host` which resolves to `100.64.0.1` (Tailscale IP) instead of `localhost`, causing WebSocket connection failures.

## Error Pattern
```
Firefox can't establish a connection to the server at wss://100.64.0.1/live-transcription.
WebSocket error: Error: WebSocket connection failed
```

## Solution Applied
**First attempted fix (incorrect):** Tried to force localhost when detecting Tailscale IP, but this created CORS/origin issues.

**Correct fix:** Keep the same host to avoid origin mismatches, and ensure nginx properly routes to backend:

```javascript
const connectWebSocket = (model) => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Use the same host as the current page to avoid CORS/origin issues
  const host = window.location.host;
  const wsUrl = `${wsProtocol}//${host}/live-transcription`;
  // ...
};
```

**Additional fix:** Updated nginx configuration to route `/live-transcription` to `meetmemo-backend:8000/live-transcription` instead of `whisper-streaming:8080`.

## Why This Keeps Happening
1. User accesses the site via Tailscale IP (100.64.0.1)
2. Browser resolves `window.location.host` to this IP
3. WebSocket tries to connect to the Tailscale IP instead of localhost
4. Docker containers are configured for localhost networking, not Tailscale

## Prevention
- Always check WebSocket connection code when networking issues arise
- Consider using explicit localhost for local development
- Monitor for similar IP resolution issues in other parts of the app

## Current Status (Aug 31, 2025)
**✅ PROGRESS:** WebSocket connection issue RESOLVED
**❌ REMAINING:** Audio transcription not working - stuck on "Waiting for audio..." despite audio input detected

### What Works:
- WebSocket connects successfully (no more connection errors)
- Audio input detection and waveform visualization working
- Frontend shows audio levels and processing activity
- Backend receives WebSocket connections
- All Docker services running properly

### What Doesn't Work:
- Transcription stuck on "Waiting for audio..." message
- Backend not processing audio data into text transcription
- No transcription output despite audio being sent

### Next Steps for Investigation:
1. Check backend WebSocket message handling logic
2. Verify audio data format being sent vs expected format
3. Debug backend transcription processing pipeline
4. Check Whisper model initialization and processing

### Branch Information:
- **Branch:** `fix/live-transcription-websocket-partial`
- **Commit:** `2b1ce1c` - WebSocket connection fixes completed
- **Status:** Partial fix - connection works, transcription processing needs debugging

## Files Modified
- `frontend/src/components/LiveAudioControls.js` - WebSocket connection logic and audio processing
- `nginx/nginx.conf` - WebSocket routing configuration  
- `backend/main.py` - Temporarily disabled pyannote import
- `backend/requirements.txt` - Added missing dependencies
- `backend/Dockerfile` - Added build tools for compilation