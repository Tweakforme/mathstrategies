"""
Database layer — PostgreSQL via psycopg2
Run init_db() once to create all tables.
"""

import os
import json
import logging
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

log = logging.getLogger(__name__)

DB_URL = os.getenv("DATABASE_URL", "postgresql://ufc:ufc@localhost:5432/ufc_predictions")


# ──────────────────────────────────────────────
# Connection
# ──────────────────────────────────────────────

@contextmanager
def get_conn():
    conn = psycopg2.connect(DB_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ──────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────

SCHEMA_SQL = """
-- ── Events ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
    id              TEXT PRIMARY KEY,      -- UFCStats ID
    name            TEXT NOT NULL,
    date            DATE,
    location        TEXT,
    url             TEXT,
    scraped_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Fighters ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fighters (
    id              TEXT PRIMARY KEY,      -- UFCStats ID
    name            TEXT NOT NULL,
    nickname        TEXT,
    height_cm       NUMERIC(5,1),
    weight_kg       NUMERIC(5,1),
    reach_cm        NUMERIC(5,1),
    stance          TEXT,
    dob             DATE,
    wins            INT DEFAULT 0,
    losses          INT DEFAULT 0,
    draws           INT DEFAULT 0,
    slpm            NUMERIC(6,2),
    str_acc         NUMERIC(5,1),
    sapm            NUMERIC(6,2),
    str_def         NUMERIC(5,1),
    td_avg          NUMERIC(6,2),
    td_acc          NUMERIC(5,1),
    td_def          NUMERIC(5,1),
    sub_avg         NUMERIC(6,2),
    wins_by_ko      INT DEFAULT 0,
    wins_by_sub     INT DEFAULT 0,
    wins_by_dec     INT DEFAULT 0,
    url             TEXT,
    scraped_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Fights ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fights (
    id              TEXT PRIMARY KEY,      -- UFCStats ID
    event_id        TEXT REFERENCES events(id),
    fighter1_id     TEXT REFERENCES fighters(id),
    fighter1_name   TEXT,
    fighter2_id     TEXT REFERENCES fighters(id),
    fighter2_name   TEXT,
    winner_id       TEXT,
    winner_name     TEXT,
    method          TEXT,                  -- KO/TKO | SUB | DEC | NC | DRAW
    method_detail   TEXT,
    round           INT,
    time            TEXT,
    time_format     TEXT,
    referee         TEXT,
    weight_class    TEXT,
    is_title_fight  BOOLEAN DEFAULT FALSE,
    is_main_event   BOOLEAN DEFAULT FALSE,
    stats_f1        JSONB,
    stats_f2        JSONB,
    url             TEXT,
    scraped_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Odds ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS odds (
    id              SERIAL PRIMARY KEY,
    fight_id        TEXT,                  -- linked after name-matching
    event_name      TEXT,
    fighter1_name   TEXT,
    fighter2_name   TEXT,
    commence_time   TIMESTAMPTZ,
    bookmakers      JSONB,
    consensus_f1_decimal    NUMERIC(8,4),
    consensus_f2_decimal    NUMERIC(8,4),
    consensus_f1_implied    NUMERIC(6,4),
    consensus_f2_implied    NUMERIC(6,4),
    best_f1_decimal         NUMERIC(8,4),
    best_f2_decimal         NUMERIC(8,4),
    scraped_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS odds_fight_idx ON odds(fight_id);
CREATE INDEX IF NOT EXISTS odds_time_idx  ON odds(commence_time);

-- ── Predictions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictions (
    id              SERIAL PRIMARY KEY,
    fight_id        TEXT REFERENCES fights(id),
    event_id        TEXT REFERENCES events(id),
    fighter1_id     TEXT,
    fighter2_id     TEXT,
    model_version   TEXT,
    f1_win_prob     NUMERIC(6,4),
    f2_win_prob     NUMERIC(6,4),
    confidence      NUMERIC(6,4),          -- max(f1_win_prob, f2_win_prob)
    is_value_bet    BOOLEAN DEFAULT FALSE,
    value_fighter   TEXT,                  -- name of fighter with value
    value_edge      NUMERIC(6,4),          -- model_prob - implied_prob
    recommended_odds_min NUMERIC(8,4),
    kelly_pct       NUMERIC(6,2),
    raw_features    JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pred_fight_idx ON predictions(fight_id);
CREATE INDEX IF NOT EXISTS pred_event_idx ON predictions(event_id);

-- ── Model performance tracking ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_performance (
    id              SERIAL PRIMARY KEY,
    model_version   TEXT NOT NULL,
    event_id        TEXT REFERENCES events(id),
    fight_id        TEXT REFERENCES fights(id),
    predicted_winner TEXT,
    actual_winner    TEXT,
    f1_win_prob      NUMERIC(6,4),
    f2_win_prob      NUMERIC(6,4),
    was_correct      BOOLEAN,
    brier_score      NUMERIC(8,6),         -- lower = better
    log_loss         NUMERIC(8,6),
    odds_at_bet      NUMERIC(8,4),
    bet_placed       BOOLEAN DEFAULT FALSE,
    profit_loss      NUMERIC(10,2),
    recorded_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS perf_model_idx ON model_performance(model_version);
CREATE INDEX IF NOT EXISTS perf_event_idx ON model_performance(event_id);

-- ── Materialised view: fighter recent form ───────────────────────────────────
CREATE OR REPLACE VIEW fighter_recent_form AS
SELECT
    f.fighter1_id   AS fighter_id,
    f.fighter1_name AS fighter_name,
    COUNT(*)        AS total_fights,
    SUM(CASE WHEN f.winner_id = f.fighter1_id THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN f.winner_id != f.fighter1_id AND f.winner_id IS NOT NULL THEN 1 ELSE 0 END) AS losses,
    SUM(CASE WHEN f.method IN ('KO/TKO') THEN 1 ELSE 0 END) AS ko_finishes,
    SUM(CASE WHEN f.method = 'SUB'  THEN 1 ELSE 0 END) AS sub_finishes,
    AVG(f.round) AS avg_fight_length_rounds,
    MAX(e.date)  AS last_fight_date
FROM fights f
JOIN events e ON e.id = f.event_id
GROUP BY f.fighter1_id, f.fighter1_name;
"""


def init_db():
    """Create all tables (idempotent — safe to re-run)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
    log.info("Database initialised.")


# ──────────────────────────────────────────────
# Upsert helpers
# ──────────────────────────────────────────────

def upsert_event(event: dict):
    sql = """
        INSERT INTO events (id, name, date, location, url)
        VALUES (%(id)s, %(name)s, %(date)s, %(location)s, %(url)s)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            date = EXCLUDED.date,
            location = EXCLUDED.location,
            updated_at = NOW()
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {
                "id":       event["ufcstats_id"],
                "name":     event["name"],
                "date":     _parse_date(event.get("date")),
                "location": event.get("location"),
                "url":      event.get("url"),
            })


