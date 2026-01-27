from fastapi import APIRouter
from .live import router as live_router

ws_router = APIRouter()
ws_router.include_router(live_router)
