# Prime Time Plus Chrome Extension

A Chrome extension that enhances the Province of Antwerp Prime Time web application with additional functionality. Loads at `https://provincieantwerpen.get.be/Primetime/webapp/*`.

## Features

All toggleable from the extension popup. Feature toggles default to on; half-time weekdays default to off.

- **Day-equivalent suffix** — appends `(Xd)` after `HH:MM` time labels on:
  - Home page Saldi widget (e.g. `-11:10 (-1.47d)`)
  - Dagresultaten Saldo column (per-row running balances)
  - Afwezigheidsplanning sidebar (TJVu, WVu, BWVu, CFu, VVJu, TSAL5)
  - Hover tooltips containing `HH:MM`
- **Klaar-om voorspeller** — on Home, predicts the clock-out time that hits the 8:06 working-day target based on your `In` time, updates every minute
- **Live Dagtotaal** — on Dagresultaten today's row, runs the day total in real time while still clocked in
- **Week- en maandtotalen** — aggregates the visible Dagresultaten period into per-ISO-week and per-month totals with target-delta
- **Kleurcodering** — tints Dagresultaten rows green / red based on Dagtotaal vs Rooster (skips WE+FE / VRIJ)
- **Vergeten Uit-boeking** — orange outline + ⚠ on past days where you have an `In` without a matching `Uit`

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this directory
4. Open the Prime Time web app at `https://provincieantwerpen.get.be/Primetime/webapp/?locale=nl`
5. Click the extension icon to toggle individual features

## Sharing

Run the packaging script from PowerShell:

```powershell
.\package.ps1
```

It creates `dist/primetime-plus.zip` with only the manifest, extension scripts, popup, and required icons. Repository metadata, documentation, local configuration, and the packaging script are excluded. Rerunning overwrites the existing ZIP.

Use `-OutputDirectory C:\path\to\output` to choose a different destination. The script works from any current directory and supports Windows PowerShell 5.1 or newer.

Recipients should extract the ZIP and use Chrome's **Load unpacked** option to select the extracted folder containing `manifest.json`.

## Configuration

- **Working day**: 8 hours and 6 minutes (486 minutes), including lunch, used for the predictor target
- **Leave day**: 7 hours and 36 minutes (456 minutes), excluding lunch, used for balance day-equivalents
- **Half-time weekdays**: halve the working-day and leave-day values on selected weekdays; undated balances use the weekday average
- **Persistence**: feature toggles are stored in `chrome.storage.local`

## Architecture

- `content.js` — `PrimeTimePlus` class with one enhancer per page area, a single `MutationObserver` for re-rendering, and two interval timers (predictor + live dagtotaal). Page detection is by DOM landmark (`.balancesWidgetTitle`, `table.dataTable`, `.balancePanel`) because the GWT app's URL never changes.
- `popup.html` / `popup.js` — feature toggles synced via `chrome.storage.local`.
- `manifest.json` — `activeTab` + `storage`, single host permission.

### Selector strategy

The GWT prefix (`GKKUY21BGQB-`) on app classes changes whenever the backend recompiles the GWT module. Selectors deliberately match on the suffix (`eu-primion-xtremis-client-home-Css-clickableLink`) and on stable structural classes (`balancePanel`, `balancesWidgetTitle`, `dataTable`, `journal-grid-row`, `in-cell`, `out-cell`, `journal-day-cell`).

### Adding new features

Add a new method to `PrimeTimePlus`, call it from `refresh()`, gate it on a setting in `DEFAULT_SETTINGS`, expose the toggle in `popup.html`. Re-use `parseTime`, `formatHHMM`, `formatDays`, `applySuffix`, `parseDatumCell`, `readMultiTimes`, `readSingleTimeCell`, `readRoosterMinutes`.

## Development

Manifest V3, `run_at: document_end`, no background worker. The `MutationObserver` is debounced to a 150 ms tail to absorb GWT batch re-renders.
