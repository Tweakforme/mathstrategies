import { query, queryOne } from "./db";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Event {
  id: string;
  name: string;
  date: string;
  location: string;
}

export interface FightCard {
  id: string;
  fighter1_id: string;
  fighter2_id: string;
  fighter1_name: string;
  fighter2_name: string;
  weight_class: string;
  is_main_event: boolean;
  is_title_fight: boolean;
  // Fighter stats
  f1_wins: number;
  f1_losses: number;
  f1_draws: number;
  f1_wins_by_ko: number;
  f1_wins_by_sub: number;
  f1_wins_by_dec: number;
  f1_slpm: number;
  f1_str_acc: number;
  f1_sapm: number;
  f1_str_def: number;
  f1_td_avg: number;
  f1_nationality: string | null;
  f1_camp: string | null;
  f1_pre_ufc_wins: number | null;
  f1_pre_ufc_losses: number | null;
  f2_wins: number;
  f2_losses: number;
  f2_draws: number;
  f2_wins_by_ko: number;
  f2_wins_by_sub: number;
  f2_wins_by_dec: number;
  f2_slpm: number;
  f2_str_acc: number;
  f2_sapm: number;
  f2_str_def: number;
  f2_td_avg: number;
  f2_nationality: string | null;
  f2_camp: string | null;
  f2_pre_ufc_wins: number | null;
  f2_pre_ufc_losses: number | null;
  // Prediction (null if model hasn't run)
  f1_win_prob: number | null;
  f2_win_prob: number | null;
  confidence: number | null;
  is_value_bet: boolean | null;
  value_fighter: string | null;
  value_edge: number | null;
  kelly_pct: number | null;
  // Odds (null if not scraped)
  consensus_f1_decimal: number | null;
  consensus_f2_decimal: number | null;
  best_f1_decimal: number | null;
  best_f2_decimal: number | null;
}

