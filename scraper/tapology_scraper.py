"""
Tapology Scraper
================
Scrapes fighter nationality, training camp, pre-UFC record, and DWCS info
from tapology.com, then matches fighters by name to our fighters table.

Uses cloudscraper to bypass Cloudflare/bot-detection on Tapology.

Usage:
    from scraper.tapology_scraper import scrape_tapology_fighter, search_tapology_fighter
"""

import re
import time
import logging
from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote_plus

import cloudscraper
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

BASE_URL = "https://www.tapology.com"
SEARCH_URL = f"{BASE_URL}/search"

# Rate limit: be polite — Tapology is a community site
REQUEST_DELAY = 3.0  # seconds between requests

# Module-level cloudscraper session (handles cookies + CF challenge automatically)
_scraper: Optional[cloudscraper.CloudScraper] = None


def _get_scraper() -> cloudscraper.CloudScraper:
    global _scraper
    if _scraper is None:
        _scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        # Warm up with homepage so cookies are set
        try:
            _scraper.get(BASE_URL, timeout=15)
            time.sleep(1.5)
        except Exception:
            pass
    return _scraper


# ──────────────────────────────────────────────
# Data class
# ──────────────────────────────────────────────

@dataclass
class TapologyFighter:
    name: str = ""
    tapology_url: str = ""
    nationality: Optional[str] = None
    camp: Optional[str] = None              # Training team/gym
    pre_ufc_wins: int = 0
    pre_ufc_losses: int = 0
    pre_ufc_draws: int = 0
    pre_ufc_finish_rate: Optional[float] = None   # 0.0 – 1.0
    dwcs_appeared: bool = False
    dwcs_result: Optional[str] = None       # "signed" | "not signed"
    regional_competition_level: Optional[int] = None  # 1–5 rating


# ──────────────────────────────────────────────
# HTTP helper
# ──────────────────────────────────────────────

def _get(url: str, retries: int = 3) -> Optional[BeautifulSoup]:
    """GET a URL with retries and return a BeautifulSoup object, or None."""
    sc = _get_scraper()
    for attempt in range(retries):
        try:
            resp = sc.get(url, timeout=20)
            if resp.status_code == 429:
                wait = 30 * (attempt + 1)
                log.warning("Rate limited by Tapology — waiting %ds", wait)
                time.sleep(wait)
                continue
            if resp.status_code == 200:
                return BeautifulSoup(resp.text, "html.parser")
            log.warning("HTTP %d for %s", resp.status_code, url)
            return None
        except Exception as exc:
            log.warning("Request error (attempt %d/%d): %s", attempt + 1, retries, exc)
            time.sleep(5 * (attempt + 1))
    return None


# ──────────────────────────────────────────────
# Search
# ──────────────────────────────────────────────

def search_tapology_fighter(name: str) -> Optional[str]:
    """
    Search Tapology for a fighter by name.
    Returns the URL of the best-matching fighter profile, or None.
    Picks the result whose anchor text most closely matches the query name.
    """
    url = f"{SEARCH_URL}?term={quote_plus(name)}"
    soup = _get(url)
    if not soup:
        return None

    # Search results are table rows with altA/altB cells
    # Each row: name link | weight class | record | country
    candidate_links = [
        a for a in soup.find_all("a", href=True)
        if "/fightcenter/fighters/" in a["href"]
    ]

    if not candidate_links:
        log.debug("No Tapology results for: %s", name)
        return None

    # All words in the searched name must appear as whole words in the result text
    search_words = set(re.sub(r"['\u2019]", "", name.lower()).split())

    best_href = None
    best_score = -1

    for link in candidate_links:
        raw_text = link.get_text(strip=True)
        # Strip nickname in quotes: e.g. "Bones" or "Sugar"
        clean_text = re.sub(r'[\"\u201c\u201d\u2018\u2019][^\"\u201c\u201d\u2018\u2019]*[\"\u201c\u201d\u2018\u2019]', "", raw_text)
        # Also strip parenthetical nicknames
        clean_text = re.sub(r'\([^)]*\)', "", clean_text).strip()
        result_words = set(re.sub(r"['\u2019]", "", clean_text.lower()).split())

        # Score = number of search words found in result words
        score = len(search_words & result_words)
        if score > best_score:
            best_score = score
            best_href = link["href"]

        # Perfect match — stop immediately
        if score == len(search_words):
            break

    if best_href is None:
        return None
    return best_href if best_href.startswith("http") else BASE_URL + best_href


