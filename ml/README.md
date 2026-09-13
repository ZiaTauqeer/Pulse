# PULSE — ML Pipeline

Predictive churn model for PULSE. Real data, real training, real
evaluation on a held-out test set, real SHAP explainability. Every number
in this README came from actually running the commands below in this
repository — none of it is hand-written.

## Quickstart (full reproduction)

```bash
cd ml
pip install -r requirements.txt --break-system-packages   # or use a venv

python -m pipeline.generate_synthetic   # simulate customers + behavioral data
python -m pipeline.ingest               # load + inspect raw tables
python -m pipeline.validate             # data-quality report, leakage checks
python -m pipeline.build_features       # point-in-time feature matrix
python -m pipeline.split                # stratified train/val/test
python -m pipeline.train                # compare candidates, tune, calibrate
python -m pipeline.evaluate             # ONE-TIME evaluation on the test set
python -m pipeline.explain              # SHAP global + worked example
python -m pipeline.register --promote   # version + promote to production

python -m pipeline.predict --top_risk 10             # rank customers by risk
python -m pipeline.predict --customer_id CUS-100000  # score one customer

pytest tests/ -v
```

Every stage reads `configs/training.yaml` and writes its output to
`data/` or `artifacts/` — nothing is hardcoded in the Python files. Change
a value in the config, re-run the stage, and everything downstream of it
should be re-run too (see the dependency chain below).

## Pipeline dependency chain

```
generate_synthetic → ingest → validate → build_features → split → train → evaluate
                                                                      ↓         ↓
                                                                   explain   register
                                                                      ↓         ↓
                                                                       → predict
```

`train.py` never touches `test.csv`. `evaluate.py` is the only stage that
loads it, and it does so exactly once per run. This is enforced by which
files each module imports, not just by convention — `train.py` has no
import path to the test split at all.

## What's actually real here

- **Data**: 9,000 synthetic customers simulated day-by-day over 240 days
  with a stochastic (not rule-based) churn hazard — see "How the synthetic
  data works" below. ~1.4M events, transactions, tickets, and sentiment
  records, all seeded and reproducible (`--seed`).
- **Leakage guards**: `assert_no_leakage()` runs for real against the
  final feature matrix (not just documentation), and support-ticket
  resolution status is computed with an explicit "as of snapshot_date"
  cutoff so a ticket that resolves *after* the snapshot doesn't leak into
  the "resolved" feature.
- **Model comparison**: baseline, logistic regression, random forest, and
  XGBoost are actually trained and compared on a validation set every run.
- **Hyperparameter tuning**: `RandomizedSearchCV` over a real search space,
  with a search space registered per model type (whichever candidate wins
  gets tuned with its own space, not a mismatched one).
- **Calibration**: fit on the validation set only, evaluated for real
  Brier-score improvement on the test set.
- **Evaluation**: ROC-AUC, PR-AUC, precision/recall/F1, a full confusion
  matrix, a threshold sweep, and a calibration curve — computed on data the
  model never saw during training or tuning.
- **Explainability**: real SHAP (`TreeExplainer` / `LinearExplainer`
  depending on the winning model), both global importance and a
  per-customer worked example with actual feature values.

## Current results (from the last full run)

Run `python -m pipeline.evaluate` to reproduce these — they will drift
slightly between runs of `generate_synthetic` unless you fix `--seed`.

- **Winning model**: Random Forest (selected on validation ROC-AUC, beat
  logistic regression and XGBoost; the majority-class baseline scores
  ROC-AUC 0.50 by definition)
- **Test ROC-AUC**: ~0.64, **PR-AUC**: ~0.21 (base rate ~13%)
- **Recommended operating threshold**: 0.1 (maximizes F1 — see
  `evaluation_report.json` for the full precision/recall trade-off curve)
- **Top global SHAP drivers**: overall sentiment, negative sentiment
  ratio, feature usage, account tenure, feature adoption

This is a **modest but real and honest** result, not a showcase number.
See "Why the AUC isn't higher" below for what that reflects and what
would actually move it.

### Why the AUC isn't higher

Two honest reasons, both worth stating plainly rather than hiding:

