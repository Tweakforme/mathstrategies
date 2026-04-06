"""
Odds Scraper
Fetches UFC fight odds from The Odds API (free tier: 500 req/month).
Sign up at https://the-odds-api.com to get an API key.

Falls back to scraping BestFightOdds.com for line movement history.
"""

import os
import re
import time
import logging
import requests
from dataclasses import dataclass, field, asdict
from typing import Optional
from datetime import datetime, timezone

log = logging.getLogger(__name__)

ODDS_API_KEY  = os.getenv("ODDS_API_KEY", "")          # set in .env
ODDS_API_BASE = "https://api.the-odds-api.com/v4"
SPORT_KEY     = "mma_mixed_martial_arts"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


# ──────────────────────────────────────────────
# Data classes
# ──────────────────────────────────────────────

@dataclass
class FightOdds:
    fight_id: str = ""          # matched to UFCStats fight ID after normalisation
    fighter1_name: str = ""
    fighter2_name: str = ""
    event_name: str = ""
    commence_time: str = ""
    bookmakers: list = field(default_factory=list)
    # Consensus (market average)
    consensus_f1_decimal: Optional[float] = None
    consensus_f2_decimal: Optional[float] = None
    consensus_f1_implied_prob: Optional[float] = None
    consensus_f2_implied_prob: Optional[float] = None
    # Best available
    best_f1_decimal: Optional[float] = None
    best_f2_decimal: Optional[float] = None
    scraped_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class BookmakerLine:
    bookmaker: str = ""
    f1_decimal: Optional[float] = None
    f2_decimal: Optional[float] = None
    f1_american: Optional[int] = None
    f2_american: Optional[int] = None
    last_update: str = ""


# ──────────────────────────────────────────────
# Conversion helpers
# ──────────────────────────────────────────────

def american_to_decimal(american: int) -> float:
    """Convert American odds to decimal odds."""
    if american > 0:
        return round(american / 100 + 1, 4)
    else:
        return round(100 / abs(american) + 1, 4)


def decimal_to_implied_prob(decimal: float) -> float:
    """Decimal odds → implied probability (0–1), no vig removal."""
    if decimal <= 1.0:
        return 1.0
    return round(1 / decimal, 4)


def remove_vig(prob1: float, prob2: float) -> tuple[float, float]:
    """
    Remove overround (vig) from two implied probabilities using the
    simple proportional method.
    Returns (fair_prob1, fair_prob2) that sum to 1.0.
    """
    total = prob1 + prob2
    if total == 0:
        return 0.5, 0.5
    return round(prob1 / total, 4), round(prob2 / total, 4)


def decimal_to_american(decimal: float) -> int:
    """Convert decimal odds back to American."""
    if decimal >= 2.0:
        return int((decimal - 1) * 100)
    else:
        return int(-100 / (decimal - 1))


# ──────────────────────────────────────────────
# The Odds API
# ──────────────────────────────────────────────

def _odds_api_get(endpoint: str, params: dict) -> Optional[dict]:
    """Make a request to The Odds API."""
    if not ODDS_API_KEY:
        log.error("ODDS_API_KEY not set. Add it to your .env file.")
        return None

    params["apiKey"] = ODDS_API_KEY
    url = f"{ODDS_API_BASE}{endpoint}"

    try:
        time.sleep(0.5)
        r = requests.get(url, params=params, timeout=15)
        remaining = r.headers.get("x-requests-remaining", "?")
        log.info("Odds API — %s remaining requests", remaining)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as exc:
        log.error("Odds API request failed: %s", exc)
        return None


def fetch_ufc_odds(
    regions: str = "us,uk,eu,au",
    markets: str = "h2h",
    odds_format: str = "decimal"
) -> list[FightOdds]:
    """
    Fetch all upcoming UFC fight odds from The Odds API.
    Returns a list of FightOdds objects, one per fight.
    """
    data = _odds_api_get(
        f"/sports/{SPORT_KEY}/odds",
        {
            "regions": regions,
            "markets": markets,
            "oddsFormat": odds_format,
        }
    )
    if not data:
        return []

    fights: list[FightOdds] = []

    for event in data:
        odds_obj = FightOdds(
            event_name    = event.get("sport_title", ""),
            commence_time = event.get("commence_time", ""),
        )

        # Fighter names from the event title (format: "Fighter A vs. Fighter B")
        home = event.get("home_team", "")
        away = event.get("away_team", "")
        odds_obj.fighter1_name = home
        odds_obj.fighter2_name = away

        bookmaker_lines: list[BookmakerLine] = []
        f1_decimals, f2_decimals = [], []

        for bk in event.get("bookmakers", []):
            bk_name = bk.get("title", "")
            for market in bk.get("markets", []):
                if market.get("key") != "h2h":
                    continue
                line = BookmakerLine(
                    bookmaker   = bk_name,
                    last_update = market.get("last_update", ""),
                )
                for outcome in market.get("outcomes", []):
                    price = outcome.get("price", 0)
                    name  = outcome.get("name", "")
                    if name == home:
                        line.f1_decimal  = price
                        line.f1_american = decimal_to_american(price)
                        f1_decimals.append(price)
                    elif name == away:
                        line.f2_decimal  = price
                        line.f2_american = decimal_to_american(price)
                        f2_decimals.append(price)
                bookmaker_lines.append(asdict(line))

        odds_obj.bookmakers = bookmaker_lines

        if f1_decimals:
            avg_f1 = round(sum(f1_decimals) / len(f1_decimals), 3)
            avg_f2 = round(sum(f2_decimals) / len(f2_decimals), 3) if f2_decimals else None
            odds_obj.consensus_f1_decimal = avg_f1
            odds_obj.consensus_f2_decimal = avg_f2
            odds_obj.best_f1_decimal = max(f1_decimals)
            odds_obj.best_f2_decimal = max(f2_decimals) if f2_decimals else None

            p1 = decimal_to_implied_prob(avg_f1)
            p2 = decimal_to_implied_prob(avg_f2) if avg_f2 else None
            if p2:
                fair1, fair2 = remove_vig(p1, p2)
                odds_obj.consensus_f1_implied_prob = fair1
                odds_obj.consensus_f2_implied_prob = fair2
            else:
                odds_obj.consensus_f1_implied_prob = p1

        fights.append(odds_obj)

    log.info("Fetched odds for %d fights", len(fights))
    return fights


