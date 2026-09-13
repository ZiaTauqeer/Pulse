# PULSE — Setup and Run Guide

Predictive Customer Experience Intelligence Platform. This is the one
README to follow. It tells you exactly what to run, in what order, and
which steps are already done for you versus which ones only you can run.

---

## TL;DR — what you need to do, in order

1. Run the ML pipeline (Python) — generates data, trains and evaluates a real model.
2. Set up Postgres and load that data in (Prisma).
3. Add your Anthropic API key (for the AI assistant).
4. Run K-means segmentation (optional but recommended — powers the Segments page).
5. *(Optional)* Set up Astra DB (for "find similar customers").
6. `npm run dev` and open `http://localhost:3000`.
7. *(Optional)* Deploy to Vercel.

Every one of these **must be run on your machine** — none of it can be done
in advance, because each step needs a real database, a real LLM API key,
or infrastructure only you can provision.

---

## Step 1 — ML pipeline (Python) — YOU MUST RUN THIS

```bash
cd ml
pip install -r requirements.txt --break-system-packages   # or use a venv
python -m pipeline.generate_synthetic
python -m pipeline.ingest
python -m pipeline.validate
python -m pipeline.build_features
python -m pipeline.split
python -m pipeline.train
python -m pipeline.evaluate
python -m pipeline.explain
python -m pipeline.register --promote
cd ..
```

This generates ~9,000 synthetic customers with realistic behavioral
history, engineers 29 features, trains and compares 4 models, evaluates
the winner honestly on held-out data, computes real SHAP explanations,
and registers a production model version. Full details, real results, and
every config knob: `ml/README.md`.

---

## Step 2 — Database — YOU MUST RUN THIS

```bash
npm install
cp .env.example .env
```

Now edit `.env`:
- `DATABASE_URL` → your own PostgreSQL instance (local or hosted — Neon, Supabase, Vercel Postgres all work).
- `AUTH_SECRET` → generate with `npx auth secret` or `openssl rand -base64 32`.

Then:

```bash
npx prisma generate
npx prisma migrate dev
npm run db:seed
```

`db:seed` loads synthetic data and runs real inference
(`python -m pipeline.predict --export-csv` under the hood) to populate
real churn predictions — Step 1 must be done first, and Python must still
be reachable from wherever you run this.

**Migrations note**: this repo currently has two migration folders
(`00000000000000_init` and `20260912000000_user_signup_and_customer_source`).
Both were hand-verified against a live Postgres instance during
development (see each file's header comment for why - short version:
`prisma migrate dev` couldn't reach `binaries.prisma.sh` in the sandbox
this was built in). You won't hit that - `prisma migrate dev` will just
apply them normally.

If `prisma generate`/`migrate dev` fail, see **Troubleshooting** below.

---

## Step 3 — AI assistant — YOU MUST DO THIS

Edit `.env`:
```
ANTHROPIC_API_KEY="sk-ant-..."
```
Get a key at [console.anthropic.com](https://console.anthropic.com) (a
separate login from claude.ai) and make sure billing/credits are set up
there - a key with no billing attached is the single most common reason
the assistant fails on a first try (see Troubleshooting).

Without this key, every page works except `/assistant` and the
"Generate recommendation" button on customer pages.

---

## Step 4 — Segmentation (recommended)

```bash
npm run segments:sync
```

Runs real K-means clustering (`ml/src/segmentation/cluster.py`) over
engagement, revenue, and support features, then syncs the result into
Postgres. Segment names are generated from each cluster's actual
characteristics (e.g. "High value / Low engagement"), never hand-picked.
Re-run this any time you reseed or want fresh clusters.

---

## Step 5 — Astra DB (optional) — only for "find similar customers"

Powers one AI-assistant tool and one API route; everything else works
without it.

