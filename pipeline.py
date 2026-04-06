#!/usr/bin/env python3
"""
UFC Prediction Pipeline — Main Runner
======================================
Modes:
  scrape-upcoming   Scrape next event + all fighter stats + latest odds
  scrape-history    Backfill N completed events into the DB
  scrape-fighters   Scrape all fighter profiles from saved fights
  predict           Run ML model on upcoming event fights
  record-results    After an event: pull results, log model performance
  train             Train the XGBoost model on historical data
  full-run          scrape-upcoming → predict (one command for the cron job)

Usage:
  python pipeline.py scrape-upcoming
  python pipeline.py scrape-history --n 20
  python pipeline.py scrape-fighters
  python pipeline.py predict --event-id <id>
  python pipeline.py record-results --event-id <id>
  python pipeline.py train
  python pipeline.py full-run
"""

import argparse
import json
import logging
import os
import sys
from dataclasses import asdict
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from scraper.ufcstats_scraper import (
    scrape_upcoming_event,
    scrape_recent_events,
    scrape_fight_stats,
    scrape_event,
)
from scraper.odds_scraper import (
    fetch_ufc_odds,
    find_value_bets,
    recommended_bet_size,
)
from database.db import (
    init_db,
    upsert_event,
    upsert_fighter,
    upsert_fight,
    insert_odds,
    insert_prediction,
    get_upcoming_predictions,
    get_fights_for_event,
    get_model_accuracy,
    upsert_tapology_data,
    get_all_fighter_names,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("pipeline.log"),
    ]
)
log = logging.getLogger("pipeline")

BANKROLL = float(os.getenv("BANKROLL", "1000"))   # set in .env


# ──────────────────────────────────────────────
# Scraping pipeline
# ──────────────────────────────────────────────

def run_scrape_upcoming() -> str:
    """
    Scrape the next UFC event: event metadata, all fighter profiles,
    per-fight stats, and current odds.
    Returns the event ID.
    """
    log.info("=" * 60)
    log.info("SCRAPING UPCOMING EVENT")
    log.info("=" * 60)

    # 1. Event + fights
    event = scrape_upcoming_event()
    if not event:
        log.error("No upcoming event found.")
        sys.exit(1)

    upsert_event(asdict(event))
    log.info("Event saved: %s (%s)", event.name, event.ufcstats_id)

    # 2. Fighter profiles for every fighter on the card
    from scraper.ufcstats_scraper import scrape_fighter, BASE_URL
    seen_fighters = set()
    for fight in event.fights:
        for fid, fname in [
            (fight.fighter1_id, fight.fighter1_name),
            (fight.fighter2_id, fight.fighter2_name),
        ]:
            if fid and fid not in seen_fighters:
                seen_fighters.add(fid)
                url = f"{BASE_URL}/fighter-details/{fid}"
                log.info("Scraping fighter profile: %s", fname)
                fighter = scrape_fighter(url)
                if fighter:
                    upsert_fighter(asdict(fighter))

        # 3. Per-fight detailed stats (if fight has already happened — for history)
        if fight.url:
            stats = scrape_fight_stats(fight.url)
            if stats:
                fight.stats_f1 = stats.get("fighter1_stats", {})
                fight.stats_f2 = stats.get("fighter2_stats", {})

        upsert_fight(asdict(fight))

    # 4. Odds
    log.info("Fetching odds from The Odds API…")
    all_odds = fetch_ufc_odds()
    for o in all_odds:
        insert_odds(asdict(o))
    log.info("Saved odds for %d fights", len(all_odds))

    log.info("Scrape complete. Event ID: %s", event.ufcstats_id)
    return event.ufcstats_id


def run_scrape_history(n: int = 10):
    """Backfill the last N completed events."""
    log.info("Backfilling %d historical events…", n)
    events = scrape_recent_events(n)
    for event in events:
        upsert_event(asdict(event))
        for fight in event.fights:
            if fight.url:
                stats = scrape_fight_stats(fight.url)
                if stats:
                    fight.stats_f1 = stats.get("fighter1_stats", {})
                    fight.stats_f2 = stats.get("fighter2_stats", {})
            upsert_fight(asdict(fight))
        log.info("Saved event: %s", event.name)
    log.info("History backfill complete.")


