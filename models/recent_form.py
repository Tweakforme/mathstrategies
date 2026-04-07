"""
Recent Form Features
=====================
Calculates per-fighter recent performance metrics:
- Last 3 / last 5 fight win rates
- Current win/loss streak
- Days since last fight (rust factor)
- Finish rate in recent fights
"""

import logging
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
import os

log = logging.getLogger(__name__)


def compute_recent_form(conn=None) -> pd.DataFrame:
    """
    For every fighter, compute form metrics based on their fight history.
    Returns DataFrame indexed by fighter_id.
    """
    db_url = os.getenv("DATABASE_URL").replace("postgresql://", "postgresql+psycopg2://")
    engine = create_engine(db_url)

    sql = """
        SELECT
            f.fighter1_id AS fighter_id,
            f.winner_id,
            f.fighter1_id,
            f.fighter2_id,
            f.method,
            e.date AS fight_date
        FROM fights f
        JOIN events e ON e.id = f.event_id
        WHERE f.winner_id IS NOT NULL
          AND f.winner_id != ''
        UNION ALL
        SELECT
            f.fighter2_id AS fighter_id,
            f.winner_id,
            f.fighter1_id,
            f.fighter2_id,
            f.method,
            e.date AS fight_date
        FROM fights f
        JOIN events e ON e.id = f.event_id
        WHERE f.winner_id IS NOT NULL
          AND f.winner_id != ''
        ORDER BY fighter_id, fight_date ASC
    """

    with engine.connect() as c:
        df = pd.read_sql(text(sql), c)

    log.info("Computing recent form from %d fight records", len(df))

    results = []

    for fighter_id, group in df.groupby("fighter_id"):
        group = group.sort_values("fight_date").reset_index(drop=True)

        wins = (group["winner_id"] == group["fighter_id"]).astype(int).tolist()
        methods = group["method"].tolist()
        dates = pd.to_datetime(group["fight_date"]).tolist()

        # Last 3 win rate
        last3 = wins[-3:] if len(wins) >= 3 else wins
        win_rate_l3 = np.mean(last3) if last3 else 0.5

        # Last 5 win rate
        last5 = wins[-5:] if len(wins) >= 5 else wins
        win_rate_l5 = np.mean(last5) if last5 else 0.5

        # Current streak (positive = win streak, negative = loss streak)
        streak = 0
        for w in reversed(wins):
            if len(wins) == 0:
                break
            if streak == 0:
                streak = 1 if w else -1
            elif (streak > 0 and w) or (streak < 0 and not w):
                streak += (1 if w else -1)
            else:
                break

        # Finish rate in last 5
        last5_methods = methods[-5:] if len(methods) >= 5 else methods
        last5_wins_idx = [i for i, w in enumerate(wins[-len(last5_methods):]) if w]
        finish_count = sum(
            1 for i in last5_wins_idx
            if i < len(last5_methods) and last5_methods[i] and
               ("KO" in str(last5_methods[i]).upper() or "SUB" in str(last5_methods[i]).upper())
        )
        recent_finish_rate = finish_count / max(len(last5_wins_idx), 1) if last5_wins_idx else 0.0

        # Days since last fight (rust factor)
        if dates:
            last_fight = dates[-1]
            today = pd.Timestamp.today()
            days_inactive = (today - last_fight).days
        else:
            days_inactive = 365  # default: 1 year inactive

        results.append({
            "fighter_id":         fighter_id,
            "win_rate_last3":     win_rate_l3,
            "win_rate_last5":     win_rate_l5,
            "current_streak":     streak,
            "recent_finish_rate": recent_finish_rate,
            "days_inactive":      days_inactive,
            "total_ufc_fights":   len(wins),
        })

    return pd.DataFrame(results).set_index("fighter_id")
