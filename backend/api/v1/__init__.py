"""
API v1 router registration.

This module registers all v1 API routers with their respective prefixes and tags.
"""
from fastapi import APIRouter

from api.v1 import (
    health,
    jobs,
    transcripts,
    summaries,
    speakers,
    exports,
    export_jobs
)

# Create v1 API router
api_router = APIRouter()

# Register all routers with their prefixes and tags
api_router.include_router(
    health.router,
    tags=["health"]
)

api_router.include_router(
    jobs.router,
    tags=["jobs"]
)

api_router.include_router(
    transcripts.router,
    tags=["transcripts"]
)

api_router.include_router(
    summaries.router,
    tags=["summaries"]
)

api_router.include_router(
    speakers.router,
    tags=["speakers"]
)

api_router.include_router(
    exports.router,
    tags=["exports"]
)

api_router.include_router(
    export_jobs.router,
    tags=["export-jobs"]
)
