# Resonance

A private web app for two people to feel each other without words.

**Live:** https://resonance.wolf-webentwicklung.de/

---

## Deploy

### 1. Supabase SQL Editor (in order)

1. `supabase-schema.sql` — base tables (skip if already done)
2. `supabase-migration.sql` — proposals, artwork reset, dissolve cleanup, realtime
3. `supabase-cleanup.sql` — wipes all data for a fresh start (optional, one-time)

### 2. Upload

Everything in `dist/` goes to your web root. Plesk + Git: set Document Root to `dist/`.

### 3. Supabase Config

In `src/lib/supabase.js`, set your `SUPABASE_URL` and `SUPABASE_KEY`.
Make sure **Anonymous Sign-Ins** are enabled (Authentication → Providers).

---

## Local Dev

```bash
npm install
npm run dev        # localhost:5173
npm run build      # → dist/
```

---

## How It Works

### Onboarding
3 screens after "BEGIN" explain the concept:
1. *draw what you feel* — choose a tone, draw a gesture
2. *your person discovers it* — they search and reveal it
3. *something grows between you* — an invisible artwork builds up

### Traces
Choose an emotional tone (Nearness, Longing, Tension, Warmth, Playfulness) → draw a gesture → it's sent to your partner → they explore the Resonance Space to find it → hold to reveal → the gesture plays back → a brief glimpse of the shared artwork appears.

Each trace has a random signal type (shimmer, pulse, drift, flicker, density, wave) that subtly animates the space while the partner searches.

### Discovery
"SOMETHING IS HERE" — touch the space, move slowly. The closer you get to the hidden trace, the more the space reacts:
- **Far** (>60%): faint haze
- **Medium** (30-60%): glow follows your finger
- **Close** (10-30%): particles react, orbs orbit
- **Found** (<10%): strong pull, connection line, hold ring appears

Haptic feedback intensifies with proximity. Hold 1.5 seconds to reveal.

### Resonance Moments
Rare bonus interactions. **Max 1 per reveal. 8-hour cooldown. Priority decides which triggers.**

| Moment | Priority | Condition | Action |
|--------|----------|-----------|--------|
| Twin Connection | highest | Both sent a trace within the last 5 minutes | Choose a whisper word → partner receives it |
| Trace Convergence | medium | Gesture paths overlap >55% | Choose an echo mark → partner sees it |
| Amplified Reveal | lowest | Gesture was intense (>3s, >8 direction changes, >0.65 intensity) | Draw a reaction gesture |

**Whisper words** rotate from a pool of 25 (here, closer, stay, always, miss, safe, home, warm, dream, hold, breathe…). 5 random ones shown each time.

**Echo marks** rotate from a pool of 15 symbols (♡ ∞ ☾ ❀ ✧ ★ ∿ …). 5 random ones shown each time.

### Shared Artwork
Every trace becomes part of an invisible shared artwork. It's never permanently visible — only during brief glimpses after reveals, or during a full artwork reveal.

### Reunion
Settings → **Plan a Reunion** → pick a date → partner accepts or declines. When both agree and the day comes, the full artwork is revealed in a 20-second animation. Afterward: option to start fresh.

### Reveal Artwork
Settings → **Reveal Artwork** → confirm → partner accepts → full artwork reveal. Both need to agree. Both see the reveal independently.

### Start Fresh
Settings → **Start Fresh** → confirm → partner accepts → all traces, artwork, and events are deleted server-side. A new chapter begins. Both need to agree.

### Dissolve
Settings → **Dissolve Connection** → confirm → everything is deleted, partner is notified in real-time with a "CONNECTION DISSOLVED" overlay.

---

## Sound & Haptics

**6 sounds** (Web Audio API, no files):
- Found trace: two ascending notes (G4 → B4)
- Reveal: C major arpeggio (C4 → E4 → G4)
- Moment: warm bell (C5 + G5 harmonic)
- Trace sent: confirmation ping (A4 → C5)
- Trace arrived: soft notification (G4 → B4)
- Artwork reveal: deep resonance (C3 → G3 → C4)

**Haptic feedback** on discovery proximity, hold, reveal, moments, and trace send. Silent no-op on unsupported devices.

---

## PWA

- Installable on Android (native install prompt) and iOS (share → Add to Home Screen)
- Install prompt appears after 8 seconds in browser mode
- Service Worker with app-shell caching
- Safe-area-inset support for notch/Dynamic Island
- Browser notifications when traces arrive in background

---

## Presence & Day Counter

- **Presence**: Supabase Realtime Presence channels. A warm dot + "here" appears when your partner is online.
- **Day counter**: "day 14" shown subtly, calculated from pair creation date.
- Both visible on the main screen and in settings.

---

## File Structure

```
resonance/
├── src/
│   ├── App.jsx                All screens and components
│   ├── index.css              Animations
│   ├── main.jsx               Entry point
│   └── lib/
│       ├── audio.js           Web Audio sounds
│       ├── constants.js       Tones, word/mark pools, config
│       ├── haptics.js         Vibration feedback
│       ├── moments.js         Moment detection + cooldown
│       └── supabase.js        DB, auth, realtime, proposals
├── public/                    PWA assets
├── dist/                      Production build (deploy this)
├── supabase-schema.sql        Base DB schema
├── supabase-migration.sql     Run once after schema
└── supabase-cleanup.sql       Optional: wipe all data
```

---

## Security

- **Row Level Security** on all tables
- **Rate limit**: 5 traces/day, max 1 undiscovered (DB function)
- **Invite codes** expire after 24 hours
- **Artwork reset** runs as server-side function (security definer)
- **Anonymous auth** — no password, account tied to browser storage
- Publishable key in client is safe (RLS protects all data server-side)

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Auth user rows (id, pair_id, push_token) |
| `pairs` | Pair connections (invite_code, status) |
| `traces` | Traces (gesture, tone, position, discovery status) |
| `resonance_events` | Moments (whisper words, echo marks, pulse gestures) |
| `artwork_contributions` | Gesture paths contributing to shared artwork |
| `pair_proposals` | Reunions, reveals, resets (type, status, date) |
