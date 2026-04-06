"""
UFC XGBoost Prediction Model
==============================
Trains on historical fight data, predicts win probabilities,
evaluates accuracy, and supports incremental retraining.
"""

import os
import logging
import joblib
import numpy as np
import pandas as pd
import psycopg2
from datetime import datetime
from typing import Optional

from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score, log_loss, brier_score_loss,
    classification_report, roc_auc_score
)
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

from models.feature_engineering import (
    load_training_data,
    engineer_features,
    get_feature_columns,
)

log = logging.getLogger(__name__)

MODEL_PATH   = os.getenv("MODEL_PATH",    "./models/ufc_model.pkl")
VERSION      = os.getenv("MODEL_VERSION", "v1.0")
DB_URL       = os.getenv("DATABASE_URL",  "postgresql://ufc:ufc@localhost:5433/ufc_predictions")


# ──────────────────────────────────────────────
# Model class
# ──────────────────────────────────────────────

class UFCPredictor:
    """
    XGBoost model for UFC fight outcome prediction.
    Wraps training, evaluation, persistence, and prediction.
    """

    def __init__(self, version: str = VERSION):
        self.version    = version
        self.model      = None
        self.scaler     = None
        self.features   = get_feature_columns()
        self.is_trained = False

    # ── Training ────────────────────────────────

    def train(self, conn=None, save: bool = True):
        """
        Load data from DB, engineer features, train XGBoost with
        time-series cross-validation, calibrate probabilities.
        """
        if conn is None:
            conn = psycopg2.connect(DB_URL)

        log.info("Loading training data…")
        raw = load_training_data(conn)

        if len(raw) < 50:
            log.error("Not enough data to train (%d fights). Run scrape-history first.", len(raw))
            return

        log.info("Engineering features…")
        feat = engineer_features(raw)

        X = feat[self.features].values
        y = feat["target"].values

        log.info("Training set: %d fights, %d features", len(X), X.shape[1])

        # Scale features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # ── XGBoost parameters ──────────────────
        # Tuned for small-medium UFC datasets
        base_model = xgb.XGBClassifier(
            n_estimators       = 300,
            max_depth          = 4,         # shallow — prevents overfitting on small data
            learning_rate      = 0.05,
            subsample          = 0.8,
            colsample_bytree   = 0.8,
            min_child_weight   = 3,
            gamma              = 0.1,
            reg_alpha          = 0.1,       # L1 regularisation
            reg_lambda         = 1.0,       # L2 regularisation
            scale_pos_weight   = 1,         # balanced classes (50/50 by construction)
            use_label_encoder  = False,
            eval_metric        = "logloss",
            random_state       = 42,
            n_jobs             = -1,
        )

        # ── Time-series cross-validation ────────
        # Uses chronological splits — no future leakage
        tscv = TimeSeriesSplit(n_splits=5)
        cv_scores = cross_val_score(
            base_model, X_scaled, y,
            cv=tscv, scoring="roc_auc", n_jobs=-1
        )
        log.info("CV ROC-AUC: %.3f ± %.3f", cv_scores.mean(), cv_scores.std())

        # ── Calibrate probabilities ─────────────
        # Isotonic calibration makes probabilities more reliable
        self.model = CalibratedClassifierCV(base_model, cv=3, method="isotonic")
        self.model.fit(X_scaled, y)
        self.is_trained = True

        # ── In-sample evaluation ────────────────
        y_pred  = self.model.predict(X_scaled)
        y_proba = self.model.predict_proba(X_scaled)[:, 1]

        acc    = accuracy_score(y, y_pred)
        ll     = log_loss(y, y_proba)
        brier  = brier_score_loss(y, y_proba)
        auc    = roc_auc_score(y, y_proba)

        log.info("─" * 50)
        log.info("Training complete")
        log.info("  Accuracy : %.1f%%", acc * 100)
        log.info("  ROC-AUC  : %.3f",   auc)
        log.info("  Log Loss : %.4f",   ll)
        log.info("  Brier    : %.4f",   brier)
        log.info("  CV AUC   : %.3f ± %.3f", cv_scores.mean(), cv_scores.std())
        log.info("─" * 50)

        # ── Feature importance ──────────────────
        self._log_feature_importance()

        if save:
            self.save()

        return {
            "accuracy": acc,
            "roc_auc":  auc,
            "log_loss": ll,
            "brier":    brier,
            "cv_auc":   cv_scores.mean(),
            "n_fights": len(X),
        }

    def _log_feature_importance(self):
        """Log top 10 most important features."""
        try:
            # Access the underlying XGB model through calibration wrapper
            base = self.model.calibrated_classifiers_[0].estimator
            importance = dict(zip(self.features, base.feature_importances_))
            top10 = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:10]
            log.info("Top 10 features:")
            for feat, imp in top10:
                log.info("  %-30s %.4f", feat, imp)
        except Exception:
            pass

    # ── Prediction ──────────────────────────────

    def predict(self, fight_data: dict) -> tuple[float, float]:
        """
        Predict win probabilities for a single fight.

        Args:
            fight_data: dict with fighter stats (from get_upcoming_predictions)

        Returns:
            (f1_win_prob, f2_win_prob) as floats 0-1
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() or load() first.")

        row = self._fight_dict_to_row(fight_data)
        feat = engineer_features(pd.DataFrame([row]))
        X = feat[self.features].values
        X_scaled = self.scaler.transform(X)

        proba = self.model.predict_proba(X_scaled)[0]
        f1_prob = round(float(proba[1]), 4)
        f2_prob = round(1 - f1_prob, 4)
        return f1_prob, f2_prob

    def predict_batch(self, fights: list[dict]) -> list[tuple[float, float]]:
        """Predict probabilities for a list of fights."""
        rows = [self._fight_dict_to_row(f) for f in fights]
        feat = engineer_features(pd.DataFrame(rows))
        X = feat[self.features].fillna(0).values
        X_scaled = self.scaler.transform(X)
        probas = self.model.predict_proba(X_scaled)
        return [(round(float(p[1]), 4), round(float(p[0]), 4)) for p in probas]

    def _fight_dict_to_row(self, d: dict) -> dict:
        """Map dashboard prediction dict keys to feature engineering keys."""
        return {
            "f1_wins":     d.get("f1_wins", 0),
            "f1_losses":   d.get("f1_losses", 0),
            "f1_height":   d.get("f1_height_cm", 0),
            "f1_reach":    d.get("f1_reach_cm", 0),
            "f1_stance":   d.get("f1_stance", "Orthodox"),
            "f1_dob":      d.get("f1_dob"),
            "f1_slpm":     d.get("f1_slpm", 0),
            "f1_str_acc":  d.get("f1_str_acc", 0),
            "f1_sapm":     d.get("f1_sapm", 0),
            "f1_str_def":  d.get("f1_str_def", 0),
            "f1_td_avg":   d.get("f1_td_avg", 0),
            "f1_td_acc":   d.get("f1_td_acc", 0),
            "f1_td_def":   d.get("f1_td_def", 0),
            "f1_sub_avg":  d.get("f1_sub_avg", 0),
            "f1_wins_ko":  d.get("f1_ko", 0),
            "f1_wins_sub": d.get("f1_sub", 0),
            "f1_wins_dec": d.get("f1_wins", 0) - d.get("f1_ko", 0) - d.get("f1_sub", 0),
            "f2_wins":     d.get("f2_wins", 0),
            "f2_losses":   d.get("f2_losses", 0),
            "f2_height":   d.get("f2_height_cm", 0),
            "f2_reach":    d.get("f2_reach_cm", 0),
            "f2_stance":   d.get("f2_stance", "Orthodox"),
            "f2_dob":      d.get("f2_dob"),
            "f2_slpm":     d.get("f2_slpm", 0),
            "f2_str_acc":  d.get("f2_str_acc", 0),
            "f2_sapm":     d.get("f2_sapm", 0),
            "f2_str_def":  d.get("f2_str_def", 0),
            "f2_td_avg":   d.get("f2_td_avg", 0),
            "f2_td_acc":   d.get("f2_td_acc", 0),
            "f2_td_def":   d.get("f2_td_def", 0),
            "f2_sub_avg":  d.get("f2_sub_avg", 0),
            "f2_wins_ko":  d.get("f2_ko", 0),
            "f2_wins_sub": d.get("f2_sub", 0),
            "f2_wins_dec": d.get("f2_wins", 0) - d.get("f2_ko", 0) - d.get("f2_sub", 0),
            "is_title_fight": d.get("is_title_fight", False),
            "event_date":  d.get("event_date"),
            "fighter1_id": d.get("fighter1_id"),
            "fighter2_id": d.get("fighter2_id"),
            "f1_name":     d.get("f1_name"),
            "f2_name":     d.get("f2_name"),
            "fight_id":    d.get("fight_id"),
            "winner_id":   None,
        }

    # ── Persistence ─────────────────────────────

    def save(self, path: str = MODEL_PATH):
        """Save model + scaler + metadata to disk."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        payload = {
            "model":    self.model,
            "scaler":   self.scaler,
            "features": self.features,
            "version":  self.version,
            "trained_at": datetime.utcnow().isoformat(),
        }
        joblib.dump(payload, path)
        log.info("Model saved to %s", path)

    def load(self, path: str = MODEL_PATH):
        """Load model + scaler from disk."""
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"No model found at {path}. Run: python pipeline.py train"
            )
        payload       = joblib.load(path)
        self.model    = payload["model"]
        self.scaler   = payload["scaler"]
        self.features = payload["features"]
        self.version  = payload.get("version", VERSION)
        self.is_trained = True
        log.info("Model loaded: %s (trained %s)", self.version, payload.get("trained_at", "?"))

    # ── Retraining ──────────────────────────────

    def retrain(self, conn=None):
        """
        Full retrain on all available data.
        Call this after recording results for a new event.
        Bumps the version number automatically.
        """
        # Bump version
        parts = self.version.lstrip("v").split(".")
        parts[-1] = str(int(parts[-1]) + 1)
        self.version = "v" + ".".join(parts)
        log.info("Retraining model → %s", self.version)
        return self.train(conn=conn, save=True)


# ──────────────────────────────────────────────
# CLI — train the model
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from dotenv import load_dotenv
    load_dotenv()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )

    predictor = UFCPredictor()
    metrics   = predictor.train()

    if metrics:
        print("\n" + "═" * 50)
        print(f"  Model trained successfully — {VERSION}")
        print(f"  Accuracy : {metrics['accuracy']*100:.1f}%")
        print(f"  ROC-AUC  : {metrics['roc_auc']:.3f}")
        print(f"  Fights   : {metrics['n_fights']}")
        print("═" * 50)
