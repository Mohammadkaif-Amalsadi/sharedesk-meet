const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const QUOTE_CACHE_MS = Number(process.env.QUOTE_CACHE_MS || 5 * 60 * 1000);

const DEFAULT_SYMBOLS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "NZD/USD",
  "USD/CAD",
  "USD/CHF",
  "EUR/GBP",
  "EUR/JPY",
  "GBP/JPY",
  "AUD/JPY",
  "EUR/AUD",
  "EUR/CAD",
  "EUR/CHF",
  "GBP/AUD",
  "GBP/CAD",
  "GBP/CHF",
  "AUD/CAD",
  "AUD/NZD",
  "AUD/CHF",
  "NZD/JPY",
  "NZD/CAD",
  "CAD/JPY",
  "CHF/JPY",
  "USD/MXN",
  "USD/ZAR",
  "USD/TRY",
  "USD/SGD",
  "USD/HKD",
  "USD/NOK",
  "USD/SEK",
  "USD/DKK",
  "USD/PLN"
];

let cache = {
  timestamp: 0,
  data: null
};

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/forex", async (req, res) => {
  try {
    const requestedSymbols = String(req.query.symbols || "")
      .split(",")
      .map((symbol) => normalizePair(symbol.trim()))
      .filter(Boolean);

    const symbols = requestedSymbols.length ? requestedSymbols : DEFAULT_SYMBOLS;
    const data = await getForexQuotes(symbols);
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (error) {
    res.status(502).json({
      error: "Could not load forex quotes.",
      detail: error.message
    });
  }
});

async function getForexQuotes(symbols) {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < QUOTE_CACHE_MS) {
    return cache.data;
  }

  const quotes = await Promise.all(symbols.map(fetchFxapiPair));
  const validQuotes = quotes
    .filter((quote) => Number.isFinite(quote.price));

  const data = {
    source: "fxapi.app",
    sourceUrl: "https://fxapi.app/",
    fetchedAt: new Date().toISOString(),
    refreshMs: QUOTE_CACHE_MS,
    count: validQuotes.length,
    quotes: validQuotes
  };

  cache = {
    timestamp: now,
    data
  };

  return data;
}

async function fetchFxapiPair(pair) {
  const [base, quoteCurrency] = pair.split("/");
  const currentUrl = `https://fxapi.app/api/${base}/${quoteCurrency}.json`;
  const previousUrl = previousReferenceUrl(base, quoteCurrency);

  const [current, previous] = await Promise.all([
    fetchJson(currentUrl),
    fetchJson(previousUrl).catch(() => null)
  ]);

  const price = numberOrNull(current.rate);
  const open = numberOrNull(previous?.stats?.open ?? previous?.rate);
  const previousClose = open;
  const high = numberOrNull(previous?.stats?.high);
  const low = numberOrNull(previous?.stats?.low);
  const change = Number.isFinite(price) && Number.isFinite(previousClose)
    ? price - previousClose
    : null;
  const changePercent = Number.isFinite(change) && previousClose
    ? (change / previousClose) * 100
    : null;

  return {
    symbol: pair.replace("/", ""),
    pair,
    base,
    quote: quoteCurrency,
    name: `${base} to ${quoteCurrency}`,
    price,
    change,
    changePercent,
    previousClose,
    open,
    high,
    low,
    bid: null,
    ask: null,
    marketState: "LIVE",
    marketTime: current.timestamp || null
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Forex-Movers-Dashboard/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`fxapi.app responded with ${response.status}`);
  }

  return response.json();
}

function previousReferenceUrl(base, quoteCurrency) {
  const today = new Date();
  const previous = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 2));
  const from = previous.toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  return `https://fxapi.app/api/history/${base}/${quoteCurrency}.json?from=${from}&to=${to}`;
}

function normalizePair(symbol) {
  const clean = symbol.replace("=X", "").replace("/", "").toUpperCase();
  if (clean.length !== 6) {
    return "";
  }

  return `${clean.slice(0, 3)}/${clean.slice(3)}`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

serverlessSafeListen();

function serverlessSafeListen() {
  app.listen(PORT, () => {
    console.log(`Forex movers dashboard is listening on ${PORT}`);
  });
}