1. Create a free serverless vector database at [astra.datastax.com](https://astra.datastax.com).
2. Add to `.env`: `ASTRA_DB_API_ENDPOINT` and `ASTRA_DB_APPLICATION_TOKEN`.
3. Run `npm run astra:sync`.

---

## Step 6 — Run it

```bash
npm run dev
```

Open `http://localhost:3000`.

### Signing in

Two ways in:

**Demo accounts** (pre-loaded with ~9,000 synthetic customers to explore):
| Username | Password | Role |
|---|---|---|
| `admin` | `pulse-demo-2026` | Admin |
| `analyst` | `pulse-demo-2026` | Analyst |
| `csmanager` | `pulse-demo-2026` | CS Manager |
| `viewer` | `pulse-demo-2026` | Viewer |

You can also sign in with the full demo email (e.g. `admin@pulse.demo`) -
the login field accepts either.

**Your own account**: click "Sign up" on the login page. Only a username
and password (8+ characters) are required; display name and email are
optional. Signing up creates a brand new, empty workspace - you will not
see the demo data, and no one else can see your customers. This is by
design (see "Demo data vs. real data" below).

---

## Using the product

### Adding a customer

From Customers → "Add customer". The form is grouped into Account,
Engagement, Commerce, Support, and Sentiment sections - every field maps
directly to a feature the trained model actually uses (see
`ml/src/features/definitions.py` for the authoritative list;
`src/lib/onboarding/feature-mapping.ts` is where the form's answers get
translated into that exact feature vector). On submit, PULSE:

1. Saves the customer to Postgres.
2. Builds its feature vector.
3. Runs the real trained model (shelling out to
   `python -m pipeline.predict --from-json`, the same inference path
   every other prediction in the app uses - see `ml/README.md` for why
   this stays in Python rather than being reimplemented in TypeScript).
4. Shows you the real churn probability, risk level, and top contributors
   immediately.

If inference fails for some reason (Python not reachable, no promoted
model, etc.), the customer is still saved - you'll see the specific error
and can retry from the customer's page with "Run Prediction" once fixed.

### Re-scoring a customer

Every customer page has a "Run Prediction" button. It re-runs the same
real model against that customer's most recently saved feature snapshot -
useful after promoting a new model version, since the risk band
boundaries and even the winning model itself can change between training
runs.

### Demo data vs. real data

Every customer has a `source`: `SEED` (the synthetic demo data),
`MANUAL` (added through the UI), or `IMPORT` (reserved for future CSV
import - not implemented this pass, see Known Limitations). Signing up
creates your own workspace, so your manually-added customers are never
mixed with the shared demo data, and other users can never see them.

### Segments

Segments → click any segment to see its size, average revenue, average
churn probability, dominant industries, risk distribution, and full
customer list.

### AI assistant

Ask things like "which customers have the highest churn risk", "why is
Acme Corp at risk", or "which segment has the highest average churn
probability". Every response shows which tools were called underneath it
- the assistant only ever answers from what those tools actually
returned, never from guessing.

---

## Step 7 — Deploy to Vercel (optional)

1. Push to GitHub, import in Vercel.
2. Set the same env vars from `.env` in Vercel's project settings, pointed at a **hosted** Postgres (Vercel Postgres, Neon, Supabase).
3. `npm install`'s `postinstall` hook runs `prisma generate` automatically.
4. Vercel's build has normal internet access, so `prisma generate` and Google Fonts both work there with no changes needed - the workarounds mentioned below were sandbox-only, during development.
5. Run `npx prisma migrate deploy` once against production (not `migrate dev`, which is for local development).
6. Run `npm run db:seed` (and `segments:sync` / `astra:sync` if using them) once against production.

---

## Troubleshooting

**AI assistant shows "could not reach the assistant" or a JSON parse
error** — as of this pass, the API route always returns a proper JSON
error message instead of crashing (see `app/api/ai/query/route.ts` - it
used to have an unwrapped Anthropic API call that could crash to an HTML
error page, which is exactly what produced this symptom). If you still
see it, check your server terminal for the real logged error. The most
common causes, in order:
1. `ANTHROPIC_API_KEY` not set in `.env` (restart `npm run dev` after adding it).
2. Key is valid but the account has no billing/credits set up at console.anthropic.com - you'll now see this exact message from the app instead of a generic failure.
3. Model name typo in `ANTHROPIC_MODEL` if you overrode the default.

**Demo accounts won't log in** — if you seeded before this update, your
demo users' password hash was broken (a real bug found and fixed during
this pass - the original hash was a placeholder string, not an actual
hash of `pulse-demo-2026`). Re-run `npm run db:seed` - the upsert now
always refreshes the password hash on conflict, so this self-heals
without needing to drop any tables.

**`prisma generate` / `migrate dev` fails with a schema validation error
about `url` not being supported** — you have Prisma 7+ installed, which
removed support for `url = env("DATABASE_URL")` directly in
`schema.prisma`. This project is pinned to Prisma 6.19.3 in
`package.json` for exactly this reason - run `npm install` again.

**`prisma generate` fails with a network/checksum error** — Prisma needs
to reach `binaries.prisma.sh` to download its engine. Corporate firewalls
or some antivirus products block this.

**Project is inside a `OneDrive` (or similar cloud-synced) folder** — move
it to a plain local folder first (e.g. `C:\dev\PULSE`). Cloud sync clients
actively lock/rewrite files under `node_modules` and can corrupt Prisma's
downloaded engine mid-write.

**Adding a customer says "Prediction failed" / ML inference error** —
this means the Node process couldn't successfully run
`python -m pipeline.predict` in `ml/`. Check: Python + `ml/requirements.txt`
are installed and on PATH; Step 1's pipeline has been run at least once
(needs a promoted model in `ml/artifacts/metadata/model_registry.json`);
if running from a different working directory, set the `ML_DIR` env var
to the absolute path of your `ml/` folder.

**Segments page is empty** — run `npm run segments:sync`. It shells out
to Python the same way seeding does, so the same Python/PATH
requirements apply.

**Model metrics differ from a screenshot or another machine** — expected.
Tree-based models aren't bit-for-bit reproducible across different
scikit-learn/XGBoost versions or hardware, even with the same seed.

---

## What was actually verified (and what wasn't, and why)

This project was built in a sandbox whose network only allows
npm/pip/GitHub registries - two things couldn't be run there:

