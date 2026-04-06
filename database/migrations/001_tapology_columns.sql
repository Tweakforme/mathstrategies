-- Migration 001: Add Tapology-sourced columns to fighters table
-- Run once: psql $DATABASE_URL -f database/migrations/001_tapology_columns.sql

ALTER TABLE fighters
    ADD COLUMN IF NOT EXISTS nationality               TEXT,
    ADD COLUMN IF NOT EXISTS camp                      TEXT,
    ADD COLUMN IF NOT EXISTS pre_ufc_wins              INT,
    ADD COLUMN IF NOT EXISTS pre_ufc_losses            INT,
    ADD COLUMN IF NOT EXISTS pre_ufc_draws             INT,
    ADD COLUMN IF NOT EXISTS pre_ufc_finish_rate       NUMERIC(5,3),
    ADD COLUMN IF NOT EXISTS dwcs_appeared             BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dwcs_result               TEXT,       -- 'signed' | 'not signed'
    ADD COLUMN IF NOT EXISTS regional_competition_level INT,        -- 1–5
    ADD COLUMN IF NOT EXISTS tapology_url              TEXT,
    ADD COLUMN IF NOT EXISTS tapology_scraped_at       TIMESTAMPTZ;
