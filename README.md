# UFC Prediction System

A full-stack UFC betting prediction system. This README covers setup and usage for the **Python scraping layer** (Phase 1).

## Project Structure

```
ufc-prediction/
├── scraper/
│   ├── ufcstats_scraper.py    ← UFCStats.com scraper (fighters, events, fights)
│   └── odds_scraper.py        ← The Odds API + value bet logic
├── database/
│   └── db.py                  ← PostgreSQL schema + upsert helpers
├── models/                    ← (Phase 2) XGBoost prediction model
├── pipeline.py                ← Main orchestrator / CLI
├── requirements.txt
└── .env.example
```

## Setup

### 1. Install dependencies
```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Set up PostgreSQL
```bash
createdb ufc_predictions
createuser ufc -P             # set password: ufc
psql -c "GRANT ALL ON DATABASE ufc_predictions TO ufc;"
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and ODDS_API_KEY
```
Get a free Odds API key at https://the-odds-api.com (500 requests/month free tier).

### 4. Initialise database
```bash
python pipeline.py init-db
```

### 5. Backfill historical data (recommended — trains the model on past fights)
```bash
python pipeline.py scrape-history --n 50   # ~50 events = ~1hr runtime
```

---

## Usage

### Before fight night (run manually or via cron)
```bash
# Scrape upcoming event + odds
python pipeline.py scrape-upcoming

# Run predictions (after model is trained)
python pipeline.py predict --event-id <event_id>

# Or do both in one command
python pipeline.py full-run
```

### After an event (for model feedback loop)
```bash
# Re-scrape event to get results, then record accuracy
python pipeline.py scrape-history --n 1
python pipeline.py record-results --event-id <event_id>
```

### Scrape a specific fighter
```bash
python scraper/ufcstats_scraper.py \
    --mode fighter \
    --url http://ufcstats.com/fighter-details/1338df677b2c0c32
```

---

## Cron Job Setup

Add to crontab (`crontab -e`) to auto-run every Wednesday at 9am
(UFC events are typically Saturday; odds update mid-week):

```cron
# Scrape upcoming UFC event every Wednesday at 9am
0 9 * * 3 cd /path/to/ufc-prediction && /path/to/venv/bin/python pipeline.py full-run >> cron.log 2>&1

# Record results every Sunday at 11pm (after Saturday events)  
0 23 * * 0 cd /path/to/ufc-prediction && /path/to/venv/bin/python pipeline.py scrape-history --n 1 >> cron.log 2>&1
```

---

## Scraper Notes

### UFCStats.com
- Fighter index: `http://ufcstats.com/statistics/fighters?char=a&page=all`
- Fighter profile: `http://ufcstats.com/fighter-details/{id}`
- Event list: `http://ufcstats.com/statistics/events/completed?page=all`
- Event detail: `http://ufcstats.com/event-details/{id}`
- Fight detail: `http://ufcstats.com/fight-details/{id}`

The scraper uses a 1.2s delay between requests to be polite to UFCStats.

### Data scraped per fighter
- Physical: height, weight, reach, stance, DOB
- Career record: W/L/D
- Striking: SLpM, accuracy, absorbed, defence
- Grappling: TD avg, TD acc, TD def, sub avg
- Finish breakdown: KO wins, SUB wins, decision wins

### Data scraped per fight
- Result, method, round, time
- Per-fighter striking totals (total + significant)
- Per-fighter grappling totals

---

## Phase 2 (Next Steps)
- [ ] XGBoost model with feature engineering
- [ ] Next.js dashboard
- [ ] Line movement tracking
- [ ] Weight cut / reach delta features
- [ ] Opposition quality scoring (ELO-style)
