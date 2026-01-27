"""
WebSocket router for live transcription.
"""

import logging
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from dependencies import get_live_service
from services.live_service import LiveService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/transcribe/live")
async def websocket_endpoint(
    websocket: WebSocket, live_service: LiveService = Depends(get_live_service)
):
    """
    WebSocket endpoint for live transcription.

    Protocol:
    - Initial JSON message: {"type": "config", "model": "small", "language": "en"}
    - Continuous binary frames: Raw 16-bit PCM audio (16kHz, mono)
    - Response JSON: {"type": "partial", "text": "..."} or {"type": "final", "text": "...", "start": ..., "end": ...}
    """
    await websocket.accept()
    logger.info("WebSocket connection accepted for live transcription")

    try:
        while True:
            # Wait for data from the client
            message = await websocket.receive()

            if "text" in message:
                # Handle JSON control messages
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")

                    if msg_type == "config":
                        model = data.get("model")
                        language = data.get("language")
                        live_service.set_config(model=model, language=language)
                        logger.info(
                            f"Received config: model={model}, language={language}"
                        )
                    elif msg_type == "stop":
                        logger.info("Received stop message")
                        break
                except json.JSONDecodeError:
                    logger.warning("Received invalid JSON message")

            elif "bytes" in message:
                # Handle binary audio frames
                audio_data = message["bytes"]

                # Process audio and get transcript updates
                result = await live_service.process_audio(audio_data)

                if result:
                    await websocket.send_json(result)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        logger.info("Cleaning up WebSocket session")
        live_service.cleanup()
