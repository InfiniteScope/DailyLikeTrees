"""Shared test fixtures — isolated in-memory SQLite per test."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture()
def db_factory():
    """Isolated in-memory SQLite engine shared by the whole test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def _factory():
        return TestingSession()

    yield _factory


@pytest.fixture()
def client(db_factory):
    """TestClient routing every request through the isolated database.

    The real app engine (backend/data.db) is never touched because all
    requests go through the overridden get_db dependency.
    """
    def override_get_db():
        db = db_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # Note: TestClient is NOT used as a context manager, so the app's
    # lifespan (which would create tables in the real data.db) never runs.
    yield TestClient(app)
    app.dependency_overrides.clear()