def run_scrape_fighters():
    """
    Scrape full fighter profiles for every fighter in the fights table.
    Run this once after scrape-history to populate the fighters table.
    """
    import psycopg2
    import psycopg2.extras
    from scraper.ufcstats_scraper import scrape_fighter, BASE_URL
    from database.db import get_conn

    log.info("Scraping all fighter profiles from saved fights...")

    sql = """
        SELECT DISTINCT fighter1_id AS fid, fighter1_name AS fname FROM fights
        UNION
        SELECT DISTINCT fighter2_id, fighter2_name FROM fights
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            fighters = cur.fetchall()

    log.info("Found %d unique fighters to scrape", len(fighters))

    for i, row in enumerate(fighters):
        url = f"{BASE_URL}/fighter-details/{row['fid']}"
        log.info("[%d/%d] Scraping %s", i + 1, len(fighters), row['fname'])
        fighter = scrape_fighter(url)
        if fighter:
            upsert_fighter(asdict(fighter))

    log.info("All fighter profiles saved.")


# ──────────────────────────────────────────────
# Tapology pipeline
# ──────────────────────────────────────────────

def run_scrape_tapology(limit: Optional[int] = None, only_missing: bool = True):
    """
    Scrape Tapology for all fighters in the DB (or just those without tapology data).
    Enriches the fighters table with nationality, camp, pre-UFC record, and DWCS info.
    """
    from scraper.tapology_scraper import scrape_all_fighters_tapology
    from dataclasses import asdict

    log.info("=" * 60)
    log.info("SCRAPING TAPOLOGY FIGHTER DATA")
    log.info("=" * 60)

    fighters = get_all_fighter_names()

    if only_missing:
        # Filter to fighters who haven't been enriched yet
        import psycopg2.extras
        from database.db import get_conn
        with get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT id FROM fighters WHERE tapology_scraped_at IS NULL OR nationality IS NULL"
                )
                missing_ids = {r["id"] for r in cur.fetchall()}
        fighters = [f for f in fighters if f["id"] in missing_ids]
        log.info("Fighters missing Tapology data: %d", len(fighters))

    if limit:
        fighters = fighters[:limit]
        log.info("Limiting to first %d fighters", limit)

    tap_results = scrape_all_fighters_tapology(fighters)

    matched = 0
    for tap in tap_results:
        rows_updated = upsert_tapology_data(tap.name, asdict(tap))
        if rows_updated:
            matched += 1
        else:
            log.warning("  No DB match for Tapology fighter: %s", tap.name)

    log.info(
        "Tapology scrape complete — %d/%d fighters matched and updated.",
        matched, len(tap_results)
    )


# ──────────────────────────────────────────────
# Prediction pipeline
# ──────────────────────────────────────────────

def run_predict(event_id: str):
    """
    Load the trained model and generate predictions for every fight
    in the upcoming event. Saves predictions + value bets to DB.
    """
    log.info("=" * 60)
    log.info("RUNNING PREDICTIONS for event: %s", event_id)
    log.info("=" * 60)

    try:
        from models.prediction_model import UFCPredictor
    except ImportError:
        log.error("Prediction model not yet trained. Run train first.")
        return

    predictor = UFCPredictor()
    predictor.load()

    preds = get_fights_for_event(event_id)
    if not preds:
        log.warning("No fights found for event %s — did scrape-upcoming run?", event_id)
        return

    odds_list = fetch_ufc_odds()
    model_probs = {}

    for p in preds:
        prob_f1, prob_f2 = predictor.predict(p)
        model_probs[p["f1_name"]] = prob_f1
        model_probs[p["f2_name"]] = prob_f2

        confidence = max(prob_f1, prob_f2)
        value_fighter = p["f1_name"] if prob_f1 > prob_f2 else p["f2_name"]

        pred_record = {
            "fight_id":           p["fight_id"],
            "event_id":           event_id,
            "fighter1_id":        p["fighter1_id"],
            "fighter2_id":        p["fighter2_id"],
            "model_version":      predictor.version,
            "f1_win_prob":        prob_f1,
            "f2_win_prob":        prob_f2,
            "confidence":         confidence,
            "is_value_bet":       False,
            "value_fighter":      value_fighter,
            "value_edge":         0,
            "recommended_odds_min": None,
            "kelly_pct":          0,
            "raw_features":       p,
        }
        insert_prediction(pred_record)

    value_bets = find_value_bets(odds_list, model_probs, min_odds=1.7, edge_threshold=0.05)

    log.info("")
    log.info("━━━ VALUE BETS (max 4) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    for vb in value_bets[:4]:
        sizing = recommended_bet_size(BANKROLL, vb["model_prob"] / 100, vb["best_odds"])
        log.info(
            "  ✓ %s vs %s | Odds: %.2f (+%d) | Model: %.1f%% | Edge: +%.1f%% | "
            "Bet: $%.0f (%.2f%% bankroll)",
            vb["fighter"], vb["opponent"],
            vb["best_odds"], vb["american_odds"],
            vb["model_prob"], vb["edge"],
            sizing["bet_amount"], sizing["capped_pct"],
        )

    if not value_bets:
        log.info("  No value bets found for this card.")

    log.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")


# ──────────────────────────────────────────────
# Results recording (post-event)
# ──────────────────────────────────────────────

def run_record_results(event_id: str):
    """
    After an event: scrape results, compare to predictions,
    log accuracy metrics. This feeds back into model retraining.
    """
    import psycopg2.extras
    import math
    from database.db import get_conn

    log.info("Recording results for event: %s", event_id)

    sql = """
        SELECT f.id, f.winner_id, f.fighter1_id, f.fighter2_id,
               p.f1_win_prob, p.f2_win_prob, p.model_version
        FROM fights f
        JOIN predictions p ON p.fight_id = f.id
        WHERE f.event_id = %(event_id)s
          AND f.winner_id IS NOT NULL
          AND p.created_at = (
              SELECT MAX(p2.created_at) FROM predictions p2 WHERE p2.fight_id = f.id
          )
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, {"event_id": event_id})
            rows = cur.fetchall()

        correct = 0
        for row in rows:
            predicted_winner = (
                row["fighter1_id"] if row["f1_win_prob"] >= row["f2_win_prob"]
                else row["fighter2_id"]
            )
            was_correct = predicted_winner == row["winner_id"]
            if was_correct:
                correct += 1

            outcome  = 1 if row["winner_id"] == row["fighter1_id"] else 0
            brier    = (row["f1_win_prob"] - outcome) ** 2
            p_correct = row["f1_win_prob"] if outcome == 1 else row["f2_win_prob"]
            ll       = -math.log(max(p_correct, 1e-7))

            with conn.cursor() as cur2:
                cur2.execute("""
                    INSERT INTO model_performance
                    (model_version, event_id, fight_id, predicted_winner,
                     actual_winner, f1_win_prob, f2_win_prob, was_correct,
                     brier_score, log_loss)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    row["model_version"], event_id, row["id"],
                    predicted_winner, row["winner_id"],
                    row["f1_win_prob"], row["f2_win_prob"],
                    was_correct, brier, ll
                ))

    if rows:
        log.info(
            "Recorded %d results — Accuracy: %.1f%%",
            len(rows), correct / len(rows) * 100
        )

    accuracy = get_model_accuracy(last_n_events=10)
    log.info("Rolling 10-event accuracy: %s", accuracy)


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="UFC Prediction Pipeline")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("scrape-upcoming")
    sub.add_parser("scrape-fighters")
    sub.add_parser("init-db")
    sub.add_parser("train")
    sub.add_parser("full-run", help="scrape-upcoming then predict (for cron)")

    tap = sub.add_parser("scrape-tapology", help="Enrich fighters with Tapology data")
    tap.add_argument("--limit", type=int, default=None, help="Max fighters to scrape (default: all)")
    tap.add_argument("--all", dest="all_fighters", action="store_true",
                     help="Re-scrape all fighters, not just those missing data")

    hist = sub.add_parser("scrape-history")
    hist.add_argument("--n", type=int, default=10)

    pred = sub.add_parser("predict")
    pred.add_argument("--event-id", required=True)

    res = sub.add_parser("record-results")
    res.add_argument("--event-id", required=True)

    args = parser.parse_args()

    if args.cmd == "init-db":
        init_db()

    elif args.cmd == "scrape-upcoming":
        run_scrape_upcoming()

    elif args.cmd == "scrape-history":
        run_scrape_history(args.n)

    elif args.cmd == "scrape-fighters":
        run_scrape_fighters()

    elif args.cmd == "train":
        from models.prediction_model import UFCPredictor
        from sqlalchemy import create_engine
        db_url = os.getenv("DATABASE_URL").replace("postgresql://", "postgresql+psycopg2://")
        engine = create_engine(db_url)
        with engine.connect() as conn:
            predictor = UFCPredictor()
            predictor.train(conn=conn)

    elif args.cmd == "predict":
        run_predict(args.event_id)

    elif args.cmd == "record-results":
        run_record_results(args.event_id)

    elif args.cmd == "scrape-tapology":
        run_scrape_tapology(
            limit=args.limit,
            only_missing=not args.all_fighters,
        )

    elif args.cmd == "full-run":
        event_id = run_scrape_upcoming()
        run_predict(event_id)
        log.info("Full run complete. Open dashboard to review predictions.")


if __name__ == "__main__":
    main()