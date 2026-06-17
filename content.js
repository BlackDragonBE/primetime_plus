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

const DEFAULT_SETTINGS = {
  daysSuffix: true,
  predictor: true,
  liveDagtotaal: true,
  weekMonthTotals: true,
  thuiswerkRatio: true,
  colorCoding: true,
  forgottenClockout: true,
  tooltips: true,
  workingDayMinutes: 8 * 60 + 6,
  leaveDayMinutes: 7 * 60 + 36,
};

class PrimeTimePlus {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.refreshScheduled = false;
    this.liveTimer = null;
    this.predictorTimer = null;
    this.lastRefreshAt = 0;

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
    this.refresh();
    this.observe();
    this.startTimers();
    this.listenForSettingChanges();
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
    this.lastRefreshAt = Date.now();
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
    this.updateLiveDagtotaal();
  }

  tickPredictor() {
    if (!this.settings.predictor) return;
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
    const divisor = minutesPerDay !== undefined ? minutesPerDay : this.settings.workingDayMinutes;
    const days = totalMinutes / divisor;
    const rounded = Math.round(days * 100) / 100;
    return rounded + 'd';
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
    span.style.cssText =
      'display:block;font-size:0.85em;color:#7f8c8d;font-style:italic;';
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
      this.applySuffix(el, text, minutes, this.settings.leaveDayMinutes);
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
    widget.style.cssText = [
      'margin-top:8px',
      'padding:6px 8px',
      'background:#ecf6ff',
      'border:1px solid #b8d8f0',
      'border-radius:4px',
      'font-size:12px',
      'color:#2c3e50',
      'text-align:center',
    ].join(';');
    widget.textContent = 'Klaar om …';
    panel.appendChild(widget);
    this.refreshPredictor();
  }

  refreshPredictor() {
    const widget = document.querySelector('.pt-predictor');
    if (!widget) return;

    const inOutTimes = this.readHomeBookings();
    if (!inOutTimes) {
      widget.textContent = 'Geen In-tijd gevonden';
      return;
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const sortedIns = [...inOutTimes.ins].sort((a, b) => a - b);
    const sortedOuts = [...inOutTimes.outs].sort((a, b) => a - b);
    const firstIn = sortedIns[0];
    const breakMinutes = this.computeBreakMinutes(sortedIns, sortedOuts, nowMinutes);
    const extraBreak = Math.max(0, breakMinutes - 30);
    const finishMinutes = firstIn + this.settings.workingDayMinutes + extraBreak;
    const stillNeeded = finishMinutes - nowMinutes;

    if (stillNeeded <= 0) {
      const overshoot = -stillNeeded;
      widget.textContent =
        'Doel bereikt (+' + this.formatHHMM(overshoot) + ')';
      widget.style.background = '#e3f7e3';
      widget.style.borderColor = '#9bd49b';
      return;
    }

    const fh = Math.floor(finishMinutes / 60) % 24;
    const fm = finishMinutes % 60;
    const finishStr = String(fh).padStart(2, '0') + ':' + String(fm).padStart(2, '0');
    widget.textContent =
      'Tot ' + finishStr + ' (nog ' + this.formatHHMM(stillNeeded) + ')';
    widget.style.background = '#ecf6ff';
    widget.style.borderColor = '#b8d8f0';
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
    return [...document.querySelectorAll('table.dataTable')]
      .find((t) => t.querySelector('tr.journal-grid-row')) || null;
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

    if (!document.querySelector('#pt-dag-height-fix')) {
      const style = document.createElement('style');
      style.id = 'pt-dag-height-fix';
      style.setAttribute(TAG, 'injected');
      style.textContent = '.gwt-ScrollTable.journal { height: 720px !important; }';
      document.head.appendChild(style);
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
      this.enhanceSaldoCell(saldoCell);
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

  enhanceSaldoCell(cell) {
    const valueTds = cell.querySelectorAll('table tbody tr td:nth-child(2)');
    valueTds.forEach((td) => {
      if (td.getAttribute(TAG) === 'suffix') return;
      const text = td.textContent.trim();
      if (!this.isHHMM(text)) return;
      const minutes = this.parseTime(text);
      if (minutes === null) return;
      this.applySuffix(td, text, minutes, this.settings.leaveDayMinutes);
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
      marker.style.color = '#f39c12';
      marker.style.fontWeight = 'bold';
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
      badge.style.cssText = [
        'margin-top:2px',
        'font-size:11px',
        'color:#1f6feb',
        'font-style:italic',
      ].join(';');
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
    document.querySelectorAll('.pt-aggregates').forEach((el) => el.remove());

    const container = document.createElement('div');
    container.className = 'pt-aggregates';
    container.setAttribute(TAG, 'injected');
    container.style.cssText = [
      'margin:8px 0',
      'padding:8px 12px',
      'background:#fafafa',
      'border:1px solid #ddd',
      'border-radius:4px',
      'font-size:12px',
      'color:#2c3e50',
    ].join(';');

    const targetWeek = 5 * this.settings.workingDayMinutes;

    const weekRows = aggregates.weeks
      .map((w) => {
        const delta = w.workedMinutes - targetWeek;
        const sign = delta >= 0 ? '+' : '';
        const color = delta >= 0 ? '#1a7f37' : '#cf222e';
        return (
          '<tr><td style="padding:2px 8px">Week ' +
          w.label +
          '</td><td style="padding:2px 8px;text-align:right">' +
          this.formatHHMM(w.workedMinutes) +
          '</td><td style="padding:2px 8px;text-align:right">' +
          this.formatDays(w.workedMinutes) +
          '</td><td style="padding:2px 8px;text-align:right;color:' +
          color +
          '">' +
          sign +
          this.formatHHMM(delta) +
          '</td></tr>'
        );
      })
      .join('');

    const monthRows = aggregates.months
      .map((m) => {
        return (
          '<tr><td style="padding:2px 8px"><b>' +
          m.label +
          '</b></td><td style="padding:2px 8px;text-align:right"><b>' +
          this.formatHHMM(m.workedMinutes) +
          '</b></td><td style="padding:2px 8px;text-align:right"><b>' +
          this.formatDays(m.workedMinutes) +
          '</b></td><td style="padding:2px 8px;text-align:right">' +
          m.daysWorked +
          ' × dag</td></tr>'
        );
      })
      .join('');

    container.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px">PrimeTime+ totalen</div>' +
      '<table style="border-collapse:collapse;width:100%">' +
      '<thead><tr style="border-bottom:1px solid #ccc">' +
      '<th style="text-align:left;padding:2px 8px">Periode</th>' +
      '<th style="text-align:right;padding:2px 8px">Gewerkt</th>' +
      '<th style="text-align:right;padding:2px 8px">Dagen</th>' +
      '<th style="text-align:right;padding:2px 8px">Δ vs doel</th>' +
      '</tr></thead><tbody>' +
      weekRows +
      monthRows +
      '</tbody></table>';

    const parent = table.parentElement;
    parent.insertBefore(container, table);
  }

  /* Home-vs-office ratio, one pill per month. Pill turns red when home
   * work exceeds 50% of clocked presence (the telework ceiling). */
  renderThuiswerkPanel(table, months) {
    document.querySelectorAll('.pt-thuiswerk').forEach((el) => el.remove());
    const pills = months
      .map((m) => {
        const presence = m.homeMinutes + m.officeMinutes;
        if (presence <= 0) return '';
        const pct = Math.round((m.homeMinutes / presence) * 100);
        const high = pct > 50;
        const bg = high ? '#fdecea' : '#eafaf1';
        const border = high ? '#e74c3c' : '#27ae60';
        const fg = high ? '#c0392b' : '#1e8449';
        const detail =
          this.formatHHMM(m.homeMinutes) + ' thuis / ' +
          this.formatHHMM(presence) + ' totaal';
        return (
          '<div title="' + m.label + ' — ' + detail + '" style="' +
          'flex:1 1 160px;display:flex;flex-direction:column;align-items:flex-start;gap:2px;' +
          'padding:8px 12px;border:1px solid ' + border + ';border-left:4px solid ' + border + ';' +
          'border-radius:6px;background:' + bg + '">' +
          '<span style="font-size:16px;font-weight:bold;color:' + fg + '">' +
          pct + '% Thuiswerk</span>' +
          '<span style="font-size:11px;color:#5a6b7b">' +
          m.label + ' · ' + detail + '</span>' +
          '</div>'
        );
      })
      .join('');
    if (!pills) return;

    const container = document.createElement('div');
    container.className = 'pt-thuiswerk';
    container.setAttribute(TAG, 'injected');
    container.style.cssText = 'margin:8px 0';
    container.innerHTML =
      '<div style="font-weight:bold;margin-bottom:6px">Thuiswerk-ratio</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      pills + '</div>';

    const parent = table.parentElement;
    parent.insertBefore(container, parent.querySelector('.pt-aggregates') || table);
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
      const presence = this.readAanwezigheidCell(cells[8]);

      const weekKey = this.isoWeekKey(dateInfo.date);
      const monthKey = dateInfo.date.getFullYear() + '-' + (dateInfo.date.getMonth() + 1);
      const monthLabel = this.monthLabel(dateInfo.date);

      if (!weeks.has(weekKey)) {
        weeks.set(weekKey, {
          label: weekKey,
          workedMinutes: 0,
          daysWorked: 0,
        });
      }
      const w = weeks.get(weekKey);
      w.workedMinutes += dagtotaalMinutes;
      if (dagtotaalMinutes > 0) w.daysWorked += 1;

      if (!months.has(monthKey)) {
        months.set(monthKey, {
          label: monthLabel,
          workedMinutes: 0,
          daysWorked: 0,
          homeMinutes: 0,
          officeMinutes: 0,
        });
      }
      const m = months.get(monthKey);
      m.workedMinutes += dagtotaalMinutes;
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
      this.applyBlockSuffix(el, minutes, this.settings.leaveDayMinutes);
    });
  }

  /* ===========================================================
   * Tooltips - any HH:MM in title attribute
   * =========================================================== */

  enhanceTooltips() {
    if (!this.settings.tooltips) return;
    const elements = document.querySelectorAll('[title]');
    elements.forEach((el) => {
      if (el.getAttribute(TAG) === 'tooltip') return;
      const title = el.getAttribute('title');
      if (!title) return;
      let changed = false;
      const newTitle = title.replace(/(?<![\d:])(-?\d+:\d{2})(?![\d:])/g, (match) => {
        const minutes = this.parseTime(match);
        if (minutes === null) return match;
        changed = true;
        return match + ' (' + this.formatDays(minutes, this.settings.leaveDayMinutes) + ')';
      });
      if (changed) {
        el.setAttribute(TAG, 'tooltip');
        el.setAttribute('title', newTitle);
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PrimeTimePlus());
} else {
  new PrimeTimePlus();
}
