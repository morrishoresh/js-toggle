const ICON_SIZES = [16, 32, 48];
const COLOR_ON = "#2e7d32";
const COLOR_OFF = "#c62828";

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

// --- Icon generation (canvas, drawn once per colour at startup) ---
function drawIcon(size, color) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.floor(size * 0.62)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("J", size / 2, size / 2 + size * 0.03);
  return ctx.getImageData(0, 0, size, size);
}

function buildIconSet(color) {
  const set = {};
  for (const s of ICON_SIZES) set[s] = drawIcon(s, color);
  return set;
}

const ICONS = {
  on: buildIconSet(COLOR_ON),
  off: buildIconSet(COLOR_OFF)
};

// --- Config list, cached in memory so navigation checks are synchronous ---
let cachedDisabledSites = [];

async function loadCache() {
  const { disabledSites = [] } = await browser.storage.local.get("disabledSites");
  cachedDisabledSites = disabledSites;
}
loadCache();

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.disabledSites) {
    cachedDisabledSites = changes.disabledSites.newValue || [];
  }
});

function matchesConfigList(hostname) {
  if (!hostname) return false;
  return cachedDisabledSites.some(
    (entry) => hostname === entry || hostname.endsWith("." + entry)
  );
}

// --- Per-tab JS state ---
// tabDisabled: true = JS blocked for this tab's current/pending page.
// manualOverride: tabIds whose *next* navigation was triggered by the
// button click — onBeforeNavigate must not overwrite tabDisabled for it
// with the config-derived value; the state was already set explicitly.
const tabDisabled = new Map();
const manualOverride = new Set();

browser.tabs.onRemoved.addListener((tabId) => {
  tabDisabled.delete(tabId);
  manualOverride.delete(tabId);
});

// Decide the state for each new top-level navigation, before headers arrive.
browser.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    if (manualOverride.has(details.tabId)) return; // state already set by the button click
    const hostname = hostnameFromUrl(details.url);
    tabDisabled.set(details.tabId, matchesConfigList(hostname));
  },
  { url: [{ schemes: ["http", "https"] }] }
);

// Enforce the decision by injecting a blocking CSP header, scoped to the
// tab that made the request. main_frame and sub_frame are both covered so
// same-tab iframes are blocked too; iframes served from a different tab's
// request are unaffected, matching per-tab scoping.
browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!tabDisabled.get(details.tabId)) return {};
    const headers = details.responseHeaders || [];
    headers.push({
      name: "Content-Security-Policy",
      value: "script-src 'none'; script-src-elem 'none'; script-src-attr 'none'"
    });
    return { responseHeaders: headers };
  },
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame", "sub_frame"] },
  ["blocking", "responseHeaders"]
);

// --- Toolbar button ---
function paintButton(tabId, enabled) {
  browser.browserAction.setIcon({ tabId, imageData: enabled ? ICONS.on : ICONS.off });
  browser.browserAction.setTitle({
    tabId,
    title: `JavaScript is ${enabled ? "enabled" : "disabled"} on this tab — click to toggle`
  });
}

async function paintForTab(tabId) {
  let tab;
  try {
    tab = await browser.tabs.get(tabId);
  } catch (e) {
    return; // tab gone
  }
  if (!isHttpUrl(tab.url)) {
    browser.browserAction.setIcon({ tabId, imageData: ICONS.on });
    browser.browserAction.setTitle({ tabId, title: "JS Toggle (not applicable on this page)" });
    return;
  }
  const disabled = tabDisabled.get(tabId) || false;
  paintButton(tabId, !disabled);
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    manualOverride.delete(tabId); // this navigation has now finished; future ones re-derive from config
    if (isHttpUrl(tab.url)) {
      paintButton(tabId, !tabDisabled.get(tabId));
    } else {
      browser.browserAction.setIcon({ tabId, imageData: ICONS.on });
      browser.browserAction.setTitle({ tabId, title: "JS Toggle (not applicable on this page)" });
    }
  }
});

browser.tabs.onActivated.addListener(({ tabId }) => {
  paintForTab(tabId);
});

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  const tabs = await browser.tabs.query({ active: true, windowId });
  if (tabs[0]) paintForTab(tabs[0].id);
});

browser.tabs.query({}).then((tabs) => {
  for (const t of tabs) {
    if (t.active) paintForTab(t.id);
  }
});

// --- Click handler: flips JS for this tab and reloads it ---
browser.browserAction.onClicked.addListener(async (tab) => {
  if (!isHttpUrl(tab.url)) return;
  const currentlyDisabled = tabDisabled.get(tab.id) || false;
  manualOverride.add(tab.id);
  tabDisabled.set(tab.id, !currentlyDisabled);
  await browser.tabs.reload(tab.id, { bypassCache: true });
});
