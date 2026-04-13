import asyncio
import websockets
import json

async def test():
    uri = "ws://localhost:8000/ws/machines"
    async with websockets.connect(uri) as ws:
        msg = await asyncio.wait_for(ws.recv(), timeout=5)
        data = json.loads(msg)
        print(f"Got {len(data)} machines")
        print(f"First machine: {data[0]}")

asyncio.run(test())