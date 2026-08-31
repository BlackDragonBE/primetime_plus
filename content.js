/* Prime Time Plus - GWT app enhancer
 *
 * Adds working-day equivalents, aggregate totals, a leave-time predictor,
 * live day total, color coding and forgotten clock-out warnings to the
 * Province of Antwerp PrimeTime web app.
 *
 * The app is a single-page GWT client. Page detection is by DOM landmark
 * because the URL never changes.
 */

const TAG = 'data-pt-plus';

const DUTCH_MONTHS = {
  jan: 0, feb: 1, mrt: 2, apr: 3, mei: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
};

// Date#getDay() (0=Sun..6=Sat) -> the halfTime* setting key for that weekday.
const WEEKDAY_HALFTIME_KEYS = {
  1: 'halfTimeMon', 2: 'halfTimeTue', 3: 'halfTimeWed', 4: 'halfTimeThu', 5: 'halfTimeFri',
};


class PrimeTimePlus {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.refreshScheduled = false;
    this.liveTimer = null;
    this.predictorTimer = null;
    this.lastRefreshAt = 0;
    this._journalTable = undefined;
    this._jvuCache = { key: null, minutes: 0 };
    this._jvuFetching = false;

    this.loadSettings().then(() => this.start());
  }

  async loadSettings() {
    if (!chrome?.storage?.local) return;
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
        if (chrome.runtime.lastError) {
          resolve();
          return;
        }
        this.settings = { ...DEFAULT_SETTINGS, ...items };
        resolve();
      });
    });
  }

  start() {
    this.injectStyles();
    this.refresh();
    this.observe();
    this.startTimers();
    this.listenForSettingChanges();
  }

  injectStyles() {
    if (document.getElementById('pt-plus-styles')) return;
    const style = document.createElement('style');
    style.id = 'pt-plus-styles';
    style.setAttribute(TAG, 'injected');
    style.textContent = `
      :root {
        --pt-good: #27ae60; --pt-good-bg: #eafaf1;
        --pt-bad: #e74c3c;  --pt-bad-bg: #fdecea;
        --pt-info: #1f6feb; --pt-info-bg: #ecf6ff; --pt-info-border: #b8d8f0;
        --pt-done-bg: #e3f7e3; --pt-done-border: #9bd49b;
        --pt-muted: #7f8c8d; --pt-text: #2c3e50;
        --pt-card-bg: #fafafa; --pt-card-border: #ddd; --pt-radius: 4px;
      }
      .gwt-ScrollTable.journal { height: ${JOURNAL_HEIGHT_PX}px !important; }
      /* shared card base */
      .pt-aggregates, .pt-thuiswerk {
        margin: 8px 0; padding: 8px 12px; border-radius: var(--pt-radius);
        background: var(--pt-card-bg); border: 1px solid var(--pt-card-border);
        font-size: 12px; color: var(--pt-text);
      }
      /* shared panel header */
      .pt-agg-header, .pt-thuiswerk-header {
        font-weight: bold; margin-bottom: 6px;
        font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--pt-muted);
      }
      .pt-aggregates table { border-collapse: collapse; width: 100%; }
      .pt-aggregates thead tr { border-bottom: 1px solid #ccc; }
      .pt-aggregates th, .pt-aggregates td { padding: 2px 8px; }
      .pt-aggregates th:first-child, .pt-aggregates td:first-child { text-align: left; }
      .pt-aggregates th:not(:first-child), .pt-aggregates td:not(:first-child) { text-align: right; }
      .pt-delta-pos { color: #1a7f37; } .pt-delta-neg { color: #cf222e; } .pt-delta-cur { color: #888; }
      .pt-thuiswerk-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
      .pt-pill {
        flex: 1 1 160px; display: flex; flex-direction: column;
        align-items: flex-start; gap: 2px; padding: 8px 12px; border-radius: 6px;
      }
      .pt-pill-ok  { background: var(--pt-good-bg); border: 1px solid var(--pt-good); border-left: 4px solid var(--pt-good); }
      .pt-pill-high{ background: var(--pt-bad-bg);  border: 1px solid var(--pt-bad);  border-left: 4px solid var(--pt-bad);  }
      .pt-pill-pct { font-size: 16px; font-weight: bold; }
      .pt-pill-ok   .pt-pill-pct { color: #1e8449; }
      .pt-pill-high .pt-pill-pct { color: #c0392b; }
      .pt-pill-office { font-size: 12px; font-weight: 600; }
      .pt-pill-ok   .pt-pill-office { color: #1e8449; }
      .pt-pill-high .pt-pill-office { color: #c0392b; }
      .pt-pill-detail { font-size: 11px; color: #5a6b7b; }
      /* predictor */
      .pt-predictor {
        margin-top: 8px; padding: 6px 8px; border-radius: var(--pt-radius);
        background: var(--pt-info-bg); border: 1px solid var(--pt-info-border);
        font-size: 12px; color: var(--pt-text); text-align: center;
      }
      .pt-predictor.pt-done { background: var(--pt-done-bg); border-color: var(--pt-done-border); }
      .pt-predictor-bar {
        height: 3px; background: rgba(0,0,0,0.08); border-radius: 2px;
        margin-top: 5px; overflow: hidden;
      }
      .pt-predictor-fill {
        height: 100%; background: var(--pt-info); border-radius: 2px;
        transition: width 0.5s ease; width: 0%;
      }
      .pt-predictor.pt-done .pt-predictor-fill { background: var(--pt-good); }
      .pt-live-dagtotaal { margin-top: 2px; font-size: 11px; color: var(--pt-info); font-style: italic; }
      .pt-day-equiv { display: block; font-size: 0.85em; color: var(--pt-muted); font-style: italic; }
      .pt-forgotten-marker { color: #f39c12; font-weight: bold; }
    `;
    document.head.appendChild(style);
  }

  listenForSettingChanges() {
    if (!chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      let touched = false;
      for (const key of Object.keys(changes)) {
        if (key in this.settings) {
          this.settings[key] = changes[key].newValue;
          touched = true;
        }
      }
      if (touched) {
        this.clearAllEnhancements();
        this.refresh();
      }
    });
  }

  startTimers() {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.liveTimer = setInterval(() => this.tickLive(), 60_000);

    if (this.predictorTimer) clearInterval(this.predictorTimer);
    this.predictorTimer = setInterval(() => this.tickPredictor(), 60_000);
  }

  observe() {
    const observer = new MutationObserver(() => {
      if (this.refreshScheduled) return;
      this.refreshScheduled = true;
      setTimeout(() => {
        this.refreshScheduled = false;
        this.refresh();
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  refresh() {
    this._journalTable = undefined;
    this.lastRefreshAt = Date.now();
    this.injectStyles(); // clearAllEnhancements() removes the tagged <style>; re-add it
    try {
      this.enhanceHomeSaldi();
      this.enhanceHomePredictor();
      this.enhanceDagresultaten();
      this.enhanceAfwezigheidsplanning();
      this.enhanceTooltips();
    } catch (e) {
      console.warn('[PrimeTime+] enhance error', e);
    }
  }

  tickLive() {
    if (!this.settings.liveDagtotaal) return;
    if (!document.querySelector('tr.journal-grid-row')) return;
    this.updateLiveDagtotaal();
  }

  tickPredictor() {
    if (!this.settings.predictor) return;
    if (!document.querySelector('.pt-predictor')) return;
    this.refreshPredictor();
  }

  clearAllEnhancements() {
    document.querySelectorAll('[' + TAG + '="suffix"]').forEach((el) => {
      const original = el.getAttribute('data-pt-original');
      if (original !== null) el.textContent = original;
      el.removeAttribute(TAG);
      el.removeAttribute('data-pt-original');
    });
    document.querySelectorAll('[' + TAG + '="block-suffix"]').forEach((el) => {
      const child = el.querySelector('.pt-day-equiv');
      if (child) child.remove();
      el.removeAttribute(TAG);
    });
    document.querySelectorAll('[' + TAG + '="injected"]').forEach((el) => el.remove());
    document.querySelectorAll('[' + TAG + '="row-tint"]').forEach((el) => {
      el.style.backgroundColor = '';
      el.removeAttribute(TAG);
    });
    document.querySelectorAll('[' + TAG + '="forgotten"]').forEach((el) => {
      el.style.outline = '';
      el.removeAttribute(TAG);
      const marker = el.querySelector('.pt-forgotten-marker');
      if (marker) marker.remove();
    });
    document.querySelectorAll('[' + TAG + '="tooltip"]').forEach((el) => {
      const orig = el.getAttribute('data-pt-original-title');
      if (orig !== null) el.setAttribute('title', orig);
      el.removeAttribute('data-pt-original-title');
      el.removeAttribute(TAG);
    });
  }

  /* ===========================================================
   * Time utilities
   * =========================================================== */

  isHHMM(text) {
    return /^-?\d+:\d{2}$/.test(text);
  }

  parseTime(text) {
    if (!this.isHHMM(text)) return null;
    const negative = text.startsWith('-');
    const [hh, mm] = text.replace(/^-/, '').split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    const minutes = hh * 60 + mm;
    return negative ? -minutes : minutes;
  }

  formatHHMM(totalMinutes) {
    const negative = totalMinutes < 0;
    const abs = Math.abs(Math.round(totalMinutes));
    const hh = Math.floor(abs / 60);
    const mm = abs % 60;
    return (negative ? '-' : '') + hh + ':' + String(mm).padStart(2, '0');
  }

  formatDays(totalMinutes, minutesPerDay) {
    const divisor = minutesPerDay !== undefined ? minutesPerDay : this.settings.workingDayMinutes * this.averageWeekFactor();
    const days = totalMinutes / divisor;
    const rounded = Math.round(days * 100) / 100;
    return rounded + 'd';
  }

  /* Half time can apply to specific weekdays only, so a given date's
   * werkdag/verlofdag length depends on which weekday it falls on. */
  dayFactor(date) {
    const key = WEEKDAY_HALFTIME_KEYS[date.getDay()];
    return key && this.settings[key] ? 0.5 : 1;
  }

  workingMinutesFor(date) {
    return this.settings.workingDayMinutes * this.dayFactor(date);
  }

  leaveMinutesFor(date) {
    return this.settings.leaveDayMinutes * this.dayFactor(date);
  }

  /* Balances (Saldi, Afwezigheidsplanning) aren't tied to one calendar date,
   * so their day-equivalent uses the average factor across mon-fri. */
  averageWeekFactor() {
    const keys = Object.values(WEEKDAY_HALFTIME_KEYS);
    return keys.reduce((sum, k) => sum + (this.settings[k] ? 0.5 : 1), 0) / keys.length;
  }

  /* ===========================================================
   * Generic suffix enhancer
   * =========================================================== */

  applySuffix(element, originalText, totalMinutes, minutesPerDay) {
    if (!this.settings.daysSuffix) return;
    if (element.getAttribute(TAG) === 'suffix') return;
    const suffix = ' (' + this.formatDays(totalMinutes, minutesPerDay) + ')';
    element.setAttribute(TAG, 'suffix');
    element.setAttribute('data-pt-original', originalText);
    element.textContent = originalText + suffix;
  }

  applyBlockSuffix(element, totalMinutes, minutesPerDay) {
    if (!this.settings.daysSuffix) return;
    if (element.getAttribute(TAG) === 'block-suffix') return;
    if (element.querySelector('.pt-day-equiv')) return;
    const span = document.createElement('span');
    span.className = 'pt-day-equiv';
    span.setAttribute(TAG, 'injected');
    span.textContent = this.formatDays(totalMinutes, minutesPerDay);
    element.setAttribute(TAG, 'block-suffix');
    element.appendChild(span);
  }

  /* ===========================================================
   * Home page - existing Saldi widget
   * =========================================================== */

  enhanceHomeSaldi() {
    const widget = document.querySelector('.balancesWidgetTitle');
    if (!widget) return;
    const panel = widget.closest('.panel') || widget.parentElement;
    if (!panel) return;

    const labels = panel.querySelectorAll(
      '.gwt-HTML.primion-label.gwt-Label[class*="eu-primion-xtremis-client-home-Css-clickableLink"]'
    );

    labels.forEach((el) => {
      if (el.getAttribute(TAG) === 'suffix') return;
      const text = el.textContent.trim();
      if (!this.isHHMM(text)) return;
      const minutes = this.parseTime(text);
      if (minutes === null) return;
      this.applySuffix(el, text, minutes, this.settings.leaveDayMinutes * this.averageWeekFactor());
    });
  }

  /* ===========================================================
   * Home page - "Klaar om" leave-time predictor
   * =========================================================== */

  enhanceHomePredictor() {
    if (!this.settings.predictor) return;
    const clock = document.querySelector('.digital-clock');
    if (!clock) return;
    const panel = clock.closest('.panel-content');
    if (!panel) return;

    if (panel.querySelector('.pt-predictor')) {
      this.refreshPredictor();
      return;
    }

    const widget = document.createElement('div');
    widget.className = 'pt-predictor';
    widget.setAttribute(TAG, 'injected');
    widget.innerHTML =
      '<span class="pt-predictor-text">Klaar om …</span>' +
      '<div class="pt-predictor-bar"><div class="pt-predictor-fill"></div></div>';
    panel.appendChild(widget);
    this.refreshPredictor();
  }

  refreshPredictor() {
    const widget = document.querySelector('.pt-predictor');
    if (!widget) return;
    const textEl = widget.querySelector('.pt-predictor-text') || widget;
    const fillEl = widget.querySelector('.pt-predictor-fill');
    const setFill = (pct) => {
      if (fillEl) fillEl.style.width = Math.min(100, Math.max(0, pct)) + '%';
    };

    const inOutTimes = this.readHomeBookings();
    if (!inOutTimes) {
      textEl.textContent = 'Geen In-tijd gevonden';
      setFill(0);
      return;
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const sortedIns = [...inOutTimes.ins].sort((a, b) => a - b);
    const sortedOuts = [...inOutTimes.outs].sort((a, b) => a - b);
    const firstIn = sortedIns[0];
    const breakMinutes = this.computeBreakMinutes(sortedIns, sortedOuts, nowMinutes);
    const extraBreak = Math.max(0, breakMinutes - LUNCH_BREAK_MIN);
    const targetMinutes = Math.max(0, this.workingMinutesFor(now) - this.ensureTodayJvuMinutes(now));
    const finishMinutes = firstIn + targetMinutes + extraBreak;
    const stillNeeded = finishMinutes - nowMinutes;
    const worked = this.computeWorkedMinutes(inOutTimes.ins, inOutTimes.outs, nowMinutes);
    const pct = worked / targetMinutes * 100;

    if (stillNeeded <= 0) {
      const overshoot = -stillNeeded;
      textEl.textContent = 'Doel bereikt (+' + this.formatHHMM(overshoot) + ')';
      widget.classList.add('pt-done');
      setFill(100);
      return;
    }

    const fh = Math.floor(finishMinutes / 60) % 24;
    const fm = finishMinutes % 60;
    const finishStr = String(fh).padStart(2, '0') + ':' + String(fm).padStart(2, '0');
    textEl.textContent = 'Tot ' + finishStr + ' (nog ' + this.formatHHMM(stillNeeded) + ')';
    widget.classList.remove('pt-done');
    setFill(pct);
  }

  readHomeBookings() {
    const table = document.querySelector('.home-widget-bookings');
    if (!table) return null;
    const cells = Array.from(table.querySelectorAll('td.primion-grid-td, td.gwt-HTML, td'));
    const ins = [];
    const outs = [];
    const headerRow = table.tHead?.rows?.[0];
    let inIdx = 0;
    let outIdx = 1;
    if (headerRow) {
      Array.from(headerRow.cells).forEach((c, i) => {
        const t = c.textContent.trim();
        if (t === 'In') inIdx = i;
        else if (t === 'Uit') outIdx = i;
      });
    }
    const bodyRows = Array.from(table.tBodies?.[0]?.rows || []);
    bodyRows.forEach((row) => {
      const inText = row.cells[inIdx]?.textContent.trim() || '';
      const outText = row.cells[outIdx]?.textContent.trim() || '';
      const inMin = this.parseTime(inText);
      const outMin = this.parseTime(outText);
      if (inMin !== null) ins.push(inMin);
      if (outMin !== null) outs.push(outMin);
    });
    if (ins.length === 0) return null;
    return { ins, outs };
  }

  /* JVU (jaarlijks verlof uur) taken today isn't reflected in the rooster
   * target, so it's read from the "Mijn kalender" widget's day-detail
   * popup and subtracted from the predictor's still-needed time. The
   * popup is only opened once per day (cached), never on every refresh. */
  ensureTodayJvuMinutes(now) {
    const key = now.toDateString();
    if (this._jvuCache.key === key || this._jvuFetching) return this._jvuCache.minutes;
    this.fetchTodayJvuMinutes(key);
    return this._jvuCache.minutes;
  }

  fetchTodayJvuMinutes(key) {
    const cell = document.querySelector('.home-calendar-panel .cell.today');
    if (!cell) return;
    if (document.querySelector('.window-closeIcon')) return; // a detail popup is already open elsewhere
    this._jvuFetching = true;
    cell.click();

    const deadline = Date.now() + 30000;
    const poll = () => {
      const title = Array.from(document.querySelectorAll('.absencesTitle'))
        .find((el) => el.textContent.trim() === 'Afwezigheden:');
      if (!title) {
        if (Date.now() < deadline) {
          setTimeout(poll, 150);
        } else {
          // Timed out - close whatever we opened so the busy-check above
          // doesn't get stuck forever, and let the next tick retry.
          document.querySelector('.window-closeIcon')?.click();
          this._jvuFetching = false;
        }
        return;
      }
      const rows = Array.from(title.nextElementSibling?.querySelectorAll('table.simpleTableSkin > tbody > tr') || []);
      let minutes = 0;
      rows.forEach((row) => {
        const code = row.children[1]?.textContent.trim() || '';
        const time = row.children[3]?.textContent.trim() || '';
        if (/^JVU\b/.test(code)) {
          const m = time.match(/(\d+):(\d{2})/);
          if (m) minutes += Number(m[1]) * 60 + Number(m[2]);
        }
      });
      document.querySelector('.window-closeIcon')?.click();
      this._jvuCache = { key, minutes };
      this._jvuFetching = false;
      this.refreshPredictor();
    };
    poll();
  }

  computeWorkedMinutes(ins, outs, nowMinutes) {
    const sortedIns = [...ins].sort((a, b) => a - b);
    const sortedOuts = [...outs].sort((a, b) => a - b);
    let total = 0;
    for (let i = 0; i < sortedIns.length; i++) {
      const start = sortedIns[i];
      const end = i < sortedOuts.length ? sortedOuts[i] : nowMinutes;
      if (end > start) total += end - start;
    }
    return total;
  }

  computeBreakMinutes(ins, outs, nowMinutes) {
    if (outs.length === 0) return 0;
    const sortedIns = [...ins].sort((a, b) => a - b);
    const sortedOuts = [...outs].sort((a, b) => a - b);
    let total = 0;
    for (let i = 0; i < sortedOuts.length; i++) {
      const breakStart = sortedOuts[i];
      const breakEnd = i + 1 < sortedIns.length ? sortedIns[i + 1] : nowMinutes;
      if (breakEnd > breakStart) total += breakEnd - breakStart;
    }
    return total;
  }

  /* ===========================================================
   * Dagresultaten - per-row enhancements
   * =========================================================== */

  /* Supervisor view renders several table.dataTable elements; the journal is
   * not always the first. Pick the one that actually holds the day rows. */
  findJournalTable() {
    if (this._journalTable !== undefined) return this._journalTable;
    this._journalTable = [...document.querySelectorAll('table.dataTable')]
      .find((t) => t.querySelector('tr.journal-grid-row')) || null;
    return this._journalTable;
  }

  enhanceDagresultaten() {
    const table = this.findJournalTable();
    if (!table) return;

    const rows = Array.from(table.querySelectorAll('tr.journal-grid-row'));
    if (rows.length === 0) return;

    rows.forEach((row) => this.enhanceDagRow(row));

    if (this.settings.weekMonthTotals || this.settings.thuiswerkRatio) {
      const aggregates = this.computeAggregates(rows);
      if (aggregates) {
        if (this.settings.weekMonthTotals) this.renderDagAggregates(table, aggregates);
        if (this.settings.thuiswerkRatio) this.renderThuiswerkPanel(table, aggregates.months);
      }
    }


  }

  enhanceDagRow(row) {
    const cells = Array.from(row.cells);
    if (cells.length < 8) return;

    const datumCell = cells[0];
    const roosterCell = cells[1];
    const inCell = cells[3];
    const outCell = cells[5];
    const dagtotaalCell = cells[7];
    const saldoCell = cells[cells.length - 1];

    const dateInfo = this.parseDatumCell(datumCell);
    const roosterMinutes = this.readRoosterMinutes(roosterCell);
    const dagtotaalMinutes = this.readSingleTimeCell(dagtotaalCell);
    const inTimes = this.readMultiTimes(inCell);
    const outTimes = this.readMultiTimes(outCell);

    if (this.settings.daysSuffix) {
      this.enhanceSaldoCell(saldoCell, dateInfo);
    }

    if (this.settings.colorCoding) {
      this.applyRowColor(row, roosterMinutes, dagtotaalMinutes);
    }

    if (this.settings.forgottenClockout) {
      this.markForgottenClockout(row, dateInfo, inTimes, outTimes, dagtotaalMinutes);
    }

    if (this.settings.liveDagtotaal && this.isToday(dateInfo)) {
      this.applyLiveDagtotaal(row, dagtotaalCell, inTimes, outTimes, roosterMinutes);
    }
  }

  enhanceSaldoCell(cell, dateInfo) {
    const divisor = dateInfo ? this.leaveMinutesFor(dateInfo.date) : this.settings.leaveDayMinutes;
    const valueTds = cell.querySelectorAll('table tbody tr td:nth-child(2)');
    valueTds.forEach((td) => {
      if (td.getAttribute(TAG) === 'suffix') return;
      const text = td.textContent.trim();
      if (!this.isHHMM(text)) return;
      const minutes = this.parseTime(text);
      if (minutes === null) return;
      this.applySuffix(td, text, minutes, divisor);
    });
  }

  applyRowColor(row, roosterMinutes, dagtotaalMinutes) {
    if (roosterMinutes === null || roosterMinutes === 0) {
      row.style.backgroundColor = '';
      return;
    }
    if (dagtotaalMinutes === null) return;
    row.setAttribute(TAG, 'row-tint');
    if (dagtotaalMinutes >= roosterMinutes) {
      row.style.backgroundColor = 'rgba(46, 160, 67, 0.10)';
    } else if (dagtotaalMinutes > 0) {
      row.style.backgroundColor = 'rgba(207, 34, 46, 0.08)';
    } else {
      row.style.backgroundColor = '';
    }
  }

  markForgottenClockout(row, dateInfo, inTimes, outTimes, dagtotaalMinutes) {
    if (!dateInfo || !this.isPast(dateInfo)) return;
    if (inTimes.length === 0) return;
    if (inTimes.length <= outTimes.length) return;

    row.setAttribute(TAG, 'forgotten');
    row.style.outline = '2px solid #f39c12';
    row.style.outlineOffset = '-2px';

    if (!row.querySelector('.pt-forgotten-marker')) {
      const firstCell = row.cells[0];
      const marker = document.createElement('span');
      marker.className = 'pt-forgotten-marker';
      marker.textContent = ' ⚠';
      marker.title = 'Vergeten Uit-boeking?';
      firstCell.appendChild(marker);
    }
  }

  applyLiveDagtotaal(row, dagtotaalCell, inTimes, outTimes, roosterMinutes) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const stillIn = inTimes.length > outTimes.length;
    const worked = this.computeWorkedMinutes(inTimes, outTimes, nowMinutes);
    if (worked <= 0) return;

    let badge = dagtotaalCell.querySelector('.pt-live-dagtotaal');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'pt-live-dagtotaal';
      badge.setAttribute(TAG, 'injected');
      dagtotaalCell.appendChild(badge);
    }
    const text = stillIn ? '⏱ ' + this.formatHHMM(worked) : this.formatHHMM(worked);
    badge.textContent = text;
    badge.dataset.live = '1';
    badge.dataset.role = roosterMinutes ? String(roosterMinutes) : '';
  }

  updateLiveDagtotaal() {
    const badges = document.querySelectorAll('.pt-live-dagtotaal[data-live="1"]');
    if (badges.length === 0) return;
    const table = this.findJournalTable();
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr.journal-grid-row'));
    rows.forEach((row) => {
      const cells = Array.from(row.cells);
      const datumCell = cells[0];
      const inCell = cells[3];
      const outCell = cells[5];
      const dagtotaalCell = cells[7];
      const dateInfo = this.parseDatumCell(datumCell);
      if (!this.isToday(dateInfo)) return;
      const inTimes = this.readMultiTimes(inCell);
      const outTimes = this.readMultiTimes(outCell);
      const roosterMinutes = this.readRoosterMinutes(cells[1]);
      this.applyLiveDagtotaal(row, dagtotaalCell, inTimes, outTimes, roosterMinutes);
    });
  }

  /* ---------- Aggregates (week / month) ---------- */

  renderDagAggregates(table, aggregates) {
    const parent = table.parentElement;
    let container = parent.querySelector('.pt-aggregates');
    if (!container) {
      container = document.createElement('div');
      container.className = 'pt-aggregates';
      container.setAttribute(TAG, 'injected');
      parent.insertBefore(container, table);
    }

    const currentWeekKey = this.isoWeekKey(new Date());

    const weekRows = aggregates.weeks
      .map((w) => {
        const weekNum = w.label.replace(/^\d{4}-W0?/, '');
        const isCurrent = w.label === currentWeekKey;
        const deltaCell = isCurrent
          ? '<td class="pt-delta-cur">lopend</td>'
          : (() => {
              const delta = w.workedMinutes - w.targetMinutes;
              const sign = delta >= 0 ? '+' : '';
              return '<td class="' + (delta >= 0 ? 'pt-delta-pos' : 'pt-delta-neg') + '">' + sign + this.formatHHMM(delta) + '</td>';
            })();
        return (
          '<tr><td>Week ' + weekNum + '</td><td>' +
          this.formatHHMM(w.workedMinutes) +
          '</td><td>' + w.daysWorked + ' d</td><td>' + this.formatHHMM(w.targetMinutes) + '</td>' + deltaCell + '</tr>'
        );
      })
      .join('');

    const monthRows = aggregates.months
      .map((m) => {
        return (
          '<tr><td><b>' + m.label + '</b></td><td><b>' +
          this.formatHHMM(m.workedMinutes) +
          '</b></td><td><b>' + m.daysWorked + ' d</b></td><td><b>' + this.formatHHMM(m.targetMinutes) + '</b></td><td class="pt-delta-cur">—</td></tr>'
        );
      })
      .join('');

    container.innerHTML =
      '<div class="pt-agg-header">PrimeTime+ totalen</div>' +
      '<table><thead><tr>' +
      '<th>Periode</th><th>Gewerkt</th><th>Dagen</th><th>Rooster</th><th>Δ</th>' +
      '</tr></thead><tbody>' + weekRows + monthRows + '</tbody></table>';
  }

  /* Home-vs-office ratio, one pill per month. Pill turns red when home
   * work exceeds TELEWORK_CEILING_PCT% of clocked presence. */
  renderThuiswerkPanel(table, months) {
    const parent = table.parentElement;
    const pills = months
      .map((m) => {
        const presence = m.homeMinutes + m.officeMinutes;
        if (presence <= 0) return '';
        const pct = Math.round((m.homeMinutes / presence) * 100);
        const high = pct > TELEWORK_CEILING_PCT;
        const detail =
          this.formatHHMM(m.homeMinutes) + ' thuis / ' +
          this.formatHHMM(presence) + ' totaal';
        const needed = Math.max(0, m.homeMinutes - m.officeMinutes);
        const office = high
          ? '+' + this.formatHHMM(needed) + ' (' + this.formatDays(needed) + ') kantoor nodig'
          : '✓ onder 50%';
        return (
          '<div title="' + m.label + ' — ' + detail + '" class="pt-pill ' + (high ? 'pt-pill-high' : 'pt-pill-ok') + '">' +
          '<span class="pt-pill-pct">' + pct + '% Thuiswerk</span>' +
          '<span class="pt-pill-office">' + office + '</span>' +
          '<span class="pt-pill-detail">' + m.label + ' · ' + detail + '</span>' +
          '</div>'
        );
      })
      .join('');

    let container = parent.querySelector('.pt-thuiswerk');
    if (!pills) {
      if (container) container.remove();
      return;
    }
    if (!container) {
      container = document.createElement('div');
      container.className = 'pt-thuiswerk';
      container.setAttribute(TAG, 'injected');
      parent.insertBefore(container, parent.querySelector('.pt-aggregates') || table);
    }
    container.innerHTML =
      '<div class="pt-thuiswerk-header">Thuiswerk-ratio</div>' +
      '<div class="pt-thuiswerk-pills">' + pills + '</div>';
  }

  computeAggregates(rows) {
    const weeks = new Map();
    const months = new Map();

    rows.forEach((row) => {
      const cells = Array.from(row.cells);
      if (cells.length < 8) return;
      const dateInfo = this.parseDatumCell(cells[0]);
      if (!dateInfo) return;
      const dagtotaalMinutes = this.readSingleTimeCell(cells[7]);
      if (dagtotaalMinutes === null) return;
      // ponytail: the Rooster column already knows weekends, holidays and
      // half days, so it is the per-week target -- no calendar math needed.
      const targetMinutes = this.readRoosterMinutes(cells[1]) || 0;
      const presence = this.readAanwezigheidCell(cells[8]);

      const weekKey = this.isoWeekKey(dateInfo.date);
      const monthKey = dateInfo.date.getFullYear() + '-' + (dateInfo.date.getMonth() + 1);
      const monthLabel = this.monthLabel(dateInfo.date);

      if (!weeks.has(weekKey)) {
        weeks.set(weekKey, {
          label: weekKey,
          workedMinutes: 0,
          targetMinutes: 0,
          daysWorked: 0,
        });
      }
      const w = weeks.get(weekKey);
      w.workedMinutes += dagtotaalMinutes;
      w.targetMinutes += targetMinutes;
      if (dagtotaalMinutes > 0) w.daysWorked += 1;

      if (!months.has(monthKey)) {
        months.set(monthKey, {
          label: monthLabel,
          workedMinutes: 0,
          targetMinutes: 0,
          daysWorked: 0,
          homeMinutes: 0,
          officeMinutes: 0,
        });
      }
      const m = months.get(monthKey);
      m.workedMinutes += dagtotaalMinutes;
      m.targetMinutes += targetMinutes;
      if (dagtotaalMinutes > 0) m.daysWorked += 1;
      m.homeMinutes += presence.home;
      m.officeMinutes += presence.office;
    });

    if (weeks.size === 0 && months.size === 0) return null;
    return {
      weeks: Array.from(weeks.values()),
      months: Array.from(months.values()),
    };
  }

  /* ---------- Cell parsers ---------- */

  parseDatumCell(cell) {
    if (!cell) return null;
    const text = cell.textContent.replace(/\s+/g, ' ').trim();
    const match = text.match(/(ma|di|wo|do|vr|za|zo)\s*(\d{1,2})\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)/i);
    if (!match) return null;
    const day = parseInt(match[2], 10);
    const monthIdx = DUTCH_MONTHS[match[3].toLowerCase()];
    if (monthIdx === undefined) return null;
    const today = new Date();
    let year = today.getFullYear();
    const candidate = new Date(year, monthIdx, day);
    if (candidate.getMonth() === 11 && today.getMonth() <= 1) year -= 1;
    if (candidate.getMonth() === 0 && today.getMonth() === 11) year += 1;
    return { date: new Date(year, monthIdx, day), day, monthIdx };
  }

  readSingleTimeCell(cell) {
    if (!cell) return null;
    const text = cell.textContent.trim();
    if (!this.isHHMM(text)) return null;
    return this.parseTime(text);
  }

  readMultiTimes(cell) {
    if (!cell) return [];
    const tds = cell.querySelectorAll('td');
    const times = [];
    tds.forEach((td) => {
      const t = td.textContent.trim();
      if (this.isHHMM(t)) {
        const m = this.parseTime(t);
        if (m !== null) times.push(m);
      }
    });
    return times;
  }

  /* Aanwezigheid cell: nested table, one inner row per presence block.
   * Each inner row is [code, HH:MM, ''] where code is THUIS (home) or a
   * worksite code such as AK (office). Returns minutes split by location. */
  readAanwezigheidCell(cell) {
    const result = { home: 0, office: 0 };
    if (!cell) return result;
    const innerRows = cell.querySelectorAll('table tbody tr');
    innerRows.forEach((tr) => {
      const tds = tr.cells;
      if (tds.length < 2) return;
      const code = tds[0].textContent.trim().toUpperCase();
      const minutes = this.parseTime(tds[1].textContent.trim());
      if (minutes === null || minutes <= 0) return;
      if (code.includes('THUIS')) result.home += minutes;
      else result.office += minutes;
    });
    return result;
  }

  readRoosterMinutes(cell) {
    if (!cell) return null;
    const tds = cell.querySelectorAll('td');
    for (const td of tds) {
      const t = td.textContent.trim();
      if (this.isHHMM(t)) {
        const m = this.parseTime(t);
        if (m !== null) return m;
      }
    }
    return null;
  }

  isToday(dateInfo) {
    if (!dateInfo) return false;
    const t = new Date();
    return (
      dateInfo.date.getFullYear() === t.getFullYear() &&
      dateInfo.date.getMonth() === t.getMonth() &&
      dateInfo.date.getDate() === t.getDate()
    );
  }

  isPast(dateInfo) {
    if (!dateInfo) return false;
    const t = new Date();
    const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return dateInfo.date.getTime() < today.getTime();
  }

  isoWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(weekNum).padStart(2, '0');
  }

  monthLabel(date) {
    const names = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
    return names[date.getMonth()] + ' ' + date.getFullYear();
  }

  /* ===========================================================
   * Afwezigheidsplanning - Saldi sidebar
   * =========================================================== */

  enhanceAfwezigheidsplanning() {
    const panel = document.querySelector('.balancePanel');
    if (!panel) return;
    const labels = panel.querySelectorAll('.gwt-HTML.primion-label.gwt-Label');
    labels.forEach((el) => {
      if (el.getAttribute(TAG) === 'block-suffix') return;
      if (el.classList.contains('subTitle') || el.classList.contains('descriptionLink')) return;
      const text = el.textContent.trim();
      if (!this.isHHMM(text)) return;
      const minutes = this.parseTime(text);
      if (minutes === null) return;
      this.applyBlockSuffix(el, minutes, this.settings.leaveDayMinutes * this.averageWeekFactor());
    });
  }

  /* ===========================================================
   * Tooltips - any HH:MM in title attribute
   * =========================================================== */

  enhanceTooltips() {
    if (!this.settings.tooltips) return;
    const roots = [];
    const saldi = document.querySelector('.balancesWidgetTitle');
    if (saldi) roots.push(saldi.closest('.panel') || saldi.parentElement);
    const balancePanel = document.querySelector('.balancePanel');
    if (balancePanel) roots.push(balancePanel);
    const jt = this.findJournalTable();
    if (jt) roots.push(jt.parentElement || jt);
    if (roots.length === 0) return;

    const seen = new WeakSet();
    for (const root of roots) {
      root.querySelectorAll('[title]').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (el.getAttribute(TAG) === 'tooltip') return;
        const title = el.getAttribute('title');
        if (!title) return;
        let changed = false;
        const newTitle = title.replace(/(?<![\d:])(-?\d+:\d{2})(?![\d:])/g, (match) => {
          const minutes = this.parseTime(match);
          if (minutes === null) return match;
          changed = true;
          return match + ' (' + this.formatDays(minutes, this.settings.leaveDayMinutes * this.averageWeekFactor()) + ')';
        });
        if (changed) {
          el.setAttribute('data-pt-original-title', title);
          el.setAttribute(TAG, 'tooltip');
          el.setAttribute('title', newTitle);
        }
      });
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PrimeTimePlus());
} else {
  new PrimeTimePlus();
}
