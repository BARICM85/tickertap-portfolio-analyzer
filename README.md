# TickerTap Clone Portfolio Analyzer

Standalone React + Vite stock portfolio analyzing app with Firebase Google login and Zerodha broker sync support.

## Features

- Dashboard with allocation, P&L, market movers, portfolio pulse, and watchlist triggers
- Portfolio workspace with manual entry, CSV/JSON import, JSON export, search, and Zerodha holdings sync
- Stock detail view with valuation snapshot, thesis notes, scenario planning, and generated analysis
- Risk lab with concentration checks, sector exposure, beta view, and rebalance suggestions
- Watchlist with target-price tracking and one-click move into portfolio
- Google sign-in using Firebase Authentication
- Local browser storage for portfolio and watchlist data

## Run locally

1. Install dependencies

```bash
npm install
```

2. Copy the environment template

```bash
copy .env.example .env
```

3. Fill in your Firebase and Zerodha keys in `.env`

4. Start the frontend

```bash
npm run dev
```

5. Start the Zerodha backend bridge in a second terminal

```bash
npm run dev:server
```

## Separate local CMD mode and hosted web mode

The app now keeps local and hosted data separate automatically.

- Local CMD/browser mode uses storage namespace: `local`
- Hosted website mode uses storage namespace: `web`

That means:

- your local portfolio and watchlist stay separate from the hosted website portfolio
- chart layouts and option-chain preferences are also stored separately

### Local CMD mode

Use:

```bash
npm run dev:local
npm run dev:server
```

Reference env template:

- [.env.local.example](./.env.local.example)

### Hosted web mode

Use:

```bash
npm run build:web
```

Reference env template:

- [.env.web.example](./.env.web.example)

For hosting:

- frontend on Vercel
- backend on Render

## Firebase Google login setup

- Set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`
- In Firebase Console, enable Google as a sign-in provider in Authentication
- Keep your frontend running on the allowed local origin `http://localhost:5178`

## Zerodha setup

- Set `VITE_API_BASE_URL=http://localhost:8000`
- Set `ZERODHA_API_KEY` and `ZERODHA_API_SECRET`
- Whitelist `http://localhost:8000/api/zerodha/callback` as the redirect URL in your Kite Connect app
- Keep the backend running before clicking Connect Zerodha in the app

## Notes

- Sample holdings and watchlist items are seeded automatically on first load
- Broker sync merges fetched holdings into the local portfolio by symbol
- Spreadsheet imports should be converted to CSV before upload

## Deploy as a real website

Recommended setup:

- Frontend: Vercel Hobby
- Backend bridge: Render Free Web Service

### 1. Push this project to GitHub

Create a GitHub repo and push the whole project folder.

### 2. Deploy the frontend to Vercel

This project already includes [vercel.json](./vercel.json) for SPA routing.

- Import the GitHub repo into Vercel
- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Add frontend env vars:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_API_BASE_URL=https://YOUR-RENDER-BACKEND.onrender.com`

### 3. Deploy the backend to Render

This project already includes [render.yaml](./render.yaml).

- In Render, create a new `Web Service` from the same GitHub repo
- Root directory: project root
- Build command: `npm install`
- Start command: `npm run start:server`
- Add backend env vars:
  - `ZERODHA_API_KEY`
  - `ZERODHA_API_SECRET`
  - `ZERODHA_REDIRECT_URI=https://YOUR-RENDER-BACKEND.onrender.com/api/zerodha/callback`
  - `ZERODHA_FRONTEND_URL=https://YOUR-VERCEL-FRONTEND.vercel.app`
  - `ZERODHA_SESSION_PATH=server/.zerodha-session.json`
  - `ZERODHA_SERVER_PORT=10000`

### 4. Update provider settings

- Firebase Authentication authorized domains:
  - your Vercel domain
- Zerodha Kite redirect URL:
  - `https://YOUR-RENDER-BACKEND.onrender.com/api/zerodha/callback`
- Zerodha postback URL:
  - `https://YOUR-RENDER-BACKEND.onrender.com/api/zerodha/postback`

### 5. Important free-hosting note

Render Free web services spin down after 15 minutes of inactivity and may take up to about a minute to wake up again. That means broker or chart API calls can feel slow on the first request after idle.
