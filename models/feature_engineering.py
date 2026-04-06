"""
Feature Engineering
====================
Transforms raw fighter + fight data from PostgreSQL into
ML-ready features for the XGBoost model.
"""

import logging
import numpy as np
import pandas as pd
from typing import Optional

log = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Raw data loader
# ──────────────────────────────────────────────

def load_training_data(conn) -> pd.DataFrame:
    """
    Load all completed fights with both fighters' stats.
    Returns one row per fight with differential features.
    """
    sql = """
        SELECT
            f.id            AS fight_id,
            f.event_id,
            f.fighter1_id,
            f.fighter2_id,
            f.winner_id,
            f.method,
            f.round,
            f.weight_class,
            f.is_title_fight,
            f.is_main_event,
            e.date          AS event_date,

            -- Fighter 1 stats
            f1.name         AS f1_name,
            f1.wins         AS f1_wins,
            f1.losses       AS f1_losses,
            f1.height_cm    AS f1_height,
            f1.reach_cm     AS f1_reach,
            f1.stance       AS f1_stance,
            f1.dob          AS f1_dob,
            f1.slpm         AS f1_slpm,
            f1.str_acc      AS f1_str_acc,
            f1.sapm         AS f1_sapm,
            f1.str_def      AS f1_str_def,
            f1.td_avg       AS f1_td_avg,
            f1.td_acc       AS f1_td_acc,
            f1.td_def       AS f1_td_def,
            f1.sub_avg      AS f1_sub_avg,
            f1.wins_by_ko   AS f1_wins_ko,
            f1.wins_by_sub  AS f1_wins_sub,
            f1.wins_by_dec  AS f1_wins_dec,

            -- Fighter 2 stats
            f2.name         AS f2_name,
            f2.wins         AS f2_wins,
            f2.losses       AS f2_losses,
            f2.height_cm    AS f2_height,
            f2.reach_cm     AS f2_reach,
            f2.stance       AS f2_stance,
            f2.dob          AS f2_dob,
            f2.slpm         AS f2_slpm,
            f2.str_acc      AS f2_str_acc,
            f2.sapm         AS f2_sapm,
            f2.str_def      AS f2_str_def,
            f2.td_avg       AS f2_td_avg,
            f2.td_acc       AS f2_td_acc,
            f2.td_def       AS f2_td_def,
            f2.sub_avg      AS f2_sub_avg,
            f2.wins_by_ko   AS f2_wins_ko,
            f2.wins_by_sub  AS f2_wins_sub,
            f2.wins_by_dec  AS f2_wins_dec

        FROM fights f
        JOIN events  e  ON e.id  = f.event_id
        JOIN fighters f1 ON f1.id = f.fighter1_id
        JOIN fighters f2 ON f2.id = f.fighter2_id
        WHERE f.winner_id IS NOT NULL
          AND f.winner_id != ''
        ORDER BY e.date ASC
    """

    from sqlalchemy import create_engine, text
    import os
    db_url = os.getenv("DATABASE_URL").replace("postgresql://", "postgresql+psycopg2://")
    engine = create_engine(db_url)
    with engine.connect() as c:
        df = pd.read_sql(text(sql), c)
    df = balance_classes(df)
    log.info("Loaded %d fights for training (%d class-0, %d class-1)",
             len(df),
             (df["winner_id"] != df["fighter1_id"]).sum(),
             (df["winner_id"] == df["fighter1_id"]).sum())
    return df
    return df

def load_fight_for_prediction(conn, fight_id: str) -> Optional[pd.Series]:
    """Load a single upcoming fight's data for prediction."""
    sql = """
        SELECT
            f.id AS fight_id, f.event_id,
            f.fighter1_id, f.fighter2_id,
            f.weight_class, f.is_title_fight,
            e.date AS event_date,
            f1.name AS f1_name, f1.wins AS f1_wins, f1.losses AS f1_losses,
            f1.height_cm AS f1_height, f1.reach_cm AS f1_reach,
            f1.stance AS f1_stance, f1.dob AS f1_dob,
            f1.slpm AS f1_slpm, f1.str_acc AS f1_str_acc,
            f1.sapm AS f1_sapm, f1.str_def AS f1_str_def,
            f1.td_avg AS f1_td_avg, f1.td_acc AS f1_td_acc,
            f1.td_def AS f1_td_def, f1.sub_avg AS f1_sub_avg,
            f1.wins_by_ko AS f1_wins_ko, f1.wins_by_sub AS f1_wins_sub,
            f1.wins_by_dec AS f1_wins_dec,
            f2.name AS f2_name, f2.wins AS f2_wins, f2.losses AS f2_losses,
            f2.height_cm AS f2_height, f2.reach_cm AS f2_reach,
            f2.stance AS f2_stance, f2.dob AS f2_dob,
            f2.slpm AS f2_slpm, f2.str_acc AS f2_str_acc,
            f2.sapm AS f2_sapm, f2.str_def AS f2_str_def,
            f2.td_avg AS f2_td_avg, f2.td_acc AS f2_td_acc,
            f2.td_def AS f2_td_def, f2.sub_avg AS f2_sub_avg,
            f2.wins_by_ko AS f2_wins_ko, f2.wins_by_sub AS f2_wins_sub,
            f2.wins_by_dec AS f2_wins_dec
        FROM fights f
        JOIN events   e  ON e.id  = f.event_id
        JOIN fighters f1 ON f1.id = f.fighter1_id
        JOIN fighters f2 ON f2.id = f.fighter2_id
        WHERE f.id = %(fight_id)s
    """
    df = pd.read_sql(sql, conn, params={"fight_id": fight_id})
    if df.empty:
        return None
    return df.iloc[0]