1. **`binaries.prisma.sh`** (Prisma's CLI needs this for its engine).
   Worked around by hand-writing both migration files and applying them
   directly to a real, running PostgreSQL 16 instance - verified for
   real: every table, every foreign key, confirmed via direct SQL,
   including the `username` backfill migration tested against an
   already-seeded database with existing rows.
2. **`fonts.googleapis.com`** (Next.js fetches Google Fonts at build
   time). Worked around by temporarily stubbing the font module during
   verification builds, then restoring the real implementation.

Neither affects you - both work normally with regular internet access.

**What was verified with a real, repeated `next build`**: every page and
API route, including everything added this pass (signup, the customer
onboarding form, the inference bridge, segmentation). This wasn't just a
read-through - actual builds were run, catching and fixing real bugs
including: a genuinely broken demo-account password hash (a placeholder
string that was never a real bcrypt hash of anything - fixed and
verified with a real hash), an unwrapped Anthropic API call that crashed
the assistant route on any upstream error, several implicit-`any` and
enum-typing issues, and a missing `deleteMany` case in the verification
harness itself. The final state type-checks with **zero errors** across
the whole app and all three standalone scripts (`prisma/seed.ts`,
`scripts/sync-astra.ts`, `scripts/sync-segments.ts`).

**What was verified by running it for real, end to end**: the entire ML
pipeline, including the new single-customer inference path
(`predict_from_features`) - tested with a deliberately at-risk profile
(scored 32%, CRITICAL) against a deliberately healthy one (scored 9.5%,
LOW), confirming the model produces genuinely differentiated output, not
a constant or fake value. The K-means segmentation was run against the
full synthetic dataset and produced four coherent, real segments (e.g.
"Highly engaged / Healthy" at 8.4% average churn vs. "Low engagement /
At-risk" at 19.8%). 29 pytest tests pass.

---

## What's built vs. what isn't (honest scope)

**Fully built and working (as of this pass):**
- Real username/password signup with its own workspace per user, alongside working demo accounts
- Customer onboarding form → real feature engineering → real trained-model inference → persisted prediction, immediately displayed
- "Run Prediction" re-scoring on any customer
- K-means segmentation with deterministic, characteristics-based naming, full drill-down UI
- AI assistant, now with a hardened error path (see Troubleshooting) and 12 real tools including segment queries
- Everything already listed as built in the previous pass: ML pipeline, schema, auth, dashboards, recommendations, Astra similarity search, legal pages, dot-matrix landing page

**Explicitly not built (clearly marked in the UI or documented here, not faked):**
- CSV customer import (spec called this optional/"if it fits cleanly" - deferred given everything else in this pass)
- Full "Edit customer" re-entry of behavioral fields - "Run Prediction" re-scores using the last known feature snapshot, but there's no dedicated edit-and-resubmit flow for behavioral fields yet (account-level details can be changed directly in the database or a future edit page)
- Realtime updates (SSE/WebSockets) - pages are server-rendered per request
- Third-party support-platform adapter (Intercom/Fin) - out of scope in favor of the custom assistant, per the original spec's own priority

---

## Frequently changed files

See `ml/README.md` for the ML-side table. For the app/database layer:

| I want to... | Edit this file |
|---|---|
| Add/change a database table or column | `prisma/schema.prisma`, then `npx prisma migrate dev --name <description>` |
| Change signup validation rules | `src/lib/auth/signup.ts` |
| Change what the onboarding form asks for / how it maps to model features | `src/lib/onboarding/feature-mapping.ts` (keep in sync with `ml/src/features/definitions.py`) |
| Change segmentation logic or the number of clusters | `ml/src/segmentation/cluster.py` |
| Change demo user accounts/roles | `prisma/seed.ts` → `seedOrgAndUsers()` |
| Tune the AI assistant's tone/behavior | `src/lib/ai/prompts/assistant.ts` |
| Add a new AI assistant tool | `src/lib/ai/tools/*.ts`, then register in `src/lib/ai/tools/index.ts` |
| Change risk-band colors or the type system | `app/globals.css` (`@theme` block) |
| Change the recommendation-generation prompt | `src/lib/ai/recommendations.ts` |

---

## Project structure

```
pulse/
├── ml/                       # Python ML pipeline (see ml/README.md)
│   └── src/segmentation/     # K-means clustering
├── prisma/
│   ├── schema.prisma
│   ├── migrations/           # two hand-verified migrations - see their headers
│   └── seed.ts
├── scripts/
│   ├── sync-astra.ts
│   └── sync-segments.ts
├── src/
│   ├── auth.ts
│   ├── lib/
│   │   ├── ai/                # provider, tools (12), prompts, recommendations
│   │   ├── astra/
│   │   ├── auth/signup.ts     # signup validation + workspace creation
│   │   ├── onboarding/        # form-to-feature-vector mapping
│   │   ├── ml/inference-bridge.ts  # shells out to Python for live scoring
│   │   ├── queries.ts
│   │   └── prisma.ts
│   └── components/
└── app/
    ├── (dashboard)/            # overview, customers (+ new/[id]), segments (+ [id]), assistant, etc.
    ├── api/
    ├── legal/
    ├── login/
    ├── signup/
    └── page.tsx
```
