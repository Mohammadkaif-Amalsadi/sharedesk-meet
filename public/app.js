const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
const limitSelect = document.querySelector("#limitSelect");
const refreshBtn = document.querySelector("#refreshBtn");
const autoRefreshInput = document.querySelector("#autoRefreshInput");
const gainersList = document.querySelector("#gainersList");
const losersList = document.querySelector("#losersList");
const quoteTable = document.querySelector("#quoteTable");
const sourceName = document.querySelector("#sourceName");
const sourceLink = document.querySelector("#sourceLink");
const lastUpdated = document.querySelector("#lastUpdated");
const strongestPair = document.querySelector("#strongestPair");
const strongestMove = document.querySelector("#strongestMove");
const weakestPair = document.querySelector("#weakestPair");
const weakestMove = document.querySelector("#weakestMove");
const pairCount = document.querySelector("#pairCount");
const refreshStatus = document.querySelector("#refreshStatus");
const tableHint = document.querySelector("#tableHint");

let quotes = [];
let refreshTimer = null;

const FLAG_CODES = {
  AUD: "au",
  CAD: "ca",
  CHF: "ch",
  DKK: "dk",
  EUR: "eu",
  GBP: "gb",
  HKD: "hk",
  JPY: "jp",
  MXN: "mx",
  NOK: "no",
  NZD: "nz",
  PLN: "pl",
  SEK: "se",
  SGD: "sg",
  TRY: "tr",
  USD: "us",
  ZAR: "za"
};

const SORT_LABELS = {
  changePercentDesc: "Sorted by change % high to low",
  changePercentAsc: "Sorted by change % low to high",
  changeDesc: "Sorted by raw change",
  priceDesc: "Sorted by price",
  pairAsc: "Sorted A to Z"
};

searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);
limitSelect.addEventListener("change", render);
refreshBtn.addEventListener("click", () => loadQuotes({ force: true }));
autoRefreshInput.addEventListener("change", configureAutoRefresh);

loadQuotes({ force: true });
configureAutoRefresh();

async function loadQuotes({ force = false } = {}) {
  refreshBtn.disabled = true;
  refreshStatus.textContent = force ? "Refreshing..." : "Updating...";

  try {
    const response = await fetch(`/api/forex${force ? `?t=${Date.now()}` : ""}`);
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const payload = await response.json();
    quotes = payload.quotes || [];
    sourceName.textContent = payload.source || "Market data";
    sourceLink.href = payload.sourceUrl || "https://finance.yahoo.com/markets/currencies/";
    lastUpdated.textContent = `Updated ${formatTime(payload.fetchedAt)}`;
    pairCount.textContent = String(payload.count || quotes.length);
    refreshStatus.textContent = `Refreshes every ${Math.round((payload.refreshMs || 15000) / 1000)}s`;
    render();
  } catch (error) {
    refreshStatus.textContent = "Could not load quotes";
    gainersList.innerHTML = errorCard(error.message);
    losersList.innerHTML = errorCard(error.message);
  } finally {
    refreshBtn.disabled = false;
  }
}

function configureAutoRefresh() {
  clearInterval(refreshTimer);

  if (autoRefreshInput.checked) {
    refreshTimer = setInterval(() => loadQuotes(), 15000);
  }
}

function render() {
  const filtered = filterQuotes(quotes);
  const sorted = sortQuotes(filtered);
  const limit = Number(limitSelect.value);
  const visible = sorted.slice(0, limit);
  const gainers = [...filtered]
    .filter((quote) => quote.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, Math.min(limit, 10));
  const losers = [...filtered]
    .filter((quote) => quote.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, Math.min(limit, 10));

  gainersList.innerHTML = gainers.length ? gainers.map(quoteCard).join("") : emptyCard("No gainers in this filter.");
  losersList.innerHTML = losers.length ? losers.map(quoteCard).join("") : emptyCard("No losers in this filter.");
  quoteTable.innerHTML = visible.map(tableRow).join("");
  tableHint.textContent = SORT_LABELS[sortSelect.value] || "Sorted";

  const strongest = gainers[0];
  const weakest = losers[0];
  strongestPair.textContent = strongest?.pair || "--";
  strongestMove.textContent = strongest ? formatPercent(strongest.changePercent) : "--";
  weakestPair.textContent = weakest?.pair || "--";
  weakestMove.textContent = weakest ? formatPercent(weakest.changePercent) : "--";
}

function filterQuotes(items) {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    return items;
  }

  return items.filter((quote) => {
    return [
      quote.symbol,
      quote.pair,
      quote.base,
      quote.quote,
      quote.name
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function sortQuotes(items) {
  const sorted = [...items];

  switch (sortSelect.value) {
    case "changePercentAsc":
      return sorted.sort((a, b) => a.changePercent - b.changePercent);
    case "changeDesc":
      return sorted.sort((a, b) => b.change - a.change);
    case "priceDesc":
      return sorted.sort((a, b) => b.price - a.price);
    case "pairAsc":
      return sorted.sort((a, b) => a.pair.localeCompare(b.pair));
    case "changePercentDesc":
    default:
      return sorted.sort((a, b) => b.changePercent - a.changePercent);
  }
}

function quoteCard(quote) {
  const tone = quote.changePercent >= 0 ? "gain" : "loss";

  return `
    <article class="quote-card ${tone}">
      <div class="pair-flags">${flagImg(quote.base)}${flagImg(quote.quote)}</div>
      <div>
        <strong>${quote.pair}</strong>
        <span>${quote.name}</span>
      </div>
      <div class="quote-price">
        <strong>${formatPrice(quote.price)}</strong>
        <span>${formatPercent(quote.changePercent)}</span>
      </div>
    </article>
  `;
}

function tableRow(quote) {
  const tone = quote.changePercent >= 0 ? "gain-text" : "loss-text";

  return `
    <tr>
      <td>
        <div class="table-pair">
          <span class="pair-flags">${flagImg(quote.base)}${flagImg(quote.quote)}</span>
          <strong>${quote.pair}</strong>
        </div>
      </td>
      <td>${formatPrice(quote.price)}</td>
      <td class="${tone}">${formatSigned(quote.change)}</td>
      <td class="${tone}">${formatPercent(quote.changePercent)}</td>
      <td>${formatPrice(quote.bid)}</td>
      <td>${formatPrice(quote.ask)}</td>
      <td>${formatPrice(quote.low)} - ${formatPrice(quote.high)}</td>
      <td>${quote.marketState || "UNKNOWN"}</td>
    </tr>
  `;
}

function flagImg(currency) {
  const code = FLAG_CODES[currency];
  if (!code) {
    return `<span class="flag-fallback">${currency?.[0] || "?"}</span>`;
  }

  return `<img src="https://flagcdn.com/w40/${code}.png" alt="${currency} flag" loading="lazy" />`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value >= 10 ? 2 : 4,
    maximumFractionDigits: value >= 10 ? 4 : 6
  }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatSigned(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${formatPrice(value)}`;
}

function formatTime(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function emptyCard(message) {
  return `<div class="empty-card">${message}</div>`;
}

function errorCard(message) {
  return `<div class="empty-card error">Market data unavailable. ${message}</div>`;
}
