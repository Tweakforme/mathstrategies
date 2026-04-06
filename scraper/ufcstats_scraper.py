"""
UFCStats.com Scraper — Fixed selectors based on live HTML inspection
"""

import requests
import time
import logging
import re
from bs4 import BeautifulSoup
from dataclasses import dataclass, field, asdict
from typing import Optional
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

BASE_URL = "http://ufcstats.com"
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
class Fighter:
    ufcstats_id: str = ""
    name: str = ""
    url: str = ""
    nickname: str = ""
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    reach_cm: Optional[float] = None
    stance: str = ""
    dob: Optional[str] = None
    wins: int = 0
    losses: int = 0
    draws: int = 0
    slpm: float = 0.0
    str_acc: float = 0.0
    sapm: float = 0.0
    str_def: float = 0.0
    td_avg: float = 0.0
    td_acc: float = 0.0
    td_def: float = 0.0
    sub_avg: float = 0.0
    wins_by_ko: int = 0
    wins_by_sub: int = 0
    wins_by_dec: int = 0
    scraped_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class Event:
    ufcstats_id: str = ""
    name: str = ""
    url: str = ""
    date: Optional[str] = None
    location: str = ""
    fights: list = field(default_factory=list)
    scraped_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class Fight:
    ufcstats_id: str = ""
    event_id: str = ""
    url: str = ""
    fighter1_id: str = ""
    fighter1_name: str = ""
    fighter2_id: str = ""
    fighter2_name: str = ""
    winner_id: Optional[str] = None
    winner_name: Optional[str] = None
    method: str = ""
    method_detail: str = ""
    round: int = 0
    time: str = ""
    time_format: str = ""
    referee: str = ""
    weight_class: str = ""
    is_title_fight: bool = False
    is_main_event: bool = False
    stats_f1: dict = field(default_factory=dict)
    stats_f2: dict = field(default_factory=dict)
    scraped_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


# ──────────────────────────────────────────────
# HTTP helpers
# ──────────────────────────────────────────────

def _get(url: str, delay: float = 1.2) -> Optional[BeautifulSoup]:
    try:
        time.sleep(delay)
        r = requests.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        return BeautifulSoup(r.text, "lxml")
    except requests.RequestException as exc:
        log.error("Failed to fetch %s — %s", url, exc)
        return None


def _pct(text: str) -> float:
    cleaned = re.sub(r'[^0-9.]', '', text.strip())
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _num(text: str) -> float:
    cleaned = re.sub(r'[^0-9.]', '', text.strip())
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def _inches_to_cm(text: str) -> Optional[float]:
    m = re.search(r"(\d+)'\s*(\d+)", text)
    if m:
        return round((int(m.group(1)) * 12 + int(m.group(2))) * 2.54, 1)
    return None


def _reach_to_cm(text: str) -> Optional[float]:
    m = re.search(r"(\d+\.?\d*)", text)
    if m:
        return round(float(m.group(1)) * 2.54, 1)
    return None


def _lbs_to_kg(text: str) -> Optional[float]:
    m = re.search(r"(\d+\.?\d*)", text)
    if m:
        return round(float(m.group(1)) * 0.453592, 1)
    return None


