import { query } from "./db";

export interface BacktestEvent {
  event_id: string;
  event_name: string;
  event_date: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface BacktestFight {
  fight_id: string;
  event_id: string;
  event_name: string;
  event_date: string;
  fighter1_name: string;
  fighter2_name: string;
  weight_class: string;
  is_main_event: boolean;
  is_title_fight: boolean;
  f1_win_prob: number;
  f2_win_prob: number;
  confidence: number;
  predicted_winner: string;
  predicted_winner_id: string;
  actual_winner_id: string | null;
  actual_winner: string | null;
  was_correct: boolean | null;
  method: string | null;
}

export async function getBacktestSummary(): Promise<BacktestEvent[]> {
  return query<BacktestEvent>(`
    SELECT
      e.id AS event_id,
      e.name AS event_name,
      e.date::text AS event_date,
      COUNT(p.id) AS total,
      COUNT(CASE WHEN f.winner_id = CASE WHEN p.f1_win_prob > p.f2_win_prob THEN p.fighter1_id ELSE p.fighter2_id END THEN 1 END) AS correct,
      ROUND(
        COUNT(CASE WHEN f.winner_id = CASE WHEN p.f1_win_prob > p.f2_win_prob THEN p.fighter1_id ELSE p.fighter2_id END THEN 1 END)::numeric
        / NULLIF(COUNT(CASE WHEN f.winner_id IS NOT NULL THEN 1 END), 0) * 100, 1
      ) AS accuracy
    FROM predictions p
    JOIN events e ON e.id = p.event_id
    JOIN fights f ON f.id = p.fight_id
    WHERE p.is_backtest = TRUE
    GROUP BY e.id, e.name, e.date
    ORDER BY e.date DESC
    LIMIT 5
  `);
}

export async function getBacktestFights(eventId: string): Promise<BacktestFight[]> {
  return query<BacktestFight>(`
    SELECT
      p.fight_id,
      p.event_id,
      e.name AS event_name,
      e.date::text AS event_date,
      f.fighter1_name,
      f.fighter2_name,
      f.weight_class,
      f.is_main_event,
      f.is_title_fight,
      p.f1_win_prob::float,
      p.f2_win_prob::float,
      p.confidence::float,
      CASE WHEN p.f1_win_prob > p.f2_win_prob THEN f.fighter1_name ELSE f.fighter2_name END AS predicted_winner,
      CASE WHEN p.f1_win_prob > p.f2_win_prob THEN p.fighter1_id ELSE p.fighter2_id END AS predicted_winner_id,
      f.winner_id AS actual_winner_id,
      CASE WHEN f.winner_id = f.fighter1_id THEN f.fighter1_name
           WHEN f.winner_id = f.fighter2_id THEN f.fighter2_name
           ELSE NULL END AS actual_winner,
      CASE
        WHEN f.winner_id IS NULL THEN NULL
        WHEN f.winner_id = CASE WHEN p.f1_win_prob > p.f2_win_prob THEN p.fighter1_id ELSE p.fighter2_id END THEN TRUE
        ELSE FALSE
      END AS was_correct,
      f.method
    FROM predictions p
    JOIN events e ON e.id = p.event_id
    JOIN fights f ON f.id = p.fight_id
    WHERE p.is_backtest = TRUE AND p.event_id = $1
    ORDER BY f.is_main_event DESC, f.is_title_fight DESC, p.confidence DESC
  `, [eventId]);
}
