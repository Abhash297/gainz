# GainZ — Lifting Progress Tracker

## Purpose
Personal, local-only app to log compound lift training and visualize progress over time. No coaching, no auto-generated fatigue/phase labels — the app surfaces raw numbers and graphs; the user interprets training phase (load/deload/peak) themselves from the shape of the graph.

## Scope (v1)
Track the big 4 compound lifts only:
- Squat
- Bench Press
- Deadlift
- Overhead Press

Accessory lifts and custom exercises are out of scope for v1 (add later if needed).

## Platform & Stack
- Plain HTML/CSS/JS, installable as a PWA (add-to-homescreen on phone).
- Storage: IndexedDB (local-only, no backend, no login, no network dependency).
- Charts: Chart.js.
- No build toolchain — open `index.html` or serve statically, works offline via service worker.

Rationale: zero setup, cross-platform (iOS/Android browser), fastest to build and iterate, matches "local-only" data requirement with no sync complexity.

## Units
kg. 1RM estimation formula: **Epley** — `est1RM = weight × (1 + reps / 30)`.

## Data Model

### Set entry (atomic unit of logging)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| lift | enum | squat / bench / deadlift / ohp |
| date | date | session date |
| weight | number | kg |
| reps | integer | |
| setNumber | integer | order within session, optional |
| notes | string? | optional free text |

A session = all sets logged for one date (possibly multiple lifts). No separate "session" table needed in v1 — derive sessions by grouping sets on `date`.

### Derived per lift (computed, not stored)
- **Current weight**: weight of most recent logged set (top set of most recent session for that lift).
- **Actual PR**: heaviest `weight` ever logged for that lift, at that `reps`/`date`. Also track best-at-reps PRs (e.g. best @1, best @3, best @5) since a true 1-rep PR and a 5-rep PR are different training signals.
- **Estimated PR**: max `est1RM` across all sets ever logged for that lift, with the weight/reps/date of the set that produced it.
- **Volume**: `Σ(weight × reps)` per session per lift, aggregated weekly/monthly.

## Features (v1)

### 1. Log a lift
- Quick-entry form: pick lift → date (default today) → weight → reps → optional notes.
- Support logging multiple sets per lift per session without re-entering lift/date each time.

### 2. Per-lift dashboard
For each of the 4 lifts, show:
- Current weight (most recent top set).
- Actual PR (weight × reps, date).
- Estimated PR (est1RM, derived from which set, date).
- Mini trend indicator (e.g. last 4 sessions' top-set weight).

### 3. Graphs
- Per-lift line chart, X-axis = time, toggle **weekly / monthly** aggregation.
- Series plotted (togglable):
  - Top-set weight per session
  - Estimated 1RM per session (Epley)
  - Volume per session/week/month
- Mark actual PR and estimated PR points on the graph (e.g. star marker).
- No automatic phase/fatigue labeling — just the lines, for the user to read load/deload/peak by eye.

### 4. History / log view
- Chronological list of all logged sets, filterable by lift and date range.
- Edit/delete a past entry (for correcting typos).

## Explicitly out of scope (v1)
- Fatigue/readiness scoring or auto-detected training phase.
- Accessory lifts / custom exercise list.
- Cloud sync, multi-device, auth, multi-user.
- RPE/RIR tracking (reconsider for v2 if useful for your own notes).
- Programmed workout plans / prescribed sets (this is a tracker, not a program builder).

## Open questions for v2 (not blocking v1 build)
- Do you want RPE or bodyweight logged alongside sets (useful context for reading graphs)?
- Bar path / warmup sets included in volume calc, or only "working sets"?
- Export/backup of IndexedDB data (JSON export) in case of device loss.