def _id_from_url(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


# ──────────────────────────────────────────────
# Fighter scraper — FIXED
# ──────────────────────────────────────────────

def scrape_fighter(url: str) -> Optional[Fighter]:
    soup = _get(url)
    if not soup:
        return None

    f = Fighter(url=url, ufcstats_id=_id_from_url(url))

    # Name
    name_tag = soup.select_one("span.b-content__title-highlight")
    if name_tag:
        f.name = name_tag.get_text(strip=True)

    # Nickname
    nick_tag = soup.select_one("p.b-content__Nickname")
    if nick_tag:
        f.nickname = nick_tag.get_text(strip=True).strip('"')

    # Record
    record_tag = soup.select_one("span.b-content__title-record")
    if record_tag:
        m = re.search(r"(\d+)-(\d+)-(\d+)", record_tag.get_text())
        if m:
            f.wins   = int(m.group(1))
            f.losses = int(m.group(2))
            f.draws  = int(m.group(3))

    # ── Physical + career stats from ALL <li> elements ──
    # UFCStats puts all stats in plain <li> tags — use broad selector
    all_li = soup.find_all("li")
    for li in all_li:
        txt = li.get_text(" ", strip=True)
        if ":" not in txt:
            continue
        key, _, val = txt.partition(":")
        key = key.strip()
        val = val.strip()

        if key == "Height":
            f.height_cm = _inches_to_cm(val)
        elif key == "Weight":
            f.weight_kg = _lbs_to_kg(val)
        elif key == "Reach":
            f.reach_cm = _reach_to_cm(val)
        elif key == "STANCE":
            f.stance = val
        elif key == "DOB":
            f.dob = val
        elif key == "SLpM":
            f.slpm = _num(val)
        elif key == "Str. Acc.":
            f.str_acc = _pct(val)
        elif key == "SApM":
            f.sapm = _num(val)
        elif key == "Str. Def":
            f.str_def = _pct(val)
        elif key == "TD Avg.":
            f.td_avg = _num(val)
        elif key == "TD Acc.":
            f.td_acc = _pct(val)
        elif key == "TD Def.":
            f.td_def = _pct(val)
        elif key == "Sub. Avg.":
            f.sub_avg = _num(val)

    # Win breakdown from fight history table
    fight_rows = soup.select("table.b-fight-details__table tbody tr")
    for row in fight_rows:
        cols = row.find_all("td")
        if len(cols) < 8:
            continue
        result = cols[0].get_text(strip=True).upper()
        method = cols[7].get_text(strip=True).upper() if len(cols) > 7 else ""
        if result == "WIN" or result == "W":
            if "KO" in method or "TKO" in method:
                f.wins_by_ko += 1
            elif "SUB" in method:
                f.wins_by_sub += 1
            elif "DEC" in method:
                f.wins_by_dec += 1

    log.debug("Scraped fighter: %s — SLpM=%.2f, Acc=%.1f%%", f.name, f.slpm, f.str_acc)
    return f


# ──────────────────────────────────────────────
# Event + fight scraper — FIXED
# ──────────────────────────────────────────────

def scrape_event_list(upcoming: bool = False) -> list[dict]:
    path = "/statistics/events/upcoming" if upcoming else "/statistics/events/completed?page=all"
    soup = _get(f"{BASE_URL}{path}")
    if not soup:
        return []

    events = []
    # All event rows — any tr with an event-details link
    for a_tag in soup.find_all("a", href=lambda h: h and "event-details" in h):
        url  = a_tag.get("href", "")
        name = a_tag.get_text(strip=True)
        if not name or not url:
            continue
        # Date + location are in sibling tds
        row  = a_tag.find_parent("tr")
        cols = row.find_all("td") if row else []
        date = cols[1].get_text(strip=True) if len(cols) > 1 else ""
        loc  = cols[2].get_text(strip=True) if len(cols) > 2 else ""
        events.append({"name": name, "url": url, "date": date, "location": loc})

    log.info("Found %d events (upcoming=%s)", len(events), upcoming)
    return events


def scrape_event(url: str) -> Optional[Event]:
    soup = _get(url)
    if not soup:
        return None

    ev = Event(url=url, ufcstats_id=_id_from_url(url))

    # Event name
    name_tag = soup.select_one("span.b-content__title-highlight")
    if name_tag:
        ev.name = name_tag.get_text(strip=True)

    # Date + location from li tags
    for li in soup.find_all("li"):
        txt = li.get_text(" ", strip=True)
        if "Date:" in txt:
            ev.date = txt.split("Date:", 1)[1].strip()
        elif "Location:" in txt:
            ev.location = txt.split("Location:", 1)[1].strip()

    # ── Fight rows ──────────────────────────────────────────
    # Each tr in the main table is one fight
    all_rows = soup.find_all("tr")
    fight_rows = [r for r in all_rows if len(r.find_all("td")) >= 8]

    for i, row in enumerate(fight_rows):
        fight = _parse_fight_row(row, ev.ufcstats_id)
        if fight and fight.fighter1_id:
            fight.is_main_event = (i == 0)
            ev.fights.append(fight)

    log.info("Scraped event: %s — %d fights", ev.name, len(ev.fights))
    return ev


def _parse_fight_row(row, event_id: str) -> Optional[Fight]:
    """
    Parse one fight row from the event page table.

    Confirmed column layout (from live HTML inspection):
      col0: result ('win'/'loss') + fight-details URL in <a>
      col1: fighter names in <p> tags, fighter URLs in <a> tags
      col2: win streak / flag (ignore)
      col3: striking totals
      col4: td totals
      col5: sub attempts
      col6: weight class
      col7: method (U-DEC / KO / TKO / SUB etc)
      col8: round
      col9: time
    """
    cols = row.find_all("td")
    if len(cols) < 8:
        return None

    fight = Fight(event_id=event_id)

    # ── Fight URL + result from col0 ──
    col0_links = cols[0].find_all("a")
    if col0_links:
        fight.url = col0_links[0].get("href", "")
        fight.ufcstats_id = _id_from_url(fight.url)

    result_text = cols[0].get_text(strip=True).lower()

    # ── Fighter names + IDs from col1 ──
    fighter_ps    = cols[1].find_all("p")
    fighter_links = cols[1].find_all("a")

    if len(fighter_links) >= 2:
        fight.fighter1_name = fighter_links[0].get_text(strip=True)
        fight.fighter1_id   = _id_from_url(fighter_links[0].get("href", ""))
        fight.fighter2_name = fighter_links[1].get_text(strip=True)
        fight.fighter2_id   = _id_from_url(fighter_links[1].get("href", ""))
    elif len(fighter_ps) >= 2:
        fight.fighter1_name = fighter_ps[0].get_text(strip=True)
        fight.fighter2_name = fighter_ps[1].get_text(strip=True)

    # ── Winner — col0 result is always from fighter1's perspective ──
    if result_text == "win":
        fight.winner_id   = fight.fighter1_id
        fight.winner_name = fight.fighter1_name
    elif result_text == "loss":
        fight.winner_id   = fight.fighter2_id
        fight.winner_name = fight.fighter2_name
    # draw / nc — winner stays None

    # ── Weight class from col6 ──
    if len(cols) > 6:
        fight.weight_class = cols[6].get_text(strip=True)
        if "title" in fight.weight_class.lower() or "championship" in fight.weight_class.lower():
            fight.is_title_fight = True

    # ── Method from col7 ──
    if len(cols) > 7:
        method_raw = cols[7].get_text(strip=True).upper()
        fight.method_detail = method_raw
        if "KO" in method_raw or "TKO" in method_raw:
            fight.method = "KO/TKO"
        elif "SUB" in method_raw:
            fight.method = "SUB"
        elif "DEC" in method_raw:
            fight.method = "DEC"
        elif "NC" in method_raw:
            fight.method = "NC"
        elif "DRAW" in method_raw:
            fight.method = "DRAW"
        else:
            fight.method = method_raw

    # ── Round from col8 ──
    if len(cols) > 8:
        fight.round = int(_num(cols[8].get_text(strip=True)) or 0)

    # ── Time from col9 ──
    if len(cols) > 9:
        fight.time = cols[9].get_text(strip=True)

    return fight


# ──────────────────────────────────────────────
# Fight detail stats
# ──────────────────────────────────────────────

def _parse_stat_value(text: str) -> dict:
    text = text.strip()
    m = re.match(r"(\d+)\s+of\s+(\d+)", text, re.IGNORECASE)
    if m:
        landed, attempted = int(m.group(1)), int(m.group(2))
        acc = round(landed / attempted * 100, 1) if attempted else 0.0
        return {"landed": landed, "attempted": attempted, "accuracy_pct": acc}
    try:
        return {"value": float(text)}
    except ValueError:
        return {"value": 0}


def scrape_fight_stats(fight_url: str) -> dict:
    soup = _get(fight_url)
    if not soup:
        return {}

    result = {"fighter1_stats": {}, "fighter2_stats": {}}
    tables = soup.select("table.b-fight-details__table")
    if not tables:
        return result

    for t_idx, table in enumerate(tables[:2]):
        headers = [th.get_text(strip=True) for th in table.select("thead th")]
        data_rows = table.select("tbody tr")
        if not data_rows:
            continue
        row = data_rows[0]
        cells = row.find_all("td")
        prefix = "sig_" if t_idx == 1 else ""
        for i, cell in enumerate(cells):
            ps = cell.find_all("p")
            if len(ps) >= 2:
                label = prefix + (headers[i] if i < len(headers) else f"col_{i}")
                result["fighter1_stats"][label] = _parse_stat_value(ps[0].get_text(strip=True))
                result["fighter2_stats"][label] = _parse_stat_value(ps[1].get_text(strip=True))

    return result


# ──────────────────────────────────────────────
# High-level orchestrators
# ──────────────────────────────────────────────

def scrape_upcoming_event() -> Optional[Event]:
    upcoming = scrape_event_list(upcoming=True)
    if not upcoming:
        log.warning("No upcoming events found.")
        return None
    log.info("Next event: %s on %s", upcoming[0]["name"], upcoming[0]["date"])
    return scrape_event(upcoming[0]["url"])


def scrape_recent_events(n: int = 5) -> list[Event]:
    all_events = scrape_event_list(upcoming=False)
    events = []
    for ev_meta in all_events[:n]:
        ev = scrape_event(ev_meta["url"])
        if ev:
            events.append(ev)
    return events


def scrape_fighters_for_event(event: Event) -> dict:
    ids_seen = set()
    fighter_map = {}
    for fight in event.fights:
        for fid, fname in [
            (fight.fighter1_id, fight.fighter1_name),
            (fight.fighter2_id, fight.fighter2_name),
        ]:
            if fid and fid not in ids_seen:
                ids_seen.add(fid)
                url = f"{BASE_URL}/fighter-details/{fid}"
                log.info("Scraping fighter: %s", fname)
                f = scrape_fighter(url)
                if f:
                    fighter_map[fid] = f
    return fighter_map


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import json, argparse
    from dataclasses import asdict

    parser = argparse.ArgumentParser(description="UFCStats Scraper")
    parser.add_argument("--mode", choices=["upcoming", "recent", "fighter", "events"], default="upcoming")
    parser.add_argument("--url",    help="Specific fighter or event URL")
    parser.add_argument("--n",      type=int, default=3)
    parser.add_argument("--output", default="scrape_output.json")
    args = parser.parse_args()

    data = None
    if args.mode == "upcoming":
        event = scrape_upcoming_event()
        if event:
            fighters = scrape_fighters_for_event(event)
            data = {
                "event":    asdict(event),
                "fighters": {k: asdict(v) for k, v in fighters.items()},
            }
    elif args.mode == "recent":
        events = scrape_recent_events(args.n)
        data = {"events": [asdict(e) for e in events]}
    elif args.mode == "fighter" and args.url:
        fighter = scrape_fighter(args.url)
        data = asdict(fighter) if fighter else {}

    if data:
        with open(args.output, "w") as fp:
            json.dump(data, fp, indent=2, default=str)
        log.info("Output written to %s", args.output)