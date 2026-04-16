# Resona

A private space for two people to feel each other without words.

**Live:** [resona-app.com](https://resona-app.com)

---

## What It Is

Resona connects two people through nonverbal "traces" — drawn gestures carrying an emotional tone. There are no messages, no text, no profiles. One person draws, the other discovers. Every trace feeds into an invisible shared artwork that grows over time.

The interaction is turn-based: after you send a trace, you wait for your partner to send one back. This creates a slow, intentional rhythm — not a chat.

---

## Setup

### Supabase

Run these SQL files in order in the Supabase SQL Editor:

1. `supabase-schema.sql` — tables, RLS policies, core functions
2. `supabase-migration.sql` — proposals, artwork reset, dissolve, realtime
3. `supabase-migration-2.sql` — still-here, nudge, turn-based sending, RLS fix
4. `supabase-migration-3.sql` — automatic inactive pair cleanup (requires pg_cron extension)

For migration 3: enable pg_cron first via Supabase Dashboard → Database → Extensions → pg_cron.

Then configure:

- **Authentication → Providers**: enable Anonymous Sign-Ins + Email
- **Authentication → URL Configuration**: set Site URL to `https://resona-app.com` and add it to Redirect URLs
- **`src/lib/supabase.js`**: update `SUPABASE_URL` and `SUPABASE_KEY` with your project credentials

### Build & Deploy

```bash
npm install
npm run build
```

Upload everything in `dist/` to your web root. The `dist/` folder contains the production build with bundled JS/CSS, manifest, service worker, and `.htaccess` for Apache/Plesk.

For local development: `npm run dev` (localhost:5173).

---

## User Flow

### Welcome

Animated background with ghost traces in tone colors. Two entry points:

- **BEGIN** — creates an anonymous guest account, enters onboarding
- **already have an account?** — sign in with email via magic link, returns to existing pair

### Onboarding

Three animated screens that preview the core mechanics:

1. **"draw what you feel"** — a trace draws itself in shifting tone colors, five tone circles pulse below
2. **"your person discovers it"** — a searching glow spirals toward a hidden point, proximity feedback intensifies, hold-ring fills, reveal flashes
3. **"something grows between you"** — traces accumulate inside a circular window, building an artwork preview

Each screen is tap-to-advance.

### Pairing

One person creates an invite (generates a 6-character code), the other enters it. The invite can be shared via Web Share API (WhatsApp, iMessage, etc.) or copied as a link (`resona-app.com/?code=ABC123`). Links auto-fill the code on open. Codes expire after 24 hours.

### Account

Everyone starts as a guest (anonymous, device-bound). In Settings, guests can secure their account with an email via magic link. Once secured, they can sign back in on any device from the Welcome screen.

---

## Core Mechanics

### Sending a Trace

Tap the send button at the bottom of the space. Choose an emotional tone — each plays a short preview sound and flashes its color:

| Tone | Color | Feel |
|------|-------|------|
| Nearness | Warm gold | Slow, flowing strokes |
| Longing | Deep purple | Stretched, pulling lines |
| Tension | Sharp red | Tight, angular marks |
| Warmth | Soft orange | Round, full gestures |
| Playfulness | Bright cyan | Bouncing, rhythmic lines |

Draw your gesture on the canvas, release to send. The trace goes to your partner. You cannot send again until they send one back (turn-based).

### Discovering a Trace

When a trace arrives, the space says "SOMETHING IS HERE". Touch the screen and move slowly. Four proximity zones give increasingly strong feedback:

- **Far**: faint atmospheric haze
- **Medium**: glowing aura, orbiting particles
- **Close**: strong pull, connection line to the hidden point
- **Found**: hold ring appears — hold for 1.5 seconds to reveal

Discovery difficulty varies by tone: Nearness is easiest to find (large radius), Tension is hardest (small radius). Playfulness traces drift slowly — you follow them.

### Reveal & Glimpse

After revealing a trace, a full-screen animation plays the gesture in its tone color. Then a brief glimpse shows the shared artwork through a circular window (9 seconds). This is the only regular way to see the artwork.

### Shared Artwork

Every trace from both partners contributes to an invisible shared artwork. It uses temporal layering — older traces appear more diffuse, newer ones sharper — and slight rotation/offset per trace for organic composition. The artwork is never fully visible during normal use; only through glimpses, or by triggering a full reveal.

---

## Resona Moments

Rare events triggered by specific conditions. Maximum one per reveal, 5-hour cooldown between moments. Priority determines which fires if multiple conditions are met.

**Twin Connection** (highest priority): Both partners sent a trace within 15 minutes of each other. The revealer picks a whisper word from a rotating pool of 25 — the partner receives it as a glowing text overlay.

**Trace Convergence**: The revealed trace overlaps >45% with a recent trace from the partner. The revealer picks an echo mark (symbol) from a pool of 15 — the partner sees it in their space.

**Amplified Reveal** (automatic): The revealed gesture was especially intense (>3 seconds, >8 direction changes). No interaction needed — the reveal animation is extended, and the residue echo lasts 3× longer with higher visibility. The discoverer sees "THIS TRACE TOOK TIME". The partner sees "YOUR TRACE REACHED THEM / they stayed with yours".

---

## Presence & Idle

**Partner presence**: When your partner is online, a warm pill indicator ("here") appears top-left. The space background subtly warms and particles drift toward the center — you feel them without needing to look at a label.

**Residue echoes**: The last 3 revealed traces remain as faintly drifting ghosts in the space (30 min / 60 min / 120 min). The space has memory.

**Epoch progression**: As the total trace count grows (10, 25, 50, 100), the space's base color gradually shifts warmer. Day 1 looks different from day 100.

**Day counter**: Shows how many days since pairing (visible when partner is offline).

**Still Here**: When you have nothing to send and no pending trace, a presence dot appears at the bottom. Hold it for 2 seconds to send a soft pulse to your partner ("your person is here"). Maximum once every 4 hours.

**Nudge**: When your sent trace has been undiscovered for 2+ hours, "send a gentle reminder" appears. One tap sends a notification to your partner ("your person is waiting"). Maximum once per undiscovered trace.

**Milestones**: Silent, one-time text overlays at trace counts 1, 10, 25, 50, 100 ("the first mark", "something is growing", etc.).

---

## Reunion & Artwork Reveal

**Plan a Reunion**: Settings → Plan a Reunion → pick a future date → partner accepts or declines. On the chosen day, the full shared artwork is revealed in a 12-second animation. After the animation, SAVE and CONTINUE buttons appear — save downloads a 1080×1080 PNG, continue leads to a prompt asking whether to start fresh.

A planned reunion can be changed (new date) or cancelled from Settings at any time.

**Reveal Artwork**: Settings → Reveal Artwork → partner accepts → same full reveal animation with save option. No date needed — happens immediately.

**Start Fresh**: Settings → Start Fresh → partner accepts → all traces and artwork are cleared. Both start building from zero.

**Dissolve Connection**: Settings → Dissolve Connection → permanently ends the pair. All data is deleted. Partner is notified in real-time.

**Draw Together**: After a pair has exchanged at least 6 traces and at least 7 days have passed since the last shared canvas session, a "draw together" invite may appear when the partner is online. One person sends an invite; the partner can accept or decline. If accepted, both draw on a shared real-time canvas simultaneously. The result is saved as an artwork contribution.

---

## Sound & Haptics

All sounds are synthesized via Web Audio API — no audio files:

| Sound | Trigger |
|-------|---------|
| Two ascending notes | Found the trace |
| C major arpeggio | Reveal complete |
| Warm bell | Moment triggered |
| Confirmation duo | Trace sent |
| Soft alert | Trace arrived |
| Deep resonance | Artwork reveal |
| Single soft tone | Still-here sent |
| Gentle double tap | Nudge sent |
| 5 tone previews | Tone selection (each unique) |

Haptic feedback (vibration API) fires on proximity zones, hold, reveal, moments, and send. Gracefully degrades on unsupported devices.

---

## Technical Details

### Stack

- **Frontend**: React 18, Vite 5, single-file architecture (`App.jsx`)
- **Backend**: Supabase (Postgres, Auth, Realtime, RLS)
- **PWA**: Service worker, manifest, installable on Android/iOS
- **Audio**: Web Audio API (synthesized, no files)
- **Rendering**: HTML5 Canvas with Perlin noise, particle systems

### File Structure

```
resona/
├── dist/                        Production build (deploy this)
│   ├── index.html
│   ├── .htaccess
│   ├── manifest.json
│   ├── sw.js
│   └── assets/
│       ├── index-[hash].js      Bundled app
│       └── index-[hash].css     Styles
├── src/
│   ├── App.jsx                  All screens and components
│   ├── index.css                Keyframe animations
│   ├── main.jsx                 Entry point
│   └── lib/
│       ├── audio.js             Synthesized sounds
│       ├── constants.js         Tones, config, drawArtwork, epochs
│       ├── haptics.js           Vibration feedback
│       ├── moments.js           Moment detection and cooldown
│       └── supabase.js          Auth, DB, realtime, proposals
├── public/
│   ├── manifest.json            PWA manifest
│   └── sw.js                    Service worker
├── supabase-schema.sql          Base schema
├── supabase-migration.sql       Migration 1: proposals
├── supabase-migration-2.sql     Migration 2: events, turn-based, RLS fix
├── supabase-migration-3.sql     Migration 3: automatic inactive pair cleanup
├── index.html                   Dev entry point
├── package.json
└── vite.config.js
```

### Database

| Table | Purpose |
|-------|---------|
| `users` | Auth rows, pair reference, push token |
| `pairs` | Connections (invite code, status, timestamps) |
| `traces` | Gestures with tone, position, signal type, discovery state |
| `resonance_events` | Moments, still-here pulses, nudge notifications |
| `artwork_contributions` | Gesture paths contributing to shared artwork |
| `pair_proposals` | Reunions, artwork reveals, fresh starts (proposal/response flow) |

### Security

- Row Level Security on all tables
- Turn-based sending enforced server-side (`can_send_trace` function)
- Rate limit: 5 traces/day maximum
- Invite codes expire after 24 hours
- Artwork reset and dissolve run as security definer functions
- Proposal RLS uses direct user lookup (no recursive subqueries)
- Anonymous auth with optional email linking
- Magic link sign-in with redirect URL validation
- Publishable key safe with RLS enforcement

### Constraints & Limits

| Rule | Value |
|------|-------|
| Traces per day | 5 |
| Undiscovered traces per user | 1 |
| Sending order | Turn-based (alternating) |
| Moment cooldown | 5 hours |
| Still-here cooldown | 4 hours |
| Nudge delay | 2 hours after sending |
| Nudge per trace | 1 |
| Invite code expiry | 24 hours |
| Residue echo duration | 30 / 60 / 120 minutes |
| Epoch thresholds | 10, 25, 50, 100 traces |
| Milestones | 1, 10, 25, 50, 100 traces |
| Inactive pair cleanup | 14 days without any activity |
| Draw Together unlock | ≥6 traces exchanged, ≥7 days since last session |
