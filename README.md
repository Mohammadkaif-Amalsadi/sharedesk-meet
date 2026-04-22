# Forex Movers Dashboard

A Render-ready forex dashboard that shows top gaining and losing currency pairs with search, sorting, auto-refresh, and an all-pairs table.

## Data Source

The app fetches currency quotes server-side from Yahoo Finance's currency market data endpoint and refreshes the dashboard every 15 seconds by default.

Source page:

```text
https://finance.yahoo.com/markets/currencies/
```

Yahoo Finance quotes may be real-time or delayed depending on the instrument, exchange, and region. For institutional-grade real-time FX, connect a paid provider such as Alpha Vantage premium, Twelve Data, Polygon, OANDA, or a broker feed.

## Features

- Top forex gainers
- Top forex losers
- Search by pair, symbol, or currency
- Sort by change %, raw change, price, or pair name
- Adjustable row limit
- Auto refresh toggle
- Server-side quote proxy to avoid browser CORS issues
- 15-second quote cache to reduce provider load
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
QUOTE_CACHE_MS=15000
```

Lower values refresh more aggressively. Higher values reduce upstream requests.

## Files

- `server.js` - Express app, health endpoint, forex quote API proxy
- `public/index.html` - dashboard markup
- `public/app.js` - sorting, filtering, refresh, rendering
- `public/styles.css` - responsive dashboard styling
- `render.yaml` - Render deployment config