# ──────────────────────────────────────────────
# Feature engineering
# ──────────────────────────────────────────────
def balance_classes(df: pd.DataFrame) -> pd.DataFrame:
    """
    Randomly swap fighter1/fighter2 for ~50% of fights so the model
    sees both winning fighters in both slots.
    """
    import numpy as np
    df = df.copy()
    np.random.seed(42)
    swap_mask = np.random.rand(len(df)) > 0.5

    f1_cols = [c for c in df.columns if c.startswith("f1_")]
    f2_cols = [c for c in df.columns if c.startswith("f2_")]

    for f1_col, f2_col in zip(sorted(f1_cols), sorted(f2_cols)):
        df.loc[swap_mask, [f1_col, f2_col]] = df.loc[swap_mask, [f2_col, f1_col]].values

    # Fix winner_id — if swapped, fighter2 is now in slot1
    if "winner_id" in df.columns and "fighter1_id" in df.columns:
        df["target"] = (df["winner_id"] == df["fighter1_id"]).astype(int)
        # After swap, fighter1_id and fighter2_id are also swapped
        df.loc[swap_mask, ["fighter1_id", "fighter2_id"]] = \
            df.loc[swap_mask, ["fighter2_id", "fighter1_id"]].values

    return df

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw fighter stats into differential + ratio features.
    All features are from fighter1's perspective.
    Target: 1 if fighter1 wins, 0 if fighter2 wins.
    """
    feat = pd.DataFrame()

    # ── Striking differentials ──────────────────
    # Offensive output minus what opponent absorbs
    feat["str_diff"]        = df["f1_slpm"]    - df["f2_slpm"]
    feat["str_acc_diff"]    = df["f1_str_acc"] - df["f2_str_acc"]
    feat["str_def_diff"]    = df["f1_str_def"] - df["f2_str_def"]
    feat["sapm_diff"]       = df["f1_sapm"]    - df["f2_sapm"]

    # Striking efficiency: how much you land vs absorb
    feat["str_efficiency"]  = df["f1_slpm"] - df["f1_sapm"]
    feat["str_efficiency2"] = df["f2_slpm"] - df["f2_sapm"]
    feat["str_eff_diff"]    = feat["str_efficiency"] - feat["str_efficiency2"]

    # Offensive striking vs opponent defence
    feat["str_vs_def"]      = df["f1_slpm"]  * (df["f1_str_acc"] / 100) \
                            - df["f2_slpm"]  * (df["f2_str_acc"] / 100)

    # ── Grappling differentials ─────────────────
    feat["td_diff"]         = df["f1_td_avg"] - df["f2_td_avg"]
    feat["td_acc_diff"]     = df["f1_td_acc"] - df["f2_td_acc"]
    feat["td_def_diff"]     = df["f1_td_def"] - df["f2_td_def"]
    feat["sub_diff"]        = df["f1_sub_avg"] - df["f2_sub_avg"]

    # TD offence vs opponent TD defence
    feat["td_vs_def"]       = (df["f1_td_avg"] * df["f1_td_acc"] / 100) \
                            - (df["f2_td_avg"] * df["f2_td_acc"] / 100)

    # ── Experience & record ─────────────────────
    feat["total_fights_diff"] = (df["f1_wins"] + df["f1_losses"]) \
                               - (df["f2_wins"] + df["f2_losses"])
    feat["win_pct_f1"]      = df["f1_wins"] / (df["f1_wins"] + df["f1_losses"] + 1e-6)
    feat["win_pct_f2"]      = df["f2_wins"] / (df["f2_wins"] + df["f2_losses"] + 1e-6)
    feat["win_pct_diff"]    = feat["win_pct_f1"] - feat["win_pct_f2"]

    # ── Finish rates ────────────────────────────
    f1_total = df["f1_wins"] + 1e-6
    f2_total = df["f2_wins"] + 1e-6
    feat["ko_rate_f1"]      = df["f1_wins_ko"]  / f1_total
    feat["ko_rate_f2"]      = df["f2_wins_ko"]  / f2_total
    feat["sub_rate_f1"]     = df["f1_wins_sub"] / f1_total
    feat["sub_rate_f2"]     = df["f2_wins_sub"] / f2_total
    feat["fin_rate_f1"]     = (df["f1_wins_ko"] + df["f1_wins_sub"]) / f1_total
    feat["fin_rate_f2"]     = (df["f2_wins_ko"] + df["f2_wins_sub"]) / f2_total
    feat["fin_rate_diff"]   = feat["fin_rate_f1"] - feat["fin_rate_f2"]
    feat["ko_rate_diff"]    = feat["ko_rate_f1"]  - feat["ko_rate_f2"]
    feat["sub_rate_diff"]   = feat["sub_rate_f1"] - feat["sub_rate_f2"]

    # ── Physical attributes ─────────────────────
    feat["height_diff"]     = _safe_diff(df, "f1_height", "f2_height")
    feat["reach_diff"]      = _safe_diff(df, "f1_reach",  "f2_reach")

    # ── Age ─────────────────────────────────────
    if "event_date" in df.columns:
        event_date = pd.to_datetime(df["event_date"], errors="coerce")
        f1_dob     = pd.to_datetime(df["f1_dob"],     errors="coerce")
        f2_dob     = pd.to_datetime(df["f2_dob"],     errors="coerce")
        feat["f1_age"]      = (event_date - f1_dob).dt.days / 365.25
        feat["f2_age"]      = (event_date - f2_dob).dt.days / 365.25
        feat["age_diff"]    = feat["f1_age"] - feat["f2_age"]
        # Prime age bonus (27-33 is peak for most fighters)
        feat["f1_prime"]    = feat["f1_age"].apply(_prime_score)
        feat["f2_prime"]    = feat["f2_age"].apply(_prime_score)
        feat["prime_diff"]  = feat["f1_prime"] - feat["f2_prime"]
    else:
        feat["age_diff"]    = 0.0
        feat["prime_diff"]  = 0.0

    # ── Stance matchup ──────────────────────────
    # Orthodox vs Southpaw is a meaningful matchup factor
    feat["both_orthodox"]   = ((df["f1_stance"] == "Orthodox") &
                               (df["f2_stance"] == "Orthodox")).astype(int)
    feat["orthodox_vs_sw"]  = ((df["f1_stance"] == "Orthodox") &
                               (df["f2_stance"] == "Southpaw")).astype(int)
    feat["sw_vs_orthodox"]  = ((df["f1_stance"] == "Southpaw") &
                               (df["f2_stance"] == "Orthodox")).astype(int)

    # ── Title / main event ───────────────────────
    feat["is_title_fight"]  = df["is_title_fight"].astype(int) \
                              if "is_title_fight" in df.columns else 0

    # ── Fill NaN ────────────────────────────────
    feat = feat.fillna(0.0)

    # ── Target variable ─────────────────────────
    if "winner_id" in df.columns and "fighter1_id" in df.columns:
        feat["target"] = (df["winner_id"] == df["fighter1_id"]).astype(int)

    # Keep identifiers for tracking
    for col in ["fight_id", "fighter1_id", "fighter2_id", "f1_name", "f2_name"]:
        if col in df.columns:
            feat[col] = df[col].values

    return feat


def _safe_diff(df: pd.DataFrame, col1: str, col2: str) -> pd.Series:
    """Compute difference handling NaN."""
    return df[col1].fillna(df[col1].median()).values \
         - df[col2].fillna(df[col2].median()).values


def _prime_score(age: float) -> float:
    """
    Score how close a fighter is to their prime (27-33).
    Returns 1.0 at peak, decays toward 0 outside.
    """
    if pd.isna(age) or age <= 0:
        return 0.0
    if 27 <= age <= 33:
        return 1.0
    elif age < 27:
        return max(0, 1 - (27 - age) * 0.1)
    else:
        return max(0, 1 - (age - 33) * 0.08)


def get_feature_columns() -> list[str]:
    """Return the ordered list of feature columns used by the model."""
    return [
        "str_diff", "str_acc_diff", "str_def_diff", "sapm_diff",
        "str_eff_diff", "str_vs_def",
        "td_diff", "td_acc_diff", "td_def_diff", "sub_diff", "td_vs_def",
        "total_fights_diff", "win_pct_diff",
        "fin_rate_diff", "ko_rate_diff", "sub_rate_diff",
        "ko_rate_f1", "ko_rate_f2", "sub_rate_f1", "sub_rate_f2",
        "fin_rate_f1", "fin_rate_f2",
        "height_diff", "reach_diff",
        "age_diff", "prime_diff",
        "both_orthodox", "orthodox_vs_sw", "sw_vs_orthodox",
        "is_title_fight",
    ]