# ──────────────────────────────────────────────
# Profile scraping
# ──────────────────────────────────────────────

def scrape_tapology_fighter(profile_url: str) -> Optional[TapologyFighter]:
    """
    Scrape a single Tapology fighter profile page.
    Returns a TapologyFighter dataclass, or None on failure.
    """
    soup = _get(profile_url)
    if not soup:
        return None

    fighter = TapologyFighter(tapology_url=profile_url)

    # ── Nationality ──────────────────────────────────────────────────────────
    # <a href="/search/mma-fighters-by-nationality/country-us"><img title="United States" ...>
    for a in soup.select('a[href*="mma-fighters-by-nationality"]'):
        img = a.find("img", title=True)
        if img:
            fighter.nationality = img["title"]
            break

    # ── Training Camp / Affiliation ──────────────────────────────────────────
    # <strong>Affiliation:</strong> <span><a>Camp Name</a></span>
    aff_strong = soup.find("strong", string=lambda t: t and "Affiliation" in t)
    if aff_strong:
        span = aff_strong.find_next("span")
        if span:
            fighter.camp = span.get_text(strip=True)

    # ── Fight record ─────────────────────────────────────────────────────────
    (
        fighter.pre_ufc_wins,
        fighter.pre_ufc_losses,
        fighter.pre_ufc_draws,
        fighter.pre_ufc_finish_rate,
        fighter.dwcs_appeared,
        fighter.dwcs_result,
    ) = _parse_fight_record(soup)

    # ── Regional competition level ───────────────────────────────────────────
    total = fighter.pre_ufc_wins + fighter.pre_ufc_losses + fighter.pre_ufc_draws
    fighter.regional_competition_level = _rate_regional_level(
        total, fighter.pre_ufc_finish_rate, fighter.dwcs_appeared
    )

    return fighter


def _parse_fight_record(soup: BeautifulSoup):
    """
    Parse the fighter's bout history from Tapology profile.
    Identifies UFC debut then counts pre-UFC fights.
    Bouts are shown newest-first on the page, so we scan in reverse to find
    the chronological UFC debut and count everything before it.

    Returns:
        (pre_ufc_wins, pre_ufc_losses, pre_ufc_draws, finish_rate,
         dwcs_appeared, dwcs_result)
    """
    rows = soup.find_all("div", attrs={"data-fighter-bout-target": "bout"})

    # Build a chronological list (page order is newest-first)
    bouts = []
    for row in rows:
        status = row.get("data-status", "").lower()   # win | loss | draw | nc | cancelled | upcoming
        if status in ("cancelled", "upcoming"):
            continue

        event_link = row.select_one('a[href*="/fightcenter/events/"]')
        event_name = event_link.get_text(strip=True) if event_link else ""

        method_div = row.select_one("div[class*='rotate']")
        method = method_div.get_text(strip=True).upper() if method_div else ""

        bouts.append({
            "status": status,
            "event": event_name,
            "method": method,
        })

    # Reverse to get chronological order (oldest first)
    bouts.reverse()

    # Find index of first UFC fight
    ufc_debut_idx = None
    for i, bout in enumerate(bouts):
        event = bout["event"]
        if _is_ufc_event(event):
            ufc_debut_idx = i
            break

    # Pre-UFC fights = everything before the UFC debut
    if ufc_debut_idx is None:
        # Fighter has never fought in UFC — treat entire record as non-UFC
        # (may be a prospect or came from another org permanently)
        pre_ufc_bouts = bouts
    else:
        pre_ufc_bouts = bouts[:ufc_debut_idx]

    wins = losses = draws = finishes = 0
    dwcs_appeared = False
    dwcs_result = None

    for bout in pre_ufc_bouts:
        status = bout["status"]
        event = bout["event"]
        method = bout["method"]

        # DWCS detection
        if _is_dwcs_event(event):
            dwcs_appeared = True
            if status == "win":
                dwcs_result = "signed"
            elif status == "loss":
                dwcs_result = "not signed"

        if status == "win":
            wins += 1
            if method in ("KO", "TKO", "SUB", "SUBMISSION"):
                finishes += 1
        elif status == "loss":
            losses += 1
        elif status in ("draw", "nc", "no contest"):
            draws += 1

    total = wins + losses
    finish_rate = round(finishes / total, 3) if total > 0 else None

    return wins, losses, draws, finish_rate, dwcs_appeared, dwcs_result


