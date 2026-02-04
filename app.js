// === Config ===
const BUS_STOP_IDS = ["8410", "8553", "21912"];
const FORT_TOTTEN_STATION_CODE = "B06"; // Fort Totten (WMATA station code)
const REFRESH_MS = 30_000;

// WMATA endpoints (JSON)
const WMATA = {
  busPredictions: (stopId) =>
    `https://api.wmata.com/NextBusService.svc/json/jPredictions?StopID=${encodeURIComponent(stopId)}`,
  railPredictions: (stationCode) =>
    `https://api.wmata.com/StationPrediction.svc/json/GetPrediction/${encodeURIComponent(stationCode)}`,
};

// If you hit CORS errors, set PROXY_BASE in README instructions and uncomment this:
// const PROXY_BASE = "https://YOUR-WORKER.example.workers.dev"; // no trailing slash
// const withProxy = (url) => `${PROXY_BASE}/?url=${encodeURIComponent(url)}`;
const withProxy = (url) => url;

// === Helpers ===
const $ = (sel, root = document) => root.querySelector(sel);

function nowStamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function setCardStatus(card, text) {
  const el = $("[data-status]", card);
  if (el) el.textContent = text;
}
function setCardUpdated(card) {
  const el = $("[data-updated]", card);
  if (el) el.textContent = `Updated ${nowStamp()}`;
}

function getApiKey() {
  return localStorage.getItem("wmata_api_key") || "";
}
function setApiKey(key) {
  localStorage.setItem("wmata_api_key", key);
}
function clearApiKey() {
  localStorage.removeItem("wmata_api_key");
}

async function wmataFetchJson(url, apiKey) {
  const res = await fetch(withProxy(url), {
    headers: {
      // WMATA expects api_key header in many examples; this works broadly.
      api_key: apiKey,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? ` — ${txt.slice(0, 180)}` : ""}`);
  }
  return res.json();
}

function renderList(card, rows) {
  const ul = $("[data-list]", card);
  ul.innerHTML = "";
  if (!rows.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span>No predictions</span><span class="tag">—</span>`;
    ul.appendChild(li);
    return;
  }

  for (const r of rows) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(r.primary)}</span><span class="tag">${escapeHtml(
      r.secondary
    )}</span>`;
    ul.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// === Data loaders ===
async function loadBus(stopId, apiKey) {
  const card = document.getElementById(`bus-${stopId}`);
  setCardStatus(card, "Loading…");

  const data = await wmataFetchJson(WMATA.busPredictions(stopId), apiKey);

  // WMATA NextBus predictions typically returns { StopName, Predictions: [...] }
  const preds = Array.isArray(data?.Predictions) ? data.Predictions : [];
  const rows = preds.slice(0, 6).map((p) => ({
    primary: `${p.RouteID || "Bus"} → ${p.DirectionText || ""}`.trim(),
    secondary: p.Minutes != null ? `${p.Minutes} min` : (p.Minutes === 0 ? "Due" : "—"),
  }));

  renderList(card, rows);
  setCardStatus(card, data?.StopName ? data.StopName : `Stop ${stopId}`);
  setCardUpdated(card);
}

async function loadRail(stationCode, apiKey) {
  const card = document.getElementById(`rail-${stationCode.toLowerCase()}`);
  setCardStatus(card, "Loading…");

  const data = await wmataFetchJson(WMATA.railPredictions(stationCode), apiKey);

  // WMATA rail predictions typically returns { Trains: [...] }
  const trains = Array.isArray(data?.Trains) ? data.Trains : [];
  const rows = trains.slice(0, 8).map((t) => ({
    primary: `${t.Line || "—"} → ${t.DestinationName || t.Destination || "—"}`,
    secondary: t.Min != null ? `${t.Min}` : "—", // often "BRD", "ARR", "1", "2", etc.
  }));

  renderList(card, rows);
  setCardStatus(card, "Fort Totten");
  setCardUpdated(card);
}

async function refreshAll() {
  const status = $("#globalStatus");
  const apiKey = getApiKey();

  if (!apiKey) {
    status.textContent = "Add your WMATA API key to load predictions.";
    // Clear cards to avoid stale data
    for (const id of BUS_STOP_IDS) {
      const card = document.getElementById(`bus-${id}`);
      setCardStatus(card, "No API key");
      renderList(card, []);
    }
    const railCard = document.getElementById(`rail-${FORT_TOTTEN_STATION_CODE.toLowerCase()}`);
    setCardStatus(railCard, "No API key");
    renderList(railCard, []);
    return;
  }

  status.textContent = "Refreshing…";
  try {
    await Promise.all([
      ...BUS_STOP_IDS.map((id) => loadBus(id, apiKey)),
      loadRail(FORT_TOTTEN_STATION_CODE, apiKey),
    ]);
    status.textContent = `Last refresh: ${nowStamp()}`;
  } catch (err) {
    console.error(err);
    status.textContent =
      `Error: ${err?.message || err}` +
      " (If this is a CORS error, use the optional proxy in README.)";
  }
}

// === UI wiring ===
function initKeyUI() {
  const input = $("#apiKey");
  const status = $("#keyStatus");

  const existing = getApiKey();
  if (existing) {
    input.value = existing;
    status.textContent = "API key loaded from localStorage.";
  } else {
    status.textContent = "No key saved yet.";
  }

  $("#saveKey").addEventListener("click", () => {
    const k = input.value.trim();
    if (!k) {
      status.textContent = "Paste a key first.";
      return;
    }
    setApiKey(k);
    status.textContent = "Saved.";
    refreshAll();
  });

  $("#clearKey").addEventListener("click", () => {
    clearApiKey();
    input.value = "";
    status.textContent = "Cleared.";
    refreshAll();
  });
}

let timer = null;
function initRefreshUI() {
  $("#refreshNow").addEventListener("click", refreshAll);

  const auto = $("#autoRefresh");
  const setTimer = () => {
    if (timer) clearInterval(timer);
    if (auto.checked) timer = setInterval(refreshAll, REFRESH_MS);
  };
  auto.addEventListener("change", setTimer);
  setTimer();
}

document.addEventListener("DOMContentLoaded", () => {
  initKeyUI();
  initRefreshUI();
  refreshAll();
});
