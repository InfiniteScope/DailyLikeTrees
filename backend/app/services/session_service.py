"""Business logic for focus sessions — the core "complete → plant tree" flow."""

from datetime import datetime, date

from sqlalchemy.orm import Session

from ..models.focus_session import FocusSession
from ..models.tree import PlantedTree
from ..utils.growth import get_growth_stage


def _compute_time_filter_keys():
    """Compute all time-filter keys using server-local today (consistent with read path)."""
    today = date.today()
    iso_week = today.isocalendar()
    return {
        "today": today.isoformat(),
        "week": f"{iso_week[0]}-W{iso_week[1]:02d}",
        "month": today.strftime("%Y-%m"),
        "total": "total",
    }


def _assign_grid_position(db: Session, time_filter_key: str) -> tuple[int, int]:
    """Auto-assign the next available grid position.

    Trees are placed row by row, 8 per row, moving outward from center.
    """
    max_row = db.query(PlantedTree.grid_y).filter(
        PlantedTree.time_filter_key == time_filter_key
    ).order_by(PlantedTree.grid_y.desc()).first()

    if max_row is None:
        return (0, 0)  # first tree ever

    current_row = max_row[0]
    # Count trees in current row
    count_in_row = db.query(PlantedTree).filter(
        PlantedTree.time_filter_key == time_filter_key,
        PlantedTree.grid_y == current_row,
    ).count()

    COLS_PER_ROW = 8
    if count_in_row < COLS_PER_ROW:
        return (count_in_row, current_row)
    else:
        return (0, current_row + 1)


def create_session(db: Session, data: dict) -> dict:
    """Complete a focus session and plant a tree.

    This is the core transaction:
    1. Insert the focus session
    2. Calculate growth stage from actual duration
    3. Assign a grid position
    4. Insert the planted tree
    5. Return both records
    """
    # 0. Idempotency: a retried request must not plant a second tree
    client_id = data.get("client_id")
    if client_id:
        existing = db.query(FocusSession).filter(FocusSession.client_id == client_id).first()
        if existing:
            tree = (
                db.query(PlantedTree)
                .filter(PlantedTree.session_id == existing.id)
                .order_by(PlantedTree.id)
                .first()
            )
            return {"session": existing, "tree": tree}

    # 1. Create session
    session = FocusSession(
        client_id=client_id,
        timer_mode=data["timer_mode"],
        target_seconds=data["target_seconds"],
        actual_seconds=data["actual_seconds"],
        species_id=data["species_id"],
        started_at=data["started_at"],
        ended_at=data["ended_at"],
    )
    db.add(session)
    db.flush()  # get session.id

    # 2. Calculate growth stage
    duration_minutes = data["actual_seconds"] / 60.0
    growth_stage = get_growth_stage(duration_minutes)

    # 3. Assign grid position
    time_keys = _compute_time_filter_keys()
    grid_x, grid_y = _assign_grid_position(db, time_keys["today"])

    # 4. Create planted tree (one per time filter for now; store using 'today' key as primary)
    tree = PlantedTree(
        session_id=session.id,
        species_id=data["species_id"],
        growth_stage=growth_stage,
        grid_x=grid_x,
        grid_y=grid_y,
        time_filter_key=time_keys["today"],
        planted_at=data["ended_at"],
    )
    db.add(tree)

    # Also create entries for week/month/total views by duplicating with different filter keys
    # We use a single tree row but store the primary key; the API filters by time_filter_key
    # For simplicity, we create one tree per filter key so queries are straightforward
    for key_name in ["week", "month", "total"]:
        filter_tree = PlantedTree(
            session_id=session.id,
            species_id=data["species_id"],
            growth_stage=growth_stage,
            grid_x=grid_x,
            grid_y=grid_y,
            time_filter_key=time_keys[key_name],
            planted_at=data["ended_at"],
        )
        db.add(filter_tree)

    db.commit()
    db.refresh(session)
    db.refresh(tree)

    return {"session": session, "tree": tree}


def get_sessions(db: Session, limit: int = 20, offset: int = 0):
    """Get recent focus sessions."""
    sessions = (
        db.query(FocusSession)
        .order_by(FocusSession.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    total = db.query(FocusSession).count()
    return {"sessions": sessions, "total": total}