def upsert_fighter(fighter: dict):
    sql = """
        INSERT INTO fighters (
            id, name, nickname, height_cm, weight_kg, reach_cm, stance, dob,
            wins, losses, draws,
            slpm, str_acc, sapm, str_def,
            td_avg, td_acc, td_def, sub_avg,
            wins_by_ko, wins_by_sub, wins_by_dec, url
        ) VALUES (
            %(id)s, %(name)s, %(nickname)s, %(height_cm)s, %(weight_kg)s,
            %(reach_cm)s, %(stance)s, %(dob)s,
            %(wins)s, %(losses)s, %(draws)s,
            %(slpm)s, %(str_acc)s, %(sapm)s, %(str_def)s,
            %(td_avg)s, %(td_acc)s, %(td_def)s, %(sub_avg)s,
            %(wins_by_ko)s, %(wins_by_sub)s, %(wins_by_dec)s, %(url)s
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, wins = EXCLUDED.wins, losses = EXCLUDED.losses,
            slpm = EXCLUDED.slpm, str_acc = EXCLUDED.str_acc,
            sapm = EXCLUDED.sapm, str_def = EXCLUDED.str_def,
            td_avg = EXCLUDED.td_avg, td_acc = EXCLUDED.td_acc,
            td_def = EXCLUDED.td_def, sub_avg = EXCLUDED.sub_avg,
            updated_at = NOW()
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {
                "id":        fighter["ufcstats_id"],
                "name":      fighter["name"],
                "nickname":  fighter.get("nickname"),
                "height_cm": fighter.get("height_cm"),
                "weight_kg": fighter.get("weight_kg"),
                "reach_cm":  fighter.get("reach_cm"),
                "stance":    fighter.get("stance"),
                "dob":       _parse_date(fighter.get("dob")),
                "wins":      fighter.get("wins", 0),
                "losses":    fighter.get("losses", 0),
                "draws":     fighter.get("draws", 0),
                "slpm":      fighter.get("slpm", 0),
                "str_acc":   fighter.get("str_acc", 0),
                "sapm":      fighter.get("sapm", 0),
                "str_def":   fighter.get("str_def", 0),
                "td_avg":    fighter.get("td_avg", 0),
                "td_acc":    fighter.get("td_acc", 0),
                "td_def":    fighter.get("td_def", 0),
                "sub_avg":   fighter.get("sub_avg", 0),
                "wins_by_ko":  fighter.get("wins_by_ko", 0),
                "wins_by_sub": fighter.get("wins_by_sub", 0),
                "wins_by_dec": fighter.get("wins_by_dec", 0),
                "url":       fighter.get("url"),
            })


def upsert_fight(fight: dict):
    sql = """
        INSERT INTO fights (
            id, event_id, fighter1_id, fighter1_name,
            fighter2_id, fighter2_name, winner_id, winner_name,
            method, method_detail, round, time, time_format,
            referee, weight_class, is_title_fight, is_main_event,
            stats_f1, stats_f2, url
        ) VALUES (
            %(id)s, %(event_id)s, %(fighter1_id)s, %(fighter1_name)s,
            %(fighter2_id)s, %(fighter2_name)s, %(winner_id)s, %(winner_name)s,
            %(method)s, %(method_detail)s, %(round)s, %(time)s, %(time_format)s,
            %(referee)s, %(weight_class)s, %(is_title_fight)s, %(is_main_event)s,
            %(stats_f1)s, %(stats_f2)s, %(url)s
        )
        ON CONFLICT (id) DO UPDATE SET
            winner_id   = EXCLUDED.winner_id,
            winner_name = EXCLUDED.winner_name,
            method      = EXCLUDED.method,
            stats_f1    = EXCLUDED.stats_f1,
            stats_f2    = EXCLUDED.stats_f2,
            updated_at  = NOW()
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {
                "id":            fight["ufcstats_id"],
                "event_id":      fight.get("event_id"),
                "fighter1_id":   fight.get("fighter1_id"),
                "fighter1_name": fight.get("fighter1_name"),
                "fighter2_id":   fight.get("fighter2_id"),
                "fighter2_name": fight.get("fighter2_name"),
                "winner_id":     fight.get("winner_id"),
                "winner_name":   fight.get("winner_name"),
                "method":        fight.get("method"),
                "method_detail": fight.get("method_detail"),
                "round":         fight.get("round"),
                "time":          fight.get("time"),
                "time_format":   fight.get("time_format"),
                "referee":       fight.get("referee"),
                "weight_class":  fight.get("weight_class"),
                "is_title_fight": fight.get("is_title_fight", False),
                "is_main_event":  fight.get("is_main_event", False),
                "stats_f1":      json.dumps(fight.get("stats_f1", {})),
                "stats_f2":      json.dumps(fight.get("stats_f2", {})),
                "url":           fight.get("url"),
            })


