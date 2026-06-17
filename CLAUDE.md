# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A vanilla Manifest V3 Chrome extension that enhances the Province of Antwerp PrimeTime web app at `https://provincieantwerpen.get.be/Primetime/webapp/*`. No build system, no package manager, no tests. The whole extension is `manifest.json` + `content.js` + `popup.html` + `popup.js` + `icons/`.

## Dev workflow

There is nothing to build. To pick up a code change:

1. `chrome://extensions/` → find **Prime Time Plus** → click the reload (↻) icon.
2. Reload the PrimeTime tab.

For browser-side verification, the live app is at `https://provincieantwerpen.get.be/Primetime/webapp/?locale=nl` (the user is logged in). Navigate, then poke the DOM with the Chrome MCP `javascript_tool` — `read_page`, `find`, and `screenshot` are how features get sanity-checked.

## Architecture

### Page model

The PrimeTime app is a **GWT single-page app**: the URL never changes when you switch tabs. Page detection is by DOM landmark presence, not URL:

- **Home** → `.balancesWidgetTitle` (Saldi widget) + `.roundedBookingWidget` (clock-in panel with `.digital-clock`).
- **Dagresultaten** → `table.dataTable` with `tr.journal-grid-row` rows. Find the journal table via `findJournalTable()`, never `querySelector('table.dataTable')` — the **Supervisor view** ("Dagelijks beheer" tab, manager-only) renders the *same* Dagresultaten table but with multiple `table.dataTable` siblings where the journal is not the first. `findJournalTable()` picks the one that actually contains `tr.journal-grid-row`. The employee view has only one, so it works on both.
- **Afwezigheidsplanning** → `.balancePanel` (Saldi sidebar).

Each enhancer in `content.js` checks for its landmark and silently no-ops on other pages. `refresh()` runs every enhancer; the right ones light up based on which page is current.

### Re-render handling

The GWT app rerenders aggressively. There is **one** `MutationObserver` on `document.body` (subtree, childList) debounced to 150 ms — every enhancer re-runs on every refresh. Because of this, **every enhancer must be idempotent**. Idempotency is enforced via the `data-pt-plus` attribute marker (values: `suffix`, `block-suffix`, `injected`, `row-tint`, `forgotten`, `tooltip`). Check the marker before mutating; `clearAllEnhancements()` walks these markers to undo everything when settings change.

Two `setInterval` timers (60 s) drive the live "Klaar om" predictor on Home and the live Dagtotaal badge on today's Dagresultaten row — both also re-run inside `refresh()` so they appear immediately after re-render rather than waiting for the next tick.

### Adding a new feature

1. Add a key with a sensible default to `DEFAULT_SETTINGS` in `content.js`.
2. Add an enhancer method to `PrimeTimePlus`, gated on `this.settings.<key>`. Reuse `parseTime`, `isHHMM`, `formatHHMM`, `formatDays`, `applySuffix` / `applyBlockSuffix`, `parseDatumCell`, `readMultiTimes`, `readSingleTimeCell`, `readRoosterMinutes`.
3. Call it from `refresh()`.
4. Mark every DOM mutation with the `TAG` (`data-pt-plus`) attribute and a marker value, and ensure `clearAllEnhancements()` reverses it.
5. Add a toggle in `popup.html` (`<input data-setting="<key>">`) — `popup.js` auto-wires any input with that attribute.
6. Mirror the new key into the `DEFAULT_SETTINGS` constant in `popup.js` so the toggle reads with a correct default.

### GWT selector strategy

Class names in this app have a rotating prefix (e.g. `GKKUY21BGQB-eu-primion-xtremis-client-home-Css-clickableLink`) that changes whenever the backend recompiles the GWT module. **Never match on the prefix.** Match on:

- The stable suffix via `[class*="..."]` (e.g. `[class*="eu-primion-xtremis-client-home-Css-clickableLink"]`).
- Stable structural classes (`balancePanel`, `balancesWidgetTitle`, `dataTable`, `journal-grid-row`, `journal-day-cell`, `in-cell`, `out-cell`, `digital-clock`, `home-widget-bookings`).

There is a known commit (`5f4457c`) that fixed broken selectors after a GWT recompile; staying on the suffix is the lesson.

### Domain constants

- **Working day = 8h 6m = 486 min** (`workingDayMinutes` in `DEFAULT_SETTINGS`). Used as the predictor target and the week/month totals divisor. Includes the 30-minute lunch break.
- **Leave day = 7h 36m = 456 min** (`leaveDayMinutes` in `DEFAULT_SETTINGS`). Used as the day-equivalent divisor for all balance/saldo displays (TJVu, TSALD, TSAL5) and tooltips. Excludes the break — this is how leave is officially counted.
- **Weekly target** = `5 × 486 = 2430 min` (40:30). Used by the aggregate panel's Δ column.

### Cell-parsing quirks worth knowing

- **In / Uit cells** can hold multiple times in the same cell (one row per booking, e.g. lunch break gives 2 ins and 2 outs). Always use `readMultiTimes` and never assume a single `HH:MM`.
- **Saldo cell** in Dagresultaten contains a nested 2-column table — left col is the label (`TSALD`, `TSAL5`, `TJVu`), right col is the time. Match `td:nth-child(2)` of the inner table.
- **Today detection** is done by parsing the Datum cell text (`vr 8 mei`) against `new Date()`, not via a CSS class — there is no "today" class on the row.
- **Year inference** in `parseDatumCell` adjusts ±1 year when the visible period crosses a January boundary.
- **Afwezigheidsplanning sidebar** lives inside an `overflow:hidden` wrapper that clips inline overflow. Use `applyBlockSuffix` (renders day equivalent on a new line) here, not the inline `applySuffix`.
- **Aanwezigheid cell** in Dagresultaten is `row.cells[8]` (In=3, Uit=5, Dagtotaal=7, with `+` spacer cells at the even indices in between). It holds a nested table; each inner `tr` is `[code, HH:MM, '']` where `code` is `THUIS` (home work) or a worksite code like `AK` (office). `readAanwezigheidCell` sums minutes split home vs office for the Thuiswerk-ratio (`thuiswerkRatio` setting).

### Supervisor view (manager-only)

Managers have an extra **Supervisor → Dagresultaten** view showing any employee's data. It reuses the identical Dagresultaten table structure (same column indices, same nested Aanwezigheid table), so all Dagresultaten enhancers work there unchanged — **except** that the page has multiple `table.dataTable` siblings, hence `findJournalTable()`. If a Dagresultaten feature renders on the employee view but not for a manager, suspect the table selector first: probe `document.querySelectorAll('table.dataTable').length` vs which one holds `tr.journal-grid-row`. Diagnosable from a manager's console without manager access yourself — the visible layout is identical, only the table count differs.

### Chrome MCP gotcha during dev

When inspecting the live app via `javascript_tool`, returning raw `innerHTML` strings can trip the MCP content filter and come back as `[BLOCKED: Cookie/query string data]`. Walk the DOM with `tagName` + `textContent` instead.