export interface Fighter {
  id: string;
  name: string;
  nickname: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  reach_cm: number | null;
  stance: string | null;
  dob: string | null;
  wins: number;
  losses: number;
  draws: number;
  slpm: number;
  str_acc: number;
  sapm: number;
  str_def: number;
  td_avg: number;
  td_acc: number;
  td_def: number;
  sub_avg: number;
  wins_by_ko: number;
  wins_by_sub: number;
  wins_by_dec: number;
  nationality: string | null;
  camp: string | null;
  pre_ufc_wins: number | null;
  pre_ufc_losses: number | null;
  pre_ufc_finish_rate: number | null;
  dwcs_appeared: boolean | null;
  dwcs_result: string | null;
  regional_competition_level: number | null;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Next upcoming event (date >= today). */
export async function getNextEvent(): Promise<Event | null> {
  return queryOne<Event>(
    `SELECT id, name, date::text, location
     FROM events
     WHERE date >= CURRENT_DATE
     ORDER BY date ASC
     LIMIT 1`
  );
}

/** All fights for an event, joined with fighter stats + latest prediction + latest odds. */
export async function getFightCard(eventId: string): Promise<FightCard[]> {
  return query<FightCard>(
    `SELECT
        f.id, f.fighter1_id, f.fighter2_id,
        f.fighter1_name, f.fighter2_name,
        f.weight_class, f.is_main_event, f.is_title_fight,

        fi1.wins          AS f1_wins,
        fi1.losses        AS f1_losses,
        fi1.draws         AS f1_draws,
        fi1.wins_by_ko    AS f1_wins_by_ko,
        fi1.wins_by_sub   AS f1_wins_by_sub,
        fi1.wins_by_dec   AS f1_wins_by_dec,
        fi1.slpm          AS f1_slpm,
        fi1.str_acc       AS f1_str_acc,
        fi1.sapm          AS f1_sapm,
        fi1.str_def       AS f1_str_def,
        fi1.td_avg        AS f1_td_avg,
        fi1.nationality   AS f1_nationality,
        fi1.camp          AS f1_camp,
        fi1.pre_ufc_wins  AS f1_pre_ufc_wins,
        fi1.pre_ufc_losses AS f1_pre_ufc_losses,

        fi2.wins          AS f2_wins,
        fi2.losses        AS f2_losses,
        fi2.draws         AS f2_draws,
        fi2.wins_by_ko    AS f2_wins_by_ko,
        fi2.wins_by_sub   AS f2_wins_by_sub,
        fi2.wins_by_dec   AS f2_wins_by_dec,
        fi2.slpm          AS f2_slpm,
        fi2.str_acc       AS f2_str_acc,
        fi2.sapm          AS f2_sapm,
        fi2.str_def       AS f2_str_def,
        fi2.td_avg        AS f2_td_avg,
        fi2.nationality   AS f2_nationality,
        fi2.camp          AS f2_camp,
        fi2.pre_ufc_wins  AS f2_pre_ufc_wins,
        fi2.pre_ufc_losses AS f2_pre_ufc_losses,

        p.f1_win_prob, p.f2_win_prob, p.confidence,
        p.is_value_bet, p.value_fighter, p.value_edge, p.kelly_pct,

        o.consensus_f1_decimal, o.consensus_f2_decimal,
        o.best_f1_decimal, o.best_f2_decimal

     FROM fights f
     LEFT JOIN fighters fi1 ON fi1.id = f.fighter1_id
     LEFT JOIN fighters fi2 ON fi2.id = f.fighter2_id
     LEFT JOIN LATERAL (
         SELECT f1_win_prob, f2_win_prob, confidence,
                is_value_bet, value_fighter, value_edge, kelly_pct
         FROM predictions
         WHERE fight_id = f.id
         ORDER BY created_at DESC LIMIT 1
     ) p ON TRUE
     LEFT JOIN LATERAL (
         SELECT consensus_f1_decimal, consensus_f2_decimal,
                best_f1_decimal, best_f2_decimal
         FROM odds
         WHERE fight_id = f.id
         ORDER BY scraped_at DESC LIMIT 1
     ) o ON TRUE
     WHERE f.event_id = $1
       AND f.id != ''
     ORDER BY f.is_main_event DESC, f.is_title_fight DESC, f.id`,
    [eventId]
  );
}

export interface OddsRow {
  id: number;
  fight_id: string | null;
  fighter1_name: string;
  fighter2_name: string;
  consensus_f1_decimal: number;
  consensus_f2_decimal: number;
  best_f1_decimal: number;
  best_f2_decimal: number;
  bookmakers: BookmakerLine[];
  scraped_at: string;
}

export interface BookmakerLine {
  bookmaker: string;
  f1_decimal: number | null;
  f2_decimal: number | null;
  f1_american: number | null;
  f2_american: number | null;
  last_update: string;
}

/** Get latest odds for a fight matched by fighter names (handles API name mismatches). */
export async function getOddsForFight(
  fightId: string,
  f1Name: string,
  f2Name: string
): Promise<OddsRow | null> {
  // First try exact fight_id match
  const byId = await queryOne<OddsRow>(
    `SELECT id, fight_id, fighter1_name, fighter2_name,
            consensus_f1_decimal::float, consensus_f2_decimal::float,
            best_f1_decimal::float, best_f2_decimal::float,
            bookmakers, scraped_at::text
     FROM odds WHERE fight_id = $1 ORDER BY scraped_at DESC LIMIT 1`,
    [fightId]
  );
  if (byId) return byId;

  // Fallback: fuzzy name match on last name
  const f1Last = f1Name.split(" ").at(-1)!.toLowerCase();
  const f2Last = f2Name.split(" ").at(-1)!.toLowerCase();
  return queryOne<OddsRow>(
    `SELECT id, fight_id, fighter1_name, fighter2_name,
            consensus_f1_decimal::float, consensus_f2_decimal::float,
            best_f1_decimal::float, best_f2_decimal::float,
            bookmakers, scraped_at::text
     FROM odds
     WHERE LOWER(fighter1_name) LIKE $1 OR LOWER(fighter2_name) LIKE $2
     ORDER BY scraped_at DESC LIMIT 1`,
    [`%${f1Last}%`, `%${f2Last}%`]
  );
}

/** Single fighter profile. */
export async function getFighter(id: string): Promise<Fighter | null> {
  return queryOne<Fighter>(
    `SELECT id, name, nickname, height_cm::float, weight_kg::float, reach_cm::float,
            stance, dob::text, wins, losses, draws,
            slpm::float, str_acc::float, sapm::float, str_def::float,
            td_avg::float, td_acc::float, td_def::float, sub_avg::float,
            wins_by_ko, wins_by_sub, wins_by_dec,
            nationality, camp,
            pre_ufc_wins, pre_ufc_losses, pre_ufc_finish_rate::float,
            dwcs_appeared, dwcs_result, regional_competition_level
     FROM fighters WHERE id = $1`,
    [id]
  );
}

/** Full fight detail with both fighters and latest prediction. */
export async function getFightDetail(fightId: string) {
  const fight = await queryOne(
    `SELECT f.*,
            e.name AS event_name, e.date::text AS event_date, e.location AS event_location,
            p.f1_win_prob, p.f2_win_prob, p.confidence,
            p.is_value_bet, p.value_fighter, p.value_edge, p.kelly_pct,
            p.raw_features
     FROM fights f
     JOIN events e ON e.id = f.event_id
     LEFT JOIN LATERAL (
         SELECT * FROM predictions WHERE fight_id = f.id ORDER BY created_at DESC LIMIT 1
     ) p ON TRUE
     WHERE f.id = $1`,
    [fightId]
  );

  if (!fight) return null;

  const [f1, f2, odds] = await Promise.all([
    getFighter((fight as Record<string, string>).fighter1_id),
    getFighter((fight as Record<string, string>).fighter2_id),
    query(
      `SELECT * FROM odds WHERE fight_id = $1 ORDER BY scraped_at DESC LIMIT 1`,
      [fightId]
    ),
  ]);

  return { fight, f1, f2, odds: odds[0] ?? null };
}