def insert_odds(odds: dict):
    sql = """
        INSERT INTO odds (
            fight_id, event_name, fighter1_name, fighter2_name,
            commence_time, bookmakers,
            consensus_f1_decimal, consensus_f2_decimal,
            consensus_f1_implied, consensus_f2_implied,
            best_f1_decimal, best_f2_decimal
        ) VALUES (
            %(fight_id)s, %(event_name)s, %(fighter1_name)s, %(fighter2_name)s,
            %(commence_time)s, %(bookmakers)s,
            %(consensus_f1_decimal)s, %(consensus_f2_decimal)s,
            %(consensus_f1_implied)s, %(consensus_f2_implied)s,
            %(best_f1_decimal)s, %(best_f2_decimal)s
        )
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {
                "fight_id":               odds.get("fight_id"),
                "event_name":             odds.get("event_name"),
                "fighter1_name":          odds.get("fighter1_name"),
                "fighter2_name":          odds.get("fighter2_name"),
                "commence_time":          odds.get("commence_time"),
                "bookmakers":             json.dumps(odds.get("bookmakers", [])),
                "consensus_f1_decimal":   odds.get("consensus_f1_decimal"),
                "consensus_f2_decimal":   odds.get("consensus_f2_decimal"),
                "consensus_f1_implied":   odds.get("consensus_f1_implied_prob"),
                "consensus_f2_implied":   odds.get("consensus_f2_implied_prob"),
                "best_f1_decimal":        odds.get("best_f1_decimal"),
                "best_f2_decimal":        odds.get("best_f2_decimal"),
            })


def insert_prediction(pred: dict):
    sql = """
        INSERT INTO predictions (
            fight_id, event_id, fighter1_id, fighter2_id,
            model_version, f1_win_prob, f2_win_prob, confidence,
            is_value_bet, value_fighter, value_edge,
            recommended_odds_min, kelly_pct, raw_features
        ) VALUES (
            %(fight_id)s, %(event_id)s, %(fighter1_id)s, %(fighter2_id)s,
            %(model_version)s, %(f1_win_prob)s, %(f2_win_prob)s, %(confidence)s,
            %(is_value_bet)s, %(value_fighter)s, %(value_edge)s,
            %(recommended_odds_min)s, %(kelly_pct)s, %(raw_features)s
        )
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {**pred, "raw_features": json.dumps(pred.get("raw_features", {}))})


