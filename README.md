# Resonance

A private web app for two people to feel each other without words.

---

## Deploy — Two Steps

### 1. Supabase SQL Editor

Run these in order (if schema already exists, only run the migration):

1. `supabase-schema.sql` — base tables
2. `supabase-migration.sql` — proposals, artwork reset, dissolve cleanup, realtime

### 2. Upload

Upload everything in `dist/` to your web root.
Plesk + Git: set Document Root to `dist/`.

---

## Local Dev

```bash
npm install
npm run dev        # localhost:5173
npm run build      # → dist/
```

---

## Features

### Onboarding
3 screens after "BEGIN": draw → discover → artwork grows

### Traces
Choose tone → draw gesture → partner searches and reveals it

### Resonance Moments
Rare (8h cooldown, max 1 per reveal):
- Twin Connection → whisper word to partner
- Trace Convergence → echo mark (♡ ∞ ☾ ❀ ✧)
- Amplified Reveal → reaction gesture

### Reunion
One person proposes a date → partner accepts → on that day the full shared artwork is revealed (20s animation). After the reveal: option to start fresh.

### Start Fresh
Either person can propose an artwork reset (Settings → "Start Fresh"). Partner must agree. Clears all traces and artwork — a new chapter begins.

### Dissolve
Deletes everything. Partner is notified in real-time.

---

## File Structure

```
resonance/
├── src/App.jsx              Main app
├── src/lib/constants.js     Tones, config
├── src/lib/supabase.js      DB + realtime API
├── src/lib/moments.js       Moment detection
├── dist/                    Deploy this
├── supabase-schema.sql      Base schema
└── supabase-migration.sql   Run once
```

---

## Security

- Row Level Security on all tables
- Rate limit: 5 traces/day (DB function)
- Invite codes expire after 24h
- Artwork reset runs as server-side function (security definer)
