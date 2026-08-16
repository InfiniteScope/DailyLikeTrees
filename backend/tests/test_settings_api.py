"""Settings API tests — defaults, partial updates, bool string storage.

Storage contract: values are persisted as strings; booleans as 'true'/'false'
(lowercase). Pydantic coerces them back to typed values on read.
"""


def test_settings_defaults(client):
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["theme"] == "light"
    assert data["master_volume"] == 80
    assert data["bgm_enabled"] is True
    assert data["dev_mode"] is False
    assert data["floating_ball_enabled"] is False


def test_partial_update_keeps_other_settings(client):
    resp = client.put("/api/settings", json={"theme": "dark"})
    assert resp.status_code == 200
    assert resp.json()["theme"] == "dark"

    data = client.get("/api/settings").json()
    assert data["theme"] == "dark"
    assert data["dev_mode"] is False  # untouched


def test_bool_settings_roundtrip(client):
    client.put("/api/settings", json={"dev_mode": True, "floating_ball_enabled": True})
    data = client.get("/api/settings").json()
    assert data["dev_mode"] is True
    assert data["floating_ball_enabled"] is True

    client.put("/api/settings", json={"dev_mode": False})
    data = client.get("/api/settings").json()
    assert data["dev_mode"] is False
    assert data["floating_ball_enabled"] is True  # stays


def test_update_persists_across_requests(client):
    client.put("/api/settings", json={"master_volume": 45, "default_species_id": "tree8"})
    data = client.get("/api/settings").json()
    assert data["master_volume"] == 45
    assert data["default_species_id"] == "tree8"