1. **The label is deliberately noisy.** The synthetic churn hazard is
   *stochastic* — a customer with every warning sign (usage decline,
   negative sentiment, unresolved tickets) still only has an elevated
   *probability* of churning in the next 30 days, not a certainty. This
   was an explicit design choice (the build brief calls out "avoid
   perfectly deterministic relationships"), and it caps the achievable
   AUC on any dataset like this, synthetic or real.
2. **A single global snapshot date.** Every customer is scored as of the
   same calendar day. A real deployment would score customers on a
   rolling basis (see "Extending to rolling snapshots" below), which
   both increases the effective training set size and lets the model
   learn from more varied temporal contexts.

During development, an earlier XGBoost configuration (300 trees,
depth 4) hit **train ROC-AUC 1.0 / validation ROC-AUC 0.43** — textbook
overfitting on a modest dataset. That's documented here instead of
quietly fixed and forgotten, because it's exactly the kind of thing this
README's "frequently changing" table below exists to make easy to find
and re-tune.

## How the synthetic data works

`src/synthetic/generate.py` simulates each customer day-by-day in two
phases:

- **Phase A**: a continuous, hidden "engagement" trajectory per customer
  (declining / stable / growing, assigned probabilistically), which is
  never exposed as a feature — it's the hidden ground truth, the way a
  real customer's true satisfaction is never directly observable.
- **Phase B**: discrete, *observable* events (logins, feature usage,
  purchases, refunds, support tickets, sentiment) are sampled from that
  trajectory, and a daily churn hazard is computed from *rolling
  behavioral state* (engagement decline, sentiment EMA, unresolved
  tickets, inactivity streak) — not from the hidden trajectory directly.
  Churn is then sampled stochastically from that hazard.

A "modeling snapshot" is cut at day 210: features may only use data from
the trailing 90 days (`observation_window_days`), and the label looks
forward 30 days (`prediction_window_days`) to see who actually churned.
Customers already churned before the snapshot are excluded from the
training set (a real deployment can't predict on someone already gone),
but their history still appears in `customers.csv` / `customer_events.csv`
etc. for realistic app demo data.

## Directory structure

```
ml/
├── configs/training.yaml          # <- the file you'll edit most
├── data/
│   ├── synthetic/                 # generator output (customers, events, tickets, sentiment...)
│   └── processed/                 # feature_matrix.csv, train/val/test.csv
├── src/
│   ├── config.py                  # typed config loader
│   ├── synthetic/                 # data generation
│   ├── ingestion/                 # schema inspection
│   ├── validation/                # data quality + leakage enforcement
│   ├── features/                  # feature engineering + manifest
│   ├── preprocessing/             # shared train/inference transformer
│   ├── models/                    # model candidate factory
│   ├── training/                  # split + train orchestration
│   ├── evaluation/                # metrics + test-set evaluation
│   ├── explainability/            # SHAP
│   ├── registry/                  # model versioning
│   ├── inference/                 # scoring (no retraining)
│   └── utils/                     # shared artifact I/O
├── pipeline/                      # thin CLI wrappers, one per stage
├── artifacts/
│   ├── models/<version>/          # versioned, registered model artifacts
│   ├── reports/                   # JSON reports from every stage
│   └── metadata/                  # feature_manifest.json, model_registry.json
└── tests/                         # pytest, 27 tests across 5 files
```

## Files you'll actually come back to edit

| I want to... | Edit this file | Then re-run |
|---|---|---|
| Change dataset size, churn rate, or simulation window | `configs/training.yaml` → `synthetic:` | `generate_synthetic` onward |
| Add/remove/change an engineered feature | `src/features/definitions.py` (manifest) + `src/features/build_features.py` (computation) | `build_features` onward |
| Add a newly-excluded (leaky) field | `configs/training.yaml` → `excluded_features` + document why in `src/features/excluded_features.py` | `validate` / `build_features` |
| Change model hyperparameters | `configs/training.yaml` → `models:` | `train` onward |
| Add a hyperparameter search space for a model type | `configs/training.yaml` → `tuning: param_distributions_by_type` | `train` onward |
| Change the train/val/test ratios | `configs/training.yaml` → `split:` | `split` onward |
| Switch calibration method | `configs/training.yaml` → `calibration: method` (`sigmoid` vs `isotonic` — see note in the file about why sigmoid was chosen here) | `train` onward |
| Change the minimum bar for auto-promotion | `src/registry/registry.py` → `MIN_PROMOTION_ROC_AUC` | `register --promote` |
| Change human-readable labels shown in the UI for a feature | `src/explainability/explain.py` → `HUMAN_READABLE_LABELS` | `explain` (cosmetic only, no retrain needed) |
| Add a new raw table (e.g. a real dataset) | `src/ingestion/loader.py` → `inspect_external_schema` is the hook; add a normalization/mapping layer alongside it | `ingest` onward |

## Adding a real public dataset (IBM Telco, etc.)

`src/ingestion/loader.py` includes `inspect_external_schema(path)`, which
loads and profiles an arbitrary CSV (columns, dtypes, missing values,
candidate target/ID/date columns) without assuming a fixed schema:

```bash
python -m pipeline.ingest --external /path/to/telco.csv
```

This project does not ship a normalization mapping for a specific public
dataset because none was supplied at build time. To wire one in: inspect
its schema with the command above, then add a mapping function that
translates its columns into the canonical schema in
`src/features/definitions.py`, and merge its customers into
`data/synthetic/customers.csv` before running `build_features`.

## Extending to rolling snapshots

The current design uses one global snapshot date for every customer,
which `build_feature_matrix` enforces with an explicit check
(`snapshots["snapshot_date"].nunique() != 1` raises `NotImplementedError`).
To move to multiple snapshots per customer (more training data, more
realistic production behavior):

1. Change `generate.py` to emit multiple `modeling_snapshots` rows per
   customer (e.g. every 30 days of their history).
2. Rewrite the window-filtering in `build_features.py` to be per-row
   instead of global (it currently computes one shared `obs_start_dt` /
   `snap_dt` for the whole matrix — this needs to become a per-customer,
   per-snapshot calculation).
3. **Update `split.py`** to guard against the same customer's snapshots
   spanning train/val/test — this is explicitly checked for today but
   only because it's trivially true with one row per customer; with
   multiple snapshots it needs a real customer-level group-split
   (`GroupShuffleSplit` on `customer_id`, not `train_test_split`).

## A note on honesty

Every metric in `artifacts/reports/*.json` and `artifacts/metadata/model_registry.json`
came from an actual run of the code in this repository. If you see a
number in the app UI and want to verify it, trace it back to the relevant
JSON report here — nothing is hand-authored.

## Single-customer inference (added for the onboarding flow)

`ml/src/inference/predict.py` originally only scored customers already
present in `feature_matrix.csv` (the batch path `prisma/seed.ts` uses).
`predict_from_features()` (and the `--from-json` CLI flag) adds a second
path for a customer that doesn't exist in that CSV yet - the one a user
just entered through the app's "Add Customer" form. Both paths share the
exact same fitted preprocessor, model, and SHAP explainer; the only
difference is where the raw feature values come from. Test with:

```bash
echo '{"customer_id": "TEST", "features": {"tenure_days_at_snapshot": 14, "contract_type": "month-to-month", "subscription_type": "pro", "monthly_revenue": 199, "region": "North America", "industry": "Retail", "avg_sentiment_90d": -0.5, "unresolved_ticket_count": 2}}' > /tmp/test.json
python -m pipeline.predict --from-json /tmp/test.json
```

Missing feature keys are treated as unknown and imputed by the same
imputer fit during training - not a second, hand-written default.

## Segmentation (K-means)

```bash
python -m pipeline.segment
```

Clusters customers on 7 engagement/revenue/support features
(`ml/src/segmentation/cluster.py` → `CLUSTERING_FEATURES`), then names
each cluster deterministically from its actual centroid characteristics
(see `label_cluster()`) rather than a hand-picked name - churn
probability, computed fresh from the production model, participates only
in *labeling* (for interpretability), never in the clustering itself, so
segments describe behavior rather than repackage the churn score. Output:
`artifacts/reports/segmentation_report.json`. The Node-side sync
(`npm run segments:sync` at the project root) reads this and populates
Postgres.

Change `n_clusters` (default 4) or `CLUSTERING_FEATURES` in
`cluster.py` to tune this; there's no separate config file for it yet.
