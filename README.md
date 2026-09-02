# JS Toggle

Firefox toolbar extension. Toggles JavaScript for the current site and shows
its status via icon colour (green = enabled, red = disabled).

## Install (temporary, for testing)
1. `about:debugging#/runtime/this-firefox`
2. "Load Temporary Add-on"
3. Select `manifest.json`

Temporary add-ons are removed when Firefox closes. For a permanent install
the .xpi needs to be signed via addons.mozilla.org (self-distribution or
listing), or Firefox needs to run with signature checks disabled
(Developer/Nightly builds, `xpinstall.signatures.required` = false).

## Configuration
Toolbar icon → right-click → "Manage Extension" → Preferences, or
`about:addons` → JS Toggle → Preferences. Enter one hostname per line.

## How it actually blocks JavaScript
Firefox has no `contentSettings.javascript` API — that's Chrome-only
(Mozilla bug 1367161, open since 2017, explicitly not planned). So this
doesn't toggle a browser JS setting; it injects a
`Content-Security-Policy: script-src 'none'` response header via
`webRequest.onHeadersReceived`, scoped by `tabId`.

Because the decision is keyed on `tabId` rather than origin, this genuinely
is per-tab: two tabs open on the same site can independently have JS on and
off. Toggling one doesn't affect the other, and doesn't affect any other
tab you later open on that site.

## Behaviour
- On navigation, if the hostname matches the configured list, that tab's
  next load gets the blocking CSP header.
- Clicking the button flips the stored state for that tab and reloads it.
  The configuration list itself is not touched. The next time that tab
  navigates elsewhere, the state is re-derived from the config list again.

## Known limitations
- CSP `script-src 'none'` stops `<script>` execution, inline event handler
  attributes, and `javascript:` URLs — the same class of things NoScript
  blocks — but it isn't identical to the platform's `javascript.enabled`
  pref, which doesn't exist per-site anyway. Edge cases outside that
  surface may not be caught.
- Tabs open before the extension loads have no recorded state until they
  next navigate; the button defaults to showing "enabled" for them.
