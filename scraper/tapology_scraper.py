"""
Tapology Scraper
================
Scrapes fighter nationality, training camp, pre-UFC record, and DWCS info
from tapology.com using Playwright (real Chromium browser — bypasses Cloudflare).
"""

import re
import time
import random
import logging
from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote_plus

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext

log = logging.getLogger(__name__)

BASE_URL = "https://www.tapology.com"
SEARCH_URL = f"{BASE_URL}/search"

REQUEST_DELAY_MIN = 4.0
REQUEST_DELAY_MAX = 8.0

_playwright = None
_browser: Optional[Browser] = None
_context: Optional[BrowserContext] = None
_page: Optional[Page] = None
_request_count: int = 0
SESSION_RESET_EVERY = 50


# ──────────────────────────────────────────────
# Browser management
# ──────────────────────────────────────────────

def _init_browser():
    global _playwright, _browser, _context, _page, _request_count
    log.info("Launching Playwright Chromium browser…")
    if _playwright is None:
        _playwright = sync_playwright().start()
    if _browser is not None:
        try:
            _browser.close()
        except Exception:
            pass
    _browser = _playwright.chromium.launch(
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
    )
    _context = _browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        viewport={"width": 1280, "height": 800},
        locale="en-US",
        timezone_id="America/New_York",
    )
    # Remove webdriver flag
    _context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    _page = _context.new_page()
    # Warm up — load homepage to get cookies
    try:
        _page.goto(BASE_URL, wait_until="domcontentloaded", timeout=20000)
        time.sleep(2.0)
    except Exception as e:
        log.warning("Browser warmup failed: %s", e)
    _request_count = 0
    log.info("Browser ready.")


def _get_page() -> Page:
    global _request_count
    if _page is None or _request_count >= SESSION_RESET_EVERY:
        _init_browser()
    return _page


def _get_html(url: str, retries: int = 3) -> Optional[BeautifulSoup]:
    global _request_count, _page
    for attempt in range(retries):
        try:
            page = _get_page()
            resp = page.goto(url, wait_until="domcontentloaded", timeout=25000)
            _request_count += 1

            if resp and resp.status == 403:
                log.warning("403 from Tapology — resetting browser (attempt %d/%d)", attempt + 1, retries)
                _init_browser()
                time.sleep(15 + random.uniform(5, 10))
                continue

            # Wait a moment for JS to render
            time.sleep(1.5)
            html = page.content()

            # Check for Cloudflare challenge
            if "cf-browser-verification" in html or "Just a moment" in html:
                log.warning("Cloudflare challenge detected — waiting 10s…")
                time.sleep(10)
                html = page.content()

            return BeautifulSoup(html, "html.parser")

        except Exception as exc:
            log.warning("Browser error (attempt %d/%d): %s", attempt + 1, retries, exc)
            _init_browser()
            time.sleep(5 * (attempt + 1))

    return None


def cleanup_browser():
    """Call this when done to close the browser."""
    global _playwright, _browser, _context, _page
    try:
        if _browser:
            _browser.close()
        if _playwright:
            _playwright.stop()
    except Exception:
        pass
    _browser = None
    _context = None
    _page = None
    _playwright = None


# ──────────────────────────────────────────────
# Data class
# ──────────────────────────────────────────────

@dataclass
class TapologyFighter:
    name: str = ""
    tapology_url: str = ""
    nationality: Optional[str] = None
    camp: Optional[str] = None
    pre_ufc_wins: int = 0
    pre_ufc_losses: int = 0
    pre_ufc_draws: int = 0
    pre_ufc_finish_rate: Optional[float] = None
    dwcs_appeared: bool = False
    dwcs_result: Optional[str] = None
    regional_competition_level: Optional[int] = None


# ──────────────────────────────────────────────
# Search
# ──────────────────────────────────────────────

