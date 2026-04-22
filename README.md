# Forex Movers Dashboard

A Render-ready forex dashboard that shows top gaining and losing currency pairs with search, sorting, auto-refresh, and an all-pairs table.

## Data Source

The app fetches currency quotes server-side from `fxapi.app` and refreshes the dashboard every 5 minutes by default.

Source page:

```text
https://fxapi.app/
```

`fxapi.app` provides no-key JSON currency rates and states that rates are updated every 5 minutes from central bank and financial data sources. The dashboard computes pair movement by comparing the latest rate with recent historical/reference rates from the same provider.

For institutional-grade tick-by-tick FX, connect a paid provider such as Twelve Data Forex API v2, Finnhub, OANDA, Polygon, or a broker feed.

## Features

- Top forex gainers
- Top forex losers
- Search by pair, symbol, or currency
- Sort by change %, raw change, price, or pair name
- Adjustable row limit
- Auto refresh toggle
- Server-side quote proxy to avoid browser CORS issues
- 5-minute quote cache to match the no-key provider update cadence
- Render-ready `render.yaml`

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

Quotes API:

```text
http://localhost:3000/api/forex
```

## Deploy On Render

1. Push the project to GitHub.
2. In Render, create a Web Service from the repository.
3. Use:

```text
Runtime: Node
Build command: npm install
Start command: npm start
Health check path: /health
```

Render provides `PORT` automatically.

## Configuration

Optional cache interval:

```text
QUOTE_CACHE_MS=300000
```

Lower values refresh more aggressively. Higher values reduce upstream requests.

## Files

- `server.js` - Express app, health endpoint, forex quote API proxy
- `public/index.html` - dashboard markup
- `public/app.js` - sorting, filtering, refresh, rendering
- `public/styles.css` - responsive dashboard styling
- `render.yaml` - Render deployment config
