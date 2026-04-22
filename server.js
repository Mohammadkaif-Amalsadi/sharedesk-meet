const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const QUOTE_CACHE_MS = Number(process.env.QUOTE_CACHE_MS || 15000);

const DEFAULT_SYMBOLS = [
  "EURUSD=X",
  "GBPUSD=X",
  "JPY=X",
  "AUDUSD=X",
  "NZDUSD=X",
  "CAD=X",
  "CHF=X",
  "EURGBP=X",
  "EURJPY=X",
  "GBPJPY=X",
  "AUDJPY=X",
  "EURAUD=X",
  "EURCAD=X",
  "EURCHF=X",
  "GBPAUD=X",
  "GBPCAD=X",
  "GBPCHF=X",
  "AUDCAD=X",
  "AUDNZD=X",
  "AUDCHF=X",
  "NZDJPY=X",
  "NZDCAD=X",
  "CADJPY=X",
  "CHFJPY=X",
  "USDMXN=X",
  "USDZAR=X",
  "USDTRY=X",
  "USDSGD=X",
  "USDHKD=X",
  "USDNOK=X",
  "USDSEK=X",
  "USDDKK=X",
  "USDPLN=X"
];

const SYMBOL_META = {
  "EURUSD=X": ["EUR", "USD", "EUR/USD"],
  "GBPUSD=X": ["GBP", "USD", "GBP/USD"],
  "JPY=X": ["USD", "JPY", "USD/JPY"],
  "AUDUSD=X": ["AUD", "USD", "AUD/USD"],
  "NZDUSD=X": ["NZD", "USD", "NZD/USD"],
  "CAD=X": ["USD", "CAD", "USD/CAD"],
  "CHF=X": ["USD", "CHF", "USD/CHF"],
  "EURGBP=X": ["EUR", "GBP", "EUR/GBP"],
  "EURJPY=X": ["EUR", "JPY", "EUR/JPY"],
  "GBPJPY=X": ["GBP", "JPY", "GBP/JPY"],
  "AUDJPY=X": ["AUD", "JPY", "AUD/JPY"],
  "EURAUD=X": ["EUR", "AUD", "EUR/AUD"],
  "EURCAD=X": ["EUR", "CAD", "EUR/CAD"],
  "EURCHF=X": ["EUR", "CHF", "EUR/CHF"],
  "GBPAUD=X": ["GBP", "AUD", "GBP/AUD"],
  "GBPCAD=X": ["GBP", "CAD", "GBP/CAD"],
  "GBPCHF=X": ["GBP", "CHF", "GBP/CHF"],
  "AUDCAD=X": ["AUD", "CAD", "AUD/CAD"],
  "AUDNZD=X": ["AUD", "NZD", "AUD/NZD"],
  "AUDCHF=X": ["AUD", "CHF", "AUD/CHF"],
  "NZDJPY=X": ["NZD", "JPY", "NZD/JPY"],
  "NZDCAD=X": ["NZD", "CAD", "NZD/CAD"],
  "CADJPY=X": ["CAD", "JPY", "CAD/JPY"],
  "CHFJPY=X": ["CHF", "JPY", "CHF/JPY"],
  "USDMXN=X": ["USD", "MXN", "USD/MXN"],
  "USDZAR=X": ["USD", "ZAR", "USD/ZAR"],
  "USDTRY=X": ["USD", "TRY", "USD/TRY"],
  "USDSGD=X": ["USD", "SGD", "USD/SGD"],
  "USDHKD=X": ["USD", "HKD", "USD/HKD"],
  "USDNOK=X": ["USD", "NOK", "USD/NOK"],
  "USDSEK=X": ["USD", "SEK", "USD/SEK"],
  "USDDKK=X": ["USD", "DKK", "USD/DKK"],
  "USDPLN=X": ["USD", "PLN", "USD/PLN"]
};

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
      .map((symbol) => symbol.trim().toUpperCase())
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

  const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("fields", [
    "symbol",
    "shortName",
    "regularMarketPrice",
    "regularMarketChange",
    "regularMarketChangePercent",
    "regularMarketPreviousClose",
    "regularMarketOpen",
    "regularMarketDayHigh",
    "regularMarketDayLow",
    "regularMarketTime",
    "marketState",
    "bid",
    "ask"
  ].join(","));

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 ShareDesk-Forex-Dashboard"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance responded with ${response.status}`);
  }

  const payload = await response.json();
  const quotes = (payload.quoteResponse?.result || [])
    .map(normalizeQuote)
    .filter((quote) => Number.isFinite(quote.price));

  const data = {
    source: "Yahoo Finance",
    sourceUrl: "https://finance.yahoo.com/markets/currencies/",
    fetchedAt: new Date().toISOString(),
    refreshMs: QUOTE_CACHE_MS,
    count: quotes.length,
    quotes
  };

  cache = {
    timestamp: now,
    data
  };

  return data;
}

function normalizeQuote(quote) {
  const [base, quoteCurrency, displayPair] = SYMBOL_META[quote.symbol] || inferPair(quote.symbol);

  return {
    symbol: quote.symbol,
    pair: displayPair,
    base,
    quote: quoteCurrency,
    name: quote.shortName || displayPair,
    price: numberOrNull(quote.regularMarketPrice),
    change: numberOrNull(quote.regularMarketChange),
    changePercent: numberOrNull(quote.regularMarketChangePercent),
    previousClose: numberOrNull(quote.regularMarketPreviousClose),
    open: numberOrNull(quote.regularMarketOpen),
    high: numberOrNull(quote.regularMarketDayHigh),
    low: numberOrNull(quote.regularMarketDayLow),
    bid: numberOrNull(quote.bid),
    ask: numberOrNull(quote.ask),
    marketState: quote.marketState || "UNKNOWN",
    marketTime: quote.regularMarketTime
      ? new Date(quote.regularMarketTime * 1000).toISOString()
      : null
  };
}

function inferPair(symbol) {
  const clean = symbol.replace("=X", "");
  if (clean.length === 6) {
    return [clean.slice(0, 3), clean.slice(3), `${clean.slice(0, 3)}/${clean.slice(3)}`];
  }

  return [clean, "", clean];
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
