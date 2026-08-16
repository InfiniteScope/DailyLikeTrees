"""Growth stage calculation tests — boundary values against the canonical thresholds.

Thresholds (minutes): 0-14→0, 15-29→1, 30-59→2, 60+→3.
These thresholds are duplicated in THREE places:
  backend/app/utils/growth.py
  frontend/src/services/localDb.ts
  frontend/src/utils/treeGrowth.ts
  → frontend symmetry is verified in frontend/test/localDb.test.ts
"""

import pytest

from app.utils.growth import get_growth_label, get_growth_stage


@pytest.mark.parametrize(
    "minutes,expected_stage",
    [
        (0, 0),   # seed
        (14, 0),  # boundary: still seed
        (15, 1),  # boundary: sprout
        (29, 1),  # boundary: still sprout
        (30, 2),  # boundary: sapling
        (59, 2),  # boundary: still sapling
        (60, 3),  # boundary: mature
        (120, 3), # deep mature
    ],
)
def test_growth_stage_thresholds(minutes, expected_stage):
    assert get_growth_stage(minutes) == expected_stage


def test_growth_stage_accepts_float_minutes():
    # 14.99 minutes already exceeds the 14-minute seed cap → sprout
    assert get_growth_stage(14.99) == 1
    assert get_growth_stage(29.99) == 2
    assert get_growth_stage(59.99) == 3


@pytest.mark.parametrize(
    "stage,label",
    [(0, "种子"), (1, "萌芽"), (2, "树苗"), (3, "大树")],
)
def test_growth_labels(stage, label):
    assert get_growth_label(stage) == label


def test_growth_label_unknown():
    assert get_growth_label(99) == "未知"