# ──────────────────────────────────────────────
# Value bet identification
# ──────────────────────────────────────────────

def find_value_bets(
    fight_odds: list[FightOdds],
    model_probs: dict[str, float],      # {fighter_name: probability 0-1}
    min_odds: float = 1.7,
    edge_threshold: float = 0.05,       # model prob must exceed implied by 5%+
) -> list[dict]:
    """
    Compare model probabilities against market implied probabilities.
    Returns value bets where:
      - Decimal odds >= min_odds (filters heavy favourites)
      - Model probability > market implied probability + edge_threshold

    Args:
        fight_odds:      List of FightOdds from fetch_ufc_odds()
        model_probs:     {fighter_name_lower: model_probability}
        min_odds:        Minimum decimal odds for a bet to qualify
        edge_threshold:  Minimum edge over market implied prob

    Returns:
        List of value bet dicts, sorted by edge descending.
    """
    value_bets = []

    for fo in fight_odds:
        for fighter_name, decimal_odds, implied_prob in [
            (fo.fighter1_name, fo.best_f1_decimal, fo.consensus_f1_implied_prob),
            (fo.fighter2_name, fo.best_f2_decimal, fo.consensus_f2_implied_prob),
        ]:
            if not decimal_odds or not implied_prob:
                continue

            # Skip heavy favourites
            if decimal_odds < min_odds:
                continue

            # Look up model probability (try normalised name matching)
            model_prob = _fuzzy_lookup(fighter_name, model_probs)
            if model_prob is None:
                log.warning("No model prob for %s — skipping", fighter_name)
                continue

            edge = model_prob - implied_prob
            if edge >= edge_threshold:
                value_bets.append({
                    "fighter":         fighter_name,
                    "opponent":        fo.fighter2_name if fighter_name == fo.fighter1_name else fo.fighter1_name,
                    "event":           fo.event_name,
                    "commence_time":   fo.commence_time,
                    "best_odds":       decimal_odds,
                    "american_odds":   decimal_to_american(decimal_odds),
                    "implied_prob":    round(implied_prob * 100, 1),
                    "model_prob":      round(model_prob * 100, 1),
                    "edge":            round(edge * 100, 1),
                    "kelly_fraction":  _kelly(model_prob, decimal_odds),
                })

    value_bets.sort(key=lambda x: x["edge"], reverse=True)
    return value_bets


def _fuzzy_lookup(name: str, prob_map: dict[str, float]) -> Optional[float]:
    """Case-insensitive, punctuation-tolerant name lookup."""
    key = _normalise(name)
    for k, v in prob_map.items():
        if _normalise(k) == key:
            return v
    # Partial match fallback (last name)
    parts = key.split()
    if parts:
        last = parts[-1]
        for k, v in prob_map.items():
            if last in _normalise(k):
                return v
    return None


def _normalise(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", name.lower().strip())


def _kelly(prob: float, decimal_odds: float, fraction: float = 0.25) -> float:
    """
    Fractional Kelly criterion bet size as a % of bankroll.
    Uses quarter Kelly by default for safety.
    """
    b = decimal_odds - 1          # net profit per unit staked
    q = 1 - prob
    kelly = (b * prob - q) / b
    if kelly <= 0:
        return 0.0
    return round(kelly * fraction * 100, 2)   # as percentage


# ──────────────────────────────────────────────
# Kelly bet sizing with bankroll
# ──────────────────────────────────────────────

def recommended_bet_size(
    bankroll: float,
    model_prob: float,
    decimal_odds: float,
    fraction: float = 0.25,
    max_bet_pct: float = 5.0,
) -> dict:
    """
    Calculate recommended bet size in dollars.

    Args:
        bankroll:      Current bankroll in dollars
        model_prob:    Model's win probability (0-1)
        decimal_odds:  Best available decimal odds
        fraction:      Kelly fraction (default 0.25 = quarter Kelly)
        max_bet_pct:   Cap bet at this % of bankroll for bankroll protection

    Returns:
        dict with bet_pct, bet_amount, expected_value
    """
    kelly_pct = _kelly(model_prob, decimal_odds, fraction)
    capped_pct = min(kelly_pct, max_bet_pct)
    bet_amount = round(bankroll * capped_pct / 100, 2)

    ev = (model_prob * (decimal_odds - 1)) - (1 - model_prob)

    return {
        "kelly_pct":     kelly_pct,
        "capped_pct":    capped_pct,
        "bet_amount":    bet_amount,
        "expected_value": round(ev * 100, 2),   # EV cents per dollar staked
        "is_capped":     kelly_pct > max_bet_pct,
    }


# ──────────────────────────────────────────────
# CLI / quick test
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    odds = fetch_ufc_odds()
    print(json.dumps([asdict(o) for o in odds], indent=2, default=str))

    # Example value bet identification with dummy model probs
    dummy_probs = {
        odds[0].fighter1_name: 0.62,
        odds[0].fighter2_name: 0.38,
    } if odds else {}

    bets = find_value_bets(odds, dummy_probs)
    print("\nValue bets:")
    print(json.dumps(bets, indent=2))