def search_tapology_fighter(name: str) -> Optional[str]:
    url = f"{SEARCH_URL}?term={quote_plus(name)}"
    soup = _get_html(url)
    if not soup:
        return None

    candidate_links = [
        a for a in soup.find_all("a", href=True)
        if "/fightcenter/fighters/" in a["href"]
    ]

    if not candidate_links:
        log.debug("No Tapology results for: %s", name)
        return None

    search_words = set(re.sub(r"['\u2019]", "", name.lower()).split())
    best_href = None
    best_score = -1

    for link in candidate_links:
        raw_text = link.get_text(strip=True)
        clean_text = re.sub(r'[\"\u201c\u201d\u2018\u2019][^\"\u201c\u201d\u2018\u2019]*[\"\u201c\u201d\u2018\u2019]', "", raw_text)
        clean_text = re.sub(r'\([^)]*\)', "", clean_text).strip()
        result_words = set(re.sub(r"['\u2019]", "", clean_text.lower()).split())

        score = len(search_words & result_words)
        if score > best_score:
            best_score = score
            best_href = link["href"]

        if score == len(search_words):
            break

    if best_href is None:
        return None
    return best_href if best_href.startswith("http") else BASE_URL + best_href


# ──────────────────────────────────────────────
# Profile scraping
# ──────────────────────────────────────────────

def scrape_tapology_fighter(profile_url: str) -> Optional[TapologyFighter]:
    soup = _get_html(profile_url)
    if not soup:
        return None

    fighter = TapologyFighter(tapology_url=profile_url)

    for a in soup.select('a[href*="mma-fighters-by-nationality"]'):
        img = a.find("img", title=True)
        if img:
            fighter.nationality = img["title"]
            break

    aff_strong = soup.find("strong", string=lambda t: t and "Affiliation" in t)
    if aff_strong:
        span = aff_strong.find_next("span")
        if span:
            fighter.camp = span.get_text(strip=True)

    (
        fighter.pre_ufc_wins,
        fighter.pre_ufc_losses,
        fighter.pre_ufc_draws,
        fighter.pre_ufc_finish_rate,
        fighter.dwcs_appeared,
        fighter.dwcs_result,
    ) = _parse_fight_record(soup)

    total = fighter.pre_ufc_wins + fighter.pre_ufc_losses + fighter.pre_ufc_draws
    fighter.regional_competition_level = _rate_regional_level(
        total, fighter.pre_ufc_finish_rate, fighter.dwcs_appeared
    )

    return fighter


def _parse_fight_record(soup: BeautifulSoup):
    rows = soup.find_all("div", attrs={"data-fighter-bout-target": "bout"})

    bouts = []
    for row in rows:
        status = row.get("data-status", "").lower()
        if status in ("cancelled", "upcoming"):
            continue

        event_link = row.select_one('a[href*="/fightcenter/events/"]')
        event_name = event_link.get_text(strip=True) if event_link else ""

        method_div = row.select_one("div[class*='rotate']")
        method = method_div.get_text(strip=True).upper() if method_div else ""

        bouts.append({"status": status, "event": event_name, "method": method})

    bouts.reverse()

    ufc_debut_idx = None
    for i, bout in enumerate(bouts):
        if _is_ufc_event(bout["event"]):
            ufc_debut_idx = i
            break

    pre_ufc_bouts = bouts if ufc_debut_idx is None else bouts[:ufc_debut_idx]

    wins = losses = draws = finishes = 0
    dwcs_appeared = False
    dwcs_result = None

    for bout in pre_ufc_bouts:
        status = bout["status"]
        event = bout["event"]
        method = bout["method"]

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
    name = event_name.upper()
    return (
        name.startswith("UFC ") or
        name.startswith("THE ULTIMATE FIGHTER") or
        name.startswith("TUF ") or
        "ULTIMATE FIGHTING CHAMPIONSHIP" in name
    )


def _is_dwcs_event(event_name: str) -> bool:
    name = event_name.upper()
    return "CONTENDER" in name or "DWCS" in name or "DANA WHITE" in name


def _rate_regional_level(total_pro_fights: int, finish_rate: Optional[float], dwcs: bool) -> int:
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
    results = []
    total = len(fighters)

    try:
        for i, fighter in enumerate(fighters):
            name = fighter.get("name", "")
            log.info("[%d/%d] Tapology: %s", i + 1, total, name)

            try:
                profile_url = search_tapology_fighter(name)
                time.sleep(random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX))

                if not profile_url:
                    log.warning("  No Tapology profile found for: %s", name)
                    continue

                tap_fighter = scrape_tapology_fighter(profile_url)
                time.sleep(random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX))

                if tap_fighter:
                    tap_fighter.name = name
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
                time.sleep(random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX))
    finally:
        cleanup_browser()

    return results
