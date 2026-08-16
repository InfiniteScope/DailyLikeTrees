"""Trees API tests — filter-key conversion, stats, cascading delete.

Contract (see PROJECT.md §5.2, §8):
  - Named filters (today|week|month|total) are converted to DB keys server-side.
  - One session = 4 tree rows; deleting by ANY filter must remove all 4 rows
    plus the parent sessions (historical bug: clearing "today" left week/month
    counts intact).
  - total_minutes = sum(actual_seconds) // 60 across the filter's sessions.
"""

import re
from datetime import datetime, timedelta

from app.models.focus_session import FocusSession
from app.models.tree import PlantedTree
from app.routers.trees import _compute_filter_key
from app.services import tree_service
from app.utils.growth import get_growth_stage

from tests.test_session_api import session_payload


# ── filter-key conversion ──

def test_filter_key_formats():
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", _compute_filter_key("today"))
    assert re.fullmatch(r"\d{4}-W\d{2}", _compute_filter_key("week"))
    assert re.fullmatch(r"\d{4}-\d{2}", _compute_filter_key("month"))
    assert _compute_filter_key("total") == "total"


def test_invalid_filter_falls_back_to_today(client):
    client.post("/api/sessions", json=session_payload(600))
    named = client.get("/api/trees?filter=whatever").json()
    fallback = client.get("/api/trees?filter=today").json()
    assert named["stats"]["count"] == fallback["stats"]["count"] == 1


# ── stats ──

def test_stats_total_minutes(client):
    for seconds in (30 * 60, 60 * 60, 10 * 60):
        client.post("/api/sessions", json=session_payload(seconds))

    trees = client.get("/api/trees?filter=today").json()
    assert trees["stats"]["count"] == 3
    assert trees["stats"]["total_minutes"] == 100  # 30 + 60 + 10


def test_stats_zero_for_empty_filter(client):
    trees = client.get("/api/trees?filter=month").json()
    assert trees["stats"] == {"count": 0, "total_minutes": 0}
    assert trees["trees"] == []


# ── cascading delete ──

def test_delete_by_today_cascades_all_filters_and_sessions(client):
    for _ in range(2):
        client.post("/api/sessions", json=session_payload(25 * 60))

    resp = client.delete("/api/trees?filter=today")
    assert resp.status_code == 200
    # 2 sessions × 4 rows = 8 tree rows deleted
    assert resp.json()["deleted"] == 8

    for filter_name in ("today", "week", "month", "total"):
        trees = client.get(f"/api/trees?filter={filter_name}").json()
        assert trees["stats"]["count"] == 0, f"filter={filter_name}"

    # Parent sessions removed too
    sessions = client.get("/api/sessions").json()
    assert sessions["total"] == 0


def test_delete_mixed_sessions_only_removes_matching(client, db_factory):
    """Cascading delete must only touch sessions matching the filter key.

    API-created sessions always land in the current day's bucket (keys are
    computed from server date at insert time), so we inject an older session
    directly via the service layer to simulate an "old bucket" scenario.
    """
    client.post("/api/sessions", json=session_payload(600))

    db = db_factory()
    old_date = datetime.utcnow() - timedelta(days=5)
    old_iso = old_date.date().isoformat()
    old_week = f"{old_date.isocalendar()[0]}-W{old_date.isocalendar()[1]:02d}"
    old_month = old_date.strftime("%Y-%m")

    old_session = FocusSession(
        timer_mode="countdown", target_seconds=600, actual_seconds=600,
        status="completed", species_id="tree1",
        started_at=old_date, ended_at=old_date,
    )
    db.add(old_session)
    db.flush()

    for key in (old_iso, old_week, old_month, "total"):
        db.add(PlantedTree(
            session_id=old_session.id, species_id="tree1",
            growth_stage=get_growth_stage(10), grid_x=0, grid_y=0,
            time_filter_key=key, planted_at=old_date,
        ))
    db.commit()

    # Deleting by the OLD day key removes only the old session (4 rows)
    deleted = tree_service.delete_trees_by_filter(db, old_iso)
    assert deleted == 4

    # Today's session survives intact
    today_count = client.get("/api/trees?filter=today").json()["stats"]["count"]
    assert today_count == 1
    # Old session's "total" row was cascade-deleted; only today's row remains
    total_count = client.get("/api/trees?filter=total").json()["stats"]["count"]
    assert total_count == 1
    db.close()


def test_delete_empty_filter_returns_zero(client):
    resp = client.delete("/api/trees?filter=total")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 0
