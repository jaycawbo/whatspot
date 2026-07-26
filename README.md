# Whatspot

**Discover your next favourite spot to eat.**

Whatspot is a venue discovery app that helps diners find the right restaurant, bar, or cafe in the moment, through a swipe-based discovery deck and natural language search instead of endless scrolling through lists and filters.

> **Status:** Pre-launch, active development. This release focuses on the discovery experience (search, swipe, save, feed). Real-time walk-in requests between diners and venues are built but not part of this initial release, see [Roadmap](#roadmap).

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Swipe-based discovery deck** — Swipe right to save a spot as Interested, left to pass, up to mark a place you've Been Here, down to skip for now.
- **Natural language search** — Type things like "iconic New York bar for a night cap" and get relevant results, powered by an LLM intent layer rather than rigid keyword filters.
- **Spots collections** — Save venues into Favourites and Interested lists, tag them with occasion labels, and rate places you've been to with optional notes.
- **Feed** — Browse venues across For You, New, Trending, and Popular tabs, with filters for Open Now, price, cuisine, and radius.
- **Quick filters & chips** — Jump straight into Food, Drinks, Coffee, or Bakeries, or refine a search with suggested chips (Happy Hour, Cocktail Bar, Late Night Bites, etc.).
- **Onboarding flow** — A short, animated 3-screen intro for first-time users, on both mobile and desktop.
- **Places data fallback** — Google Places API integration fills in venue data gaps behind a feature flag, with cost controls (field masking, session tokens, caching).

---

## Tech Stack

**Frontend**
- React + Vite
- Framer Motion (animations, swipe gestures)
- Leaflet + CARTO (map tiles)

**Backend**
- Supabase (Postgres, Edge Functions in TypeScript/Deno, Realtime)
- Vercel (hosting + serverless functions)

**AI / Data**
- Gemini (natural language search intent parsing, venue descriptions)
- Google Places API (New) — fallback data source
- Photon (location autocomplete) / Nominatim (reverse geocoding)

**Planned**
- Capacitor (native iOS/Android wrapper)
- Stripe (web subscriptions)

---

## Getting Started

### Prerequisites

- Node.js 22+
- npm
- A Supabase project (Postgres + Edge Functions)
- API keys for Gemini and Google Places (New), if you want the search and fallback data features working locally

### Environment Variables

Create a `.env` file in the project root. Only values that are safe for the browser use the `VITE_` prefix; everything else is server-side only and accessed through Vercel serverless functions or Supabase Edge Functions.

```
# Client-safe (exposed to the browser)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_key

# Server-side only (do NOT prefix with VITE_)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_PLACES_API_KEY=your_google_places_key

# Feature flags
GOOGLE_PLACES_SEARCH_ENABLED=false
```

Ask a project maintainer for actual values, they are never committed to the repo.

### Installation

```bash
# Clone the repository
git clone https://github.com/jaycawbo/whatspot.git

# Navigate to the project directory
cd whatspot

# Install dependencies
npm install

# Copy the example env file and fill in your values
cp .env.example .env
```

---

## Usage

```bash
# Start the local dev server
npm run dev
```

Once running, the app opens on the search/discovery home screen. From there you can:
- Search using natural language ("best nearby bars") or tap a quick filter chip
- Swipe through the discovery deck to save or dismiss venues
- Switch between List and Map view on any results screen
- Open the Spots tab to see saved Favourites and Interested venues

---

## Project Structure

_A short orientation for anyone new to the repo. Update this as the structure evolves._

```
whatspot/
├── src/
│   ├── components/     # UI components (deck, cards, feed, filters, etc.)
│   ├── pages/          # Top-level screens/routes
│   ├── lib/            # Supabase client, API helpers, Gemini integration
│   └── hooks/          # Shared React hooks
├── supabase/
│   ├── functions/      # Edge Functions (Deno/TypeScript)
│   └── migrations/     # Database schema
├── public/
└── vercel.json
```

---

## Roadmap

This release is scoped to the discovery experience. Not yet included, but built or planned:

- **Real-time walk-in requests** — On-demand table requests between diners and venues, with server-authoritative timers and live accept/decline flow (backend groundwork already in place)
- **Native mobile apps** — iOS and Android via a Capacitor wrapper
- **Subscriptions** — Web-based paid tier via Stripe, with in-app purchase support to follow

---

## Contributing

This is currently a small, closed team project. If that changes, this section will cover:
- Branching and pull request conventions
- How to run tests locally
- Code style and review expectations

For now, reach out to a maintainer before opening a PR.

---

## License

_No license has been set yet. Until one is added, all rights are reserved and the code is not licensed for reuse._
