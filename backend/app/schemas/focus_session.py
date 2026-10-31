"""Pydantic schemas for focus sessions."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SessionCreate(BaseModel):
    client_id: Optional[str] = None
    timer_mode: str
    target_seconds: int
    actual_seconds: int
    species_id: str
    started_at: datetime
    ended_at: datetime


class SessionResponse(BaseModel):
    id: int
    timer_mode: str
    target_seconds: int
    actual_seconds: int
    status: str
    species_id: str
    started_at: datetime
    ended_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class PlantedTreeResponse(BaseModel):
    id: int
    session_id: int
    species_id: str
    growth_stage: int
    grid_x: int
    grid_y: int
    planted_at: datetime

    class Config:
        from_attributes = True


class SessionCompleteResponse(BaseModel):
    session: SessionResponse
    tree: PlantedTreeResponse
