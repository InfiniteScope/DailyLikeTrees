"""Session API tests — the core "complete focus → plant tree" transaction.

Contract (see PROJECT.md §5.2):
  1 POST /api/sessions creates 1 FocusSession + 4 PlantedTree rows
    (today / week / month / total time_filter_keys).
  2 Growth stage derived from actual_seconds (14/29/59 thresholds).
  3 Grid positions assigned row-by-row, 8 columns per row.
"""

from datetime import datetime, timedelta


def session_payload(actual_seconds, species_id="tree1", timer_mode="countdown"):
    now = datetime.utcnow()
    return {
        "timer_mode": timer_mode,
        "target_seconds": actual_seconds,
        "actual_seconds": actual_seconds,
        "species_id": species_id,
        "started_at": (now - timedelta(seconds=actual_seconds)).isoformat(),
        "ended_at": now.isoformat(),
    }


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_complete_session_creates_four_tree_rows(client):
    resp = client.post("/api/sessions", json=session_payload(25 * 60))
    assert resp.status_code == 201

    data = resp.json()
    assert data["session"]["actual_seconds"] == 1500
    assert data["session"]["species_id"] == "tree1"
    assert data["tree"]["session_id"] == data["session"]["id"]
    # 25 minutes → sprout (stage 1)
    assert data["tree"]["growth_stage"] == 1

    # Every time filter must see exactly this one tree
    for filter_name in ("today", "week", "month", "total"):
        trees = client.get(f"/api/trees?filter={filter_name}").json()
        assert trees["stats"]["count"] == 1, f"filter={filter_name}"
        assert trees["trees"][0]["session_id"] == data["session"]["id"]


def test_growth_stage_mapping_across_sessions(client):
    cases = [
        (10 * 60, 0),   # seed
        (25 * 60, 1),   # sprout
        (45 * 60, 2),   # sapling
        (90 * 60, 3),   # mature
    ]
    for seconds, expected_stage in cases:
        resp = client.post("/api/sessions", json=session_payload(seconds))
        assert resp.status_code == 201
        assert resp.json()["tree"]["growth_stage"] == expected_stage


def test_grid_positions_row_by_row_eight_per_row(client):
    for _ in range(9):
        resp = client.post("/api/sessions", json=session_payload(60 * 60))
        assert resp.status_code == 201

    trees = client.get("/api/trees?filter=today").json()["trees"]
    assert len(trees) == 9
    # API sorts by (grid_y, grid_x)
    positions = [(t["grid_x"], t["grid_y"]) for t in trees]
    assert positions[:8] == [(x, 0) for x in range(8)]
    assert positions[8] == (0, 1)


def test_list_sessions_pagination(client):
    for i in range(3):
        client.post("/api/sessions", json=session_payload(600))

    resp = client.get("/api/sessions?limit=2&offset=1").json()
    assert resp["total"] == 3
    assert len(resp["sessions"]) == 2
