# Prime Time Plus — Improvement Roadmap

Improvements to make the extension **look better** and run **more optimally**,
grounded in the current code. Ordered by payoff. Each item says *what* and
*where*. A few things are deliberately flagged as **skip** — not worth building.

The single biggest lever is **#1 (consolidate styles)**: it unlocks consistent
look, dark mode, and less duplicated inline CSS in one move.

---

## Visual polish ("look better")

### 1. One injected stylesheet instead of scattered inline styles  ★ high payoff
Right now every injected widget carries its own `style.cssText` /
`innerHTML style="…"` with hardcoded colors:
- predictor — `content.js:251`
- live dagtotaal badge — `content.js:491`
- block suffix — `content.js:201`
- aggregates table — `content.js:534` + per-`<td>` inline styles `content.js:559-596`
- thuiswerk pills — `content.js:621-628`

**Change:** inject one `<style id="pt-plus-styles">` once (next to the existing
`#pt-dag-height-fix` block at `content.js:387`) defining `.pt-*` classes with a
small set of CSS custom properties (`--pt-accent`, `--pt-good`, `--pt-bad`,
`--pt-muted`, radius, font-size). Replace the inline blobs with class names.
One palette, zero per-element color literals, far less string-built CSS.

### 2. Unify the visual language of injected widgets
The predictor (blue), aggregates (grey card), and thuiswerk pills (green/red)
each look like a different author. After #1, give them one shared card style
(same border, radius, header treatment, "PrimeTime+" marker) so they read as
one feature stacked above the table.

### 3. Popup: styled toggle switches instead of bare checkboxes
`popup.html:79-84` uses raw 16×16 checkboxes. A pure-CSS toggle (no library)
on the existing `input[data-setting]` markup modernizes the panel without
touching `popup.js` wiring.

### 4. Popup: group toggles by page
Every feature is page-specific (Home / Dagresultaten / Afwezigheidsplanning),
but `popup.html:102-158` lists them flat. Add `<h3>` section headers per page
so users see which toggle affects what. Pure HTML/CSS, no JS change.

### 5. Popup dark mode via `prefers-color-scheme`
`popup.html` hardcodes a light palette (`#2c3e50`, `#fafafa`, …). Wrap the
colors in CSS variables and add one `@media (prefers-color-scheme: dark)`
override. **Scope note:** do this for the *popup only* — the PrimeTime GWT app
is light-themed, so injected content should match the app, not the OS.

### 6. Predictor: add a thin progress bar
`refreshPredictor` (`content.js:266`) already computes worked vs. target. A
1-line CSS bar (`worked / workingDayMinutes`) under the "Tot HH:MM" text gives
an at-a-glance sense of progress. Cheap once #1 exists.

---

## Code & performance ("more optimal")

### 7. Stop scanning every `[title]` in the document on each refresh  ★ perf
`enhanceTooltips` (`content.js:824-843`) runs `querySelectorAll('[title]')`
across the **whole document** on every refresh — and refresh fires 150 ms after
*any* mutation. On a re-rendering GWT app this is the hottest path.
**Change:** scope it to the regions that actually hold balances
(`.balancePanel`, the Saldi widget, the journal table) instead of `document`.

### 8. Update aggregate/thuiswerk panels in place instead of remove-and-rebuild
`renderDagAggregates` (`content.js:529`) and `renderThuiswerkPanel`
(`content.js:607`) start by `.remove()`-ing the whole panel and rebuilding the
DOM every refresh. That causes visible flicker and wasted layout. **Change:**
build once; on later refreshes only rewrite the inner values if they changed.
Improves both look (no flicker) and cost.

### 9. Don't run the 60 s timers when their widgets aren't present
`startTimers` (`content.js:81`) keeps `liveTimer` + `predictorTimer` ticking
forever regardless of page. Minor, but the ticks could early-return faster (the
predictor tick re-queries the DOM). Low priority — only worth it if #7/#8 don't
already quiet things down. *(Borderline YAGNI; group with #8.)*

### 10. `findJournalTable` is called repeatedly per refresh
`enhanceDagresultaten` and `updateLiveDagtotaal` each re-scan all
`table.dataTable`. Fine today, but if more Dagresultaten features land, cache
the resolved table for the duration of one `refresh()` pass.

---

## Maintainability & correctness

### 11. Footer label is wrong  ★ quick correctness fix
`popup.html:160` says **"Werkdag = 7u 36m"**, but per the domain constants a
working day = **8u 06** (486 min); 7u 36 is the *leave* day. Fix the label to
"Verlofdag = 7u 36m" (or show both: "Werkdag 8u06 · Verlofdag 7u36").

### 12. Single source of truth for settings defaults
`DEFAULT_SETTINGS` is duplicated in `content.js:18` and `popup.js:1`, and the
toggle list is hand-mirrored in `popup.html` — CLAUDE.md even documents the
manual mirroring as a step. **Change:** move defaults to a tiny shared
`settings.js` loaded by both the content script (manifest `js` array) and the
popup (`<script>` before `popup.js`). Kills the three-place sync.

### 13. Read the version from the manifest
`"1.1.0"` is hardcoded in `manifest.json:4` *and* `popup.html:97`. Set the
popup version via `chrome.runtime.getManifest().version` in `popup.js` so it's
defined once.

### 14. Name the magic numbers
`720px` journal height (`content.js:391`), the `30`-min lunch baseline
(`content.js:283`), and the `50%` telework ceiling (`content.js:613`) are
inline literals. Pull them into named constants near `DEFAULT_SETTINGS` so the
intent is searchable.

### 15. `activeTab` permission — confirm it's needed
`manifest.json:7` requests `activeTab`. The content script auto-injects via
`matches`, and the popup only reads the active tab's URL. Verify whether
`activeTab` is actually required; drop it if not (smaller permission prompt =
better install trust).

### 16. Make the popup status a real `<button>` for a11y
`popup.js:29` attaches a click handler to a `<div class="status warn">`.
Keyboard users can't trigger it. Use a `<button>` (or add `role`/`tabindex`)
for the "Open Prime Time" action.

---

## Skip / YAGNI (deliberately not doing)

- **Build system / bundler / TypeScript.** It's three files with no deps. A
  build step would be pure overhead. Keep vanilla.
- **Options page separate from the popup.** The popup already fits every
  toggle. No second settings surface needed.
- **Making `workingDayMinutes` / `leaveDayMinutes` user-configurable.** They're
  policy constants, not preferences. Leave them as constants (see #14), don't
  add UI.
- **Generalized theming engine / design-token package.** #1's handful of CSS
  variables is the whole need. Don't grow it into a system.
- **A test harness.** Nothing here is unit-testable in isolation; verification
  is "reload the extension + look at the live app," which CLAUDE.md already
  documents. Adding a test runner buys nothing.

---

### Suggested order
1 → 11 → 7 → 8 → 12  (style base, the correctness fix, the two perf wins, then
the dedup). Everything else is polish on top.
