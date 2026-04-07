"""
ELO Rating System for UFC Fighters
=====================================
Calculates ELO ratings chronologically from fight history.
Higher ELO = stronger fighter based on quality of opposition.

Standard starting ELO: 1500
K-factor: 32 (higher = more responsive to recent results)
Title fights use K=48 (more significant)
"""

import logging
import pandas as pd
import numpy as np
from typing import Optional

log = logging.getLogger(__name__)

BASE_ELO = 1500.0
K_NORMAL = 32.0
K_TITLE  = 48.0


def expected_score(elo_a: float, elo_b: float) -> float:
    """Probability that fighter A beats fighter B given their ELOs."""
    return 1.0 / (1.0 + 10 ** ((elo_b - elo_a) / 400.0))


def update_elo(elo_winner: float, elo_loser: float, k: float = K_NORMAL):
    """Return new (winner_elo, loser_elo) after a fight."""
    exp_w = expected_score(elo_winner, elo_loser)
    exp_l = 1.0 - exp_w
    new_winner = elo_winner + k * (1.0 - exp_w)
    new_loser  = elo_loser  + k * (0.0 - exp_l)
    return new_winner, new_loser


def compute_elo_ratings(conn) -> dict[str, float]:
    """
    Compute ELO ratings for all fighters by replaying fight history
    chronologically. Returns dict: fighter_id -> current ELO.
    """
    from sqlalchemy import create_engine, text
    import os

    db_url = os.getenv("DATABASE_URL").replace("postgresql://", "postgresql+psycopg2://")
    engine = create_engine(db_url)

    sql = """
        SELECT
            f.id AS fight_id,
            f.fighter1_id, f.fighter2_id,
            f.winner_id,
            f.is_title_fight,
            e.date AS event_date
        FROM fights f
        JOIN events e ON e.id = f.event_id
        WHERE f.winner_id IS NOT NULL
          AND f.winner_id != ''
          AND f.fighter1_id IS NOT NULL
          AND f.fighter2_id IS NOT NULL
        ORDER BY e.date ASC, f.id ASC
    """

    with engine.connect() as c:
        fights = pd.read_sql(text(sql), c)

    log.info("Computing ELO from %d historical fights", len(fights))

    elo: dict[str, float] = {}

    for _, row in fights.iterrows():
        f1_id = row["fighter1_id"]
        f2_id = row["fighter2_id"]
        winner_id = row["winner_id"]
        k = K_TITLE if row["is_title_fight"] else K_NORMAL

        elo_f1 = elo.get(f1_id, BASE_ELO)
        elo_f2 = elo.get(f2_id, BASE_ELO)

        if winner_id == f1_id:
            elo_f1, elo_f2 = update_elo(elo_f1, elo_f2, k)
        else:
            elo_f2, elo_f1 = update_elo(elo_f2, elo_f1, k)

        elo[f1_id] = elo_f1
        elo[f2_id] = elo_f2

    log.info("ELO computed for %d fighters. Top 5:", len(elo))
    top5 = sorted(elo.items(), key=lambda x: x[1], reverse=True)[:5]
    for fid, rating in top5:
        log.info("  %s: %.0f", fid, rating)

    return elo


def get_elo_dataframe(conn) -> pd.DataFrame:
    """
    Returns a DataFrame with fighter_id and their current ELO,
    ready to be merged into training features.
    """
    elo_dict = compute_elo_ratings(conn)
    return pd.DataFrame(
        list(elo_dict.items()),
        columns=["fighter_id", "elo"]
    )
