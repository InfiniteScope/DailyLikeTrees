"""FocusSession ORM model."""

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime

from ..database import Base


class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(String, nullable=True, unique=True, index=True)  # idempotency key from client
    timer_mode = Column(String, nullable=False)      # 'countdown' | 'countup' | 'free'
    target_seconds = Column(Integer, nullable=False, default=0)
    actual_seconds = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="completed")  # 'completed' | 'abandoned'
    species_id = Column(String, nullable=False)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
