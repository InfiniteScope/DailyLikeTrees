"""Todo API tests — CRUD, sort order, reorder, 404 handling."""


def test_todo_crud_flow(client):
    # Create
    resp = client.post("/api/todos", json={"content": "读十页书"})
    assert resp.status_code == 201
    todo = resp.json()
    assert todo["content"] == "读十页书"
    assert todo["completed"] == 0

    todo_id = todo["id"]

    # Update content
    resp = client.patch(f"/api/todos/{todo_id}", json={"content": "读二十页书"})
    assert resp.status_code == 200
    assert resp.json()["content"] == "读二十页书"

    # Update completed
    resp = client.patch(f"/api/todos/{todo_id}", json={"completed": 1})
    assert resp.status_code == 200
    assert resp.json()["completed"] == 1

    # List
    todos = client.get("/api/todos").json()
    assert len(todos) == 1
    assert todos[0]["id"] == todo_id

    # Delete → 204
    resp = client.delete(f"/api/todos/{todo_id}")
    assert resp.status_code == 204
    assert client.get("/api/todos").json() == []


def test_todo_append_uses_increasing_sort_order(client):
    a = client.post("/api/todos", json={"content": "a"}).json()
    b = client.post("/api/todos", json={"content": "b"}).json()
    c = client.post("/api/todos", json={"content": "c"}).json()

    orders = [a["sort_order"], b["sort_order"], c["sort_order"]]
    assert orders == sorted(orders)
    # get_todos returns in (sort_order, created_at) order
    assert [t["content"] for t in client.get("/api/todos").json()] == ["a", "b", "c"]


def test_todo_reorder(client):
    a = client.post("/api/todos", json={"content": "a"}).json()
    b = client.post("/api/todos", json={"content": "b"}).json()

    resp = client.put(
        "/api/todos/reorder",
        json={"items": [{"id": b["id"], "sort_order": 0.0}, {"id": a["id"], "sort_order": 1.0}]},
    )
    assert resp.status_code == 200
    assert [t["content"] for t in resp.json()] == ["b", "a"]


def test_todo_not_found_returns_404(client):
    assert client.get("/api/todos/9999").status_code in (404, 405)
    assert client.patch("/api/todos/9999", json={"content": "x"}).status_code == 404
    assert client.delete("/api/todos/9999").status_code == 404
