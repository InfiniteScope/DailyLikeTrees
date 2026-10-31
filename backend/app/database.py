"""Database engine and session factory."""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_schema():
    """Apply additive migrations that create_all cannot handle."""
    inspector = inspect(engine)
    if "focus_sessions" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("focus_sessions")}
    if "client_id" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE focus_sessions ADD COLUMN client_id VARCHAR"))
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_focus_sessions_client_id "
            "ON focus_sessions (client_id)"
        ))


def init_db():
    """Create all tables. Called on app startup."""
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
