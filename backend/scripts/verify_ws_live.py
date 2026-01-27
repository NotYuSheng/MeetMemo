import asyncio
import websockets
import json
import numpy as np


async def test_live_transcription():
    uri = "ws://127.0.0.1:8000/ws/transcribe/live"
    try:
        async with websockets.connect(uri, open_timeout=10) as websocket:
            print("Connected to WebSocket")

            # 1. Send Config
            config = {"type": "config", "model": "tiny", "language": "en"}
            await websocket.send(json.dumps(config))
            print("Sent config")

            # 2. Simulate audio (1 second of white noise)
            sample_rate = 16000
            duration = 1.0
            t = np.linspace(0, duration, int(sample_rate * duration))
            audio_data = (np.random.normal(0, 0.1, len(t)) * 32767).astype(np.int16)

            # Send in small chunks (100ms each)
            chunk_size = int(sample_rate * 0.1)
            for i in range(0, len(audio_data), chunk_size):
                chunk = audio_data[i : i + chunk_size]
                await websocket.send(chunk.tobytes())
                print(f"Sent audio chunk {i // chunk_size + 1}")
                await asyncio.sleep(0.1)

                # Check for responses
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                    print(f"Received: {response}")
                except asyncio.TimeoutError:
                    pass

            print("Closing connection")
            await websocket.send(json.dumps({"type": "stop"}))

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(test_live_transcription())