def _is_ufc_event(event_name: str) -> bool:
    """Return True if the event name belongs to the UFC."""
    name = event_name.upper()
    return (
        name.startswith("UFC ") or
        name.startswith("THE ULTIMATE FIGHTER") or
        name.startswith("TUF ") or
        "ULTIMATE FIGHTING CHAMPIONSHIP" in name
    )


def _is_dwcs_event(event_name: str) -> bool:
    """Return True if the event is Dana White's Contender Series."""
    name = event_name.upper()
    return "CONTENDER" in name or "DWCS" in name or "DANA WHITE" in name


def _rate_regional_level(total_pro_fights: int, finish_rate: Optional[float], dwcs: bool) -> int:
    """
    Rate pre-UFC regional competition level on a 1–5 scale.

    1 — Very low  (< 3 fights)
    2 — Low       (3–7 fights, regional circuit)
    3 — Medium    (8–15 fights, decent regional experience)
    4 — High      (16+ fights OR DWCS appearance)
    5 — Elite     (DWCS + high finish rate + volume)
    """
    if total_pro_fights < 3:
        return 1
    if total_pro_fights < 8:
        score = 2
    elif total_pro_fights < 16:
        score = 3
    else:
        score = 4

    if dwcs:
        score = min(score + 1, 5)

    if finish_rate is not None and finish_rate >= 0.7 and total_pro_fights >= 8:
        score = min(score + 1, 5)

    return score


# ──────────────────────────────────────────────
# Batch scraping — called from pipeline.py
# ──────────────────────────────────────────────

def scrape_all_fighters_tapology(fighters: list[dict]) -> list[TapologyFighter]:
    """
    Given a list of fighter dicts (must have 'name' key), search Tapology for
    each one and scrape their profile. Returns a list of TapologyFighter objects.
    """
    results = []
    total = len(fighters)

    for i, fighter in enumerate(fighters):
        name = fighter.get("name", "")
        log.info("[%d/%d] Tapology: %s", i + 1, total, name)

        try:
            profile_url = search_tapology_fighter(name)
            time.sleep(REQUEST_DELAY)

            if not profile_url:
                log.warning("  No Tapology profile found for: %s", name)
                continue

            log.debug("  Profile URL: %s", profile_url)
            tap_fighter = scrape_tapology_fighter(profile_url)
            time.sleep(REQUEST_DELAY)

            if tap_fighter:
                tap_fighter.name = name  # Use canonical DB name for matching
                results.append(tap_fighter)
                log.info(
                    "  OK — nationality=%s camp=%s pre_ufc=%d-%d DWCS=%s level=%s",
                    tap_fighter.nationality,
                    tap_fighter.camp,
                    tap_fighter.pre_ufc_wins,
                    tap_fighter.pre_ufc_losses,
                    tap_fighter.dwcs_appeared,
                    tap_fighter.regional_competition_level,
                )
            else:
                log.warning("  Scrape failed for: %s", name)

        except Exception as exc:
            log.error("  Error scraping %s: %s", name, exc, exc_info=True)
            time.sleep(REQUEST_DELAY)

    return results