# ──────────────────────────────────────────────
# Read helpers (for the dashboard API)
# ──────────────────────────────────────────────

def get_upcoming_predictions(event_id: str) -> list[dict]:
    """Return all predictions for a given event, joined with fighter data."""
    sql = """
        SELECT
            p.*,
            f1.name  AS f1_name,  f1.slpm AS f1_slpm, f1.str_acc AS f1_str_acc,
            f1.sapm  AS f1_sapm,  f1.str_def AS f1_str_def,
            f1.td_avg AS f1_td_avg, f1.td_acc AS f1_td_acc,
            f1.td_def AS f1_td_def, f1.sub_avg AS f1_sub_avg,
            f1.wins_by_ko AS f1_ko, f1.wins_by_sub AS f1_sub,
            f2.name  AS f2_name,  f2.slpm AS f2_slpm, f2.str_acc AS f2_str_acc,
            f2.sapm  AS f2_sapm,  f2.str_def AS f2_str_def,
            f2.td_avg AS f2_td_avg, f2.td_acc AS f2_td_acc,
            f2.td_def AS f2_td_def, f2.sub_avg AS f2_sub_avg,
            f2.wins_by_ko AS f2_ko, f2.wins_by_sub AS f2_sub,
            fi.weight_class, fi.is_title_fight, fi.is_main_event,
            o.consensus_f1_decimal, o.consensus_f2_decimal,
            o.best_f1_decimal, o.best_f2_decimal,
            o.bookmakers
        FROM predictions p
        JOIN fighters f1 ON f1.id = p.fighter1_id
        JOIN fighters f2 ON f2.id = p.fighter2_id
        JOIN fights   fi ON fi.id = p.fight_id
        LEFT JOIN LATERAL (
            SELECT * FROM odds WHERE fight_id = p.fight_id ORDER BY scraped_at DESC LIMIT 1
        ) o ON TRUE
        WHERE p.event_id = %(event_id)s
        ORDER BY fi.is_main_event DESC, p.confidence DESC
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, {"event_id": event_id})
            return [dict(r) for r in cur.fetchall()]


def upsert_tapology_data(fighter_name: str, tap: dict):
    """
    Update a fighter row with Tapology-sourced data, matched by name (case-insensitive).
    tap dict keys match TapologyFighter fields.
    """
    sql = """
        UPDATE fighters SET
            nationality                = COALESCE(%(nationality)s, nationality),
            camp                       = COALESCE(%(camp)s, camp),
            pre_ufc_wins               = COALESCE(%(pre_ufc_wins)s, pre_ufc_wins),
            pre_ufc_losses             = COALESCE(%(pre_ufc_losses)s, pre_ufc_losses),
            pre_ufc_draws              = COALESCE(%(pre_ufc_draws)s, pre_ufc_draws),
            pre_ufc_finish_rate        = COALESCE(%(pre_ufc_finish_rate)s, pre_ufc_finish_rate),
            dwcs_appeared              = COALESCE(%(dwcs_appeared)s, dwcs_appeared),
            dwcs_result                = COALESCE(%(dwcs_result)s, dwcs_result),
            regional_competition_level = COALESCE(%(regional_competition_level)s, regional_competition_level),
            tapology_url               = %(tapology_url)s,
            tapology_scraped_at        = NOW()
        WHERE LOWER(name) = LOWER(%(name)s)
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {
                "name":                      fighter_name,
                "nationality":               tap.get("nationality"),
                "camp":                      tap.get("camp"),
                "pre_ufc_wins":              tap.get("pre_ufc_wins"),
                "pre_ufc_losses":            tap.get("pre_ufc_losses"),
                "pre_ufc_draws":             tap.get("pre_ufc_draws"),
                "pre_ufc_finish_rate":       tap.get("pre_ufc_finish_rate"),
                "dwcs_appeared":             tap.get("dwcs_appeared"),
                "dwcs_result":               tap.get("dwcs_result"),
                "regional_competition_level": tap.get("regional_competition_level"),
                "tapology_url":              tap.get("tapology_url"),
            })
            return cur.rowcount  # 1 if matched, 0 if fighter not found in DB


def get_all_fighter_names() -> list[dict]:
    """Return id + name for every fighter in the DB (for Tapology batch scraping)."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, name FROM fighters ORDER BY name")
            return [dict(r) for r in cur.fetchall()]


def get_model_accuracy(model_version: Optional[str] = None, last_n_events: int = 10) -> dict:
    """Return accuracy metrics for the model."""
    sql = """
        SELECT
            COUNT(*)  AS total,
            SUM(CASE WHEN was_correct THEN 1 ELSE 0 END) AS correct,
            AVG(brier_score) AS avg_brier,
            AVG(log_loss)    AS avg_log_loss,
            SUM(CASE WHEN bet_placed THEN profit_loss ELSE 0 END) AS total_pnl
        FROM model_performance
        WHERE model_version = COALESCE(%(version)s, model_version)
        AND event_id IN (
            SELECT id FROM events ORDER BY date DESC LIMIT %(n)s
        )
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, {"version": model_version, "n": last_n_events})
            row = cur.fetchone()
            if row and row["total"]:
                row["accuracy"] = round(row["correct"] / row["total"] * 100, 1)
            return dict(row) if row else {}


# ──────────────────────────────────────────────
# Utils
# ──────────────────────────────────────────────

def _parse_date(date_str: Optional[str]) -> Optional[str]:
    if not date_str:
        return None
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_db()
