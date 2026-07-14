/* ══════════════════════════════════════════════════════════════
  Solix Dashboard  –  app.js
   ══════════════════════════════════════════════════════════════ */

'use strict';

/* ── CSV column indices ─────────────────────────────────────────
   Row 0 of the file is a definition comment (quoted string).
   Row 1 is the actual header: Datum, Eigenverbrauch (kWh), ...
   Data rows begin at row 2.
   ─────────────────────────────────────────────────────────────── */
const COL = Object.freeze({
  DATUM:                0,
  EIGENVERBRAUCH:       1,
  // SMART_PLUG:        2,  // always 0 in current exports; not used in Sankey
  NETZIMPORT:           3,
  NETZ_ZU_HAUSHALT:     4,
  NETZ_ZU_SPEICHER:     5,
  SOLAR_ZU_HAUSHALT:    6,
  SOLAR_ZU_SPEICHER:    7,
  // SPEICHERLADUNG:    8,  // = SOLAR_ZU_SPEICHER + NETZ_ZU_SPEICHER
  // SPEICHERENTLADUNG: 9,  // ≈ SPEICHER_ZU_HAUSHALT (slight conversion loss)
  SPEICHER_ZU_HAUSHALT: 10,
  GENUTZTE_SOLAR:       11,
  GESAMT_SOLAR:         12,
  SOLAR_EINSPEISUNG:    13,
});

const DE_MONTHS = Object.freeze([
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]);

const MOBILE_BREAKPOINT = 600;

/* ── Application state ──────────────────────────────────────── */
let records         = [];     // Array of parsed daily record objects
let availableYears  = [];     // Sorted number[]
let availableMonths = [];     // Sorted {year, month}[]
let firstDate       = null;   // Earliest date present in the CSV
let lastDate        = null;   // Latest date present in the CSV
let viewType        = 'year'; // 'year' | 'month' | 'total'
let currentYear     = null;
let currentMonth    = null;   // 1–12 (only used in 'month' view)
let activeChartTab   = 'sankey';
let chart           = null;   // ECharts instance (Sankey)
let householdChart  = null;   // ECharts instance (household supply)
let pvDistributionChart = null; // ECharts instance (PV distribution)
let lastTheme;
let lastMobile;

function isMobileViewport() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

/* ── Utilities ──────────────────────────────────────────────── */

/** Format kWh value; switches to MWh above 1000 kWh. */
function fmtKwh(kwh) {
  if (kwh >= 1000) return (kwh / 1000).toFixed(2) + ' MWh';
  return kwh.toFixed(2) + ' kWh';
}

/** Format the current period as a human-readable string. */
function fmtPeriod() {
  if (viewType === 'year') return String(currentYear);
  if (viewType === 'month') return `${DE_MONTHS[currentMonth - 1]} ${currentYear}`;
  if (!firstDate || !lastDate) return '—';
  return `${fmtDate(firstDate)} - ${fmtDate(lastDate)}`;
}

function fmtDate(date) {
  return `${date.day}.${date.month}.${date.year}`;
}

/* ── CSV Parsing ────────────────────────────────────────────── */

/**
 * Parse the Anker Solix energy details CSV text.
 * Populates the global `records`, `availableYears`, `availableMonths`.
 * Throws on invalid format.
 */
function parseCSV(text) {
  const { data: rows } = Papa.parse(text, { skipEmptyLines: true });

  // The first CSV row is a definition comment (quoted); the real header
  // is the first row whose first cell is exactly 'Datum'.
  const headerIdx = rows.findIndex(r => r[0] === 'Datum');
  if (headerIdx === -1) {
    throw new Error(
      'Keine gültige Anker Solix CSV-Datei – Spalte „Datum" nicht gefunden.'
    );
  }

  const parsed = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const raw = row[COL.DATUM] ?? '';

    // Date format: DD/MM/YYYY
    const parts = raw.split('/');
    if (parts.length !== 3) continue;
    const day   = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year  = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) continue;

    const n = idx => parseFloat(row[idx]) || 0;
    parsed.push({
      date: { day, month, year },
      eigenverbrauch:     n(COL.EIGENVERBRAUCH),
      netzImport:         n(COL.NETZIMPORT),
      netzZuHaushalt:     n(COL.NETZ_ZU_HAUSHALT),
      netzZuSpeicher:     n(COL.NETZ_ZU_SPEICHER),
      solarZuHaushalt:    n(COL.SOLAR_ZU_HAUSHALT),
      solarZuSpeicher:    n(COL.SOLAR_ZU_SPEICHER),
      speicherZuHaushalt: n(COL.SPEICHER_ZU_HAUSHALT),
      genutzeSolar:       n(COL.GENUTZTE_SOLAR),
      gesamtSolar:        n(COL.GESAMT_SOLAR),
      solarEinspeisung:   n(COL.SOLAR_EINSPEISUNG),
    });
  }

  if (parsed.length === 0) {
    throw new Error('Die CSV-Datei enthält keine auswertbaren Datensätze.');
  }

  records = parsed;

  const byTime = (a, b) => Date.UTC(a.year, a.month - 1, a.day)
    - Date.UTC(b.year, b.month - 1, b.day);
  firstDate = parsed.reduce((min, r) => byTime(r.date, min) < 0 ? r.date : min, parsed[0].date);
  lastDate  = parsed.reduce((max, r) => byTime(r.date, max) > 0 ? r.date : max, parsed[0].date);

  // Build sorted year list
  availableYears = [...new Set(records.map(r => r.date.year))].sort((a, b) => a - b);

  // Build sorted month list ({year, month} objects)
  availableMonths = [
    ...new Set(records.map(r => `${r.date.year}-${String(r.date.month).padStart(2, '0')}`)),
  ].sort().map(key => {
    const [y, m] = key.split('-');
    return { year: +y, month: +m };
  });
}

/* ── Data aggregation ───────────────────────────────────────── */

/**
 * Sum all daily records for the given year (and optionally month).
 * Returns a flat object with totals for all Sankey-relevant columns.
 */
function aggregate(year = null, month = null) {
  const rows = year === null
    ? records
    : month !== null
      ? records.filter(r => r.date.year === year && r.date.month === month)
      : records.filter(r => r.date.year === year);

  return aggregateRows(rows);
}

/** Sum Sankey-relevant values for an arbitrary list of daily records. */
function aggregateRows(rows) {

  const sum = key => rows.reduce((acc, r) => acc + r[key], 0);
  return {
    eigenverbrauch:     sum('eigenverbrauch'),
    netzImport:         sum('netzImport'),
    netzZuHaushalt:     sum('netzZuHaushalt'),
    netzZuSpeicher:     sum('netzZuSpeicher'),
    solarZuHaushalt:    sum('solarZuHaushalt'),
    solarZuSpeicher:    sum('solarZuSpeicher'),
    speicherZuHaushalt: sum('speicherZuHaushalt'),
    genutzeSolar:       sum('genutzeSolar'),
    gesamtSolar:        sum('gesamtSolar'),
    solarEinspeisung:   sum('solarEinspeisung'),
  };
}

/** Return all daily records belonging to the period currently displayed. */
function getCurrentRows() {
  if (viewType === 'total') return records;
  if (viewType === 'year') return records.filter(r => r.date.year === currentYear);
  return records.filter(r => r.date.year === currentYear && r.date.month === currentMonth);
}

function dateKey(date) {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function monthKey(date) {
  return `${date.year}-${String(date.month).padStart(2, '0')}`;
}

/**
 * Aggregate the selected period by day in month view (and short total views),
 * otherwise by calendar month.
 */
function buildTimeSeries(rows) {
  const monthCount = new Set(rows.map(r => monthKey(r.date))).size;
  const byDay = viewType === 'month' || (viewType === 'total' && monthCount < 2);
  const buckets = new Map();

  rows.forEach(row => {
    const key = byDay ? dateKey(row.date) : monthKey(row.date);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });

  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucketRows]) => {
    const values = aggregateRows(bucketRows);
    const autarkie = values.eigenverbrauch > 0
      ? (values.solarZuHaushalt + values.speicherZuHaushalt) / values.eigenverbrauch * 100
      : 0;
    const eigenverbrauchsquote = values.gesamtSolar > 0
      ? (values.solarZuHaushalt + values.solarZuSpeicher) / values.gesamtSolar * 100
      : 0;
    const [year, month, day] = key.split('-').map(Number);
    return {
      label: byDay
        ? `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.`
        : `${DE_MONTHS[month - 1].slice(0, 3)} ${year}`,
      values,
      autarkie,
      eigenverbrauchsquote,
    };
  });
}

/* ── Period index helpers ───────────────────────────────────── */
function yearIdx()  { return availableYears.indexOf(currentYear); }
function monthIdx() {
  return availableMonths.findIndex(m => m.year === currentYear && m.month === currentMonth);
}

/* ── Sankey option builder ──────────────────────────────────── */

/**
 * Build the ECharts Sankey option object from aggregated data.
 *
 * Nodes (sources, left):    PV · Batterie (Entladung) · Netz (Import)
 * Nodes (sinks,   right):   Batterie (Ladung) · Haushalt · Netz (Einspeisung)
 *
 * Node labels show only the energy quantity. Percentage KPIs are shown in
 * the footer instead, where their definitions are explicit.
 */
function buildSankeyOption(d) {
  const isDark     = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const labelColor = isDark ? '#c9d1d9' : '#24292f';
  const isMobile   = isMobileViewport();

  // ── Node definitions ─────────────────────────────────────────
  // Custom properties (displayName, kwh) are accessible in the
  // series-level label formatter via params.data.
  const allNodes = [
    {
      name: 'pv',
      displayName: 'PV',
      kwh: d.solarZuHaushalt + d.solarZuSpeicher + d.solarEinspeisung,
      itemStyle: { color: '#f5a623' },
      label: { position: isMobile ? 'top' : 'left' },
    },
    {
      name: 'bat_out',
      displayName: 'Batterie',
      kwh: d.speicherZuHaushalt,
      itemStyle: { color: '#26c6da' },
      label: { position: isMobile ? 'top' : 'left' },
    },
    {
      name: 'netz_in',
      displayName: 'Netz',
      kwh: d.netzZuHaushalt + d.netzZuSpeicher,
      itemStyle: { color: '#5c6bc0' },
      label: { position: isMobile ? 'top' : 'left' },
    },
    {
      name: 'bat_in',
      displayName: 'Batterie',
      kwh: d.solarZuSpeicher + d.netzZuSpeicher,
      itemStyle: { color: '#26c6da' },
      label: { position: isMobile ? 'bottom' : 'right' },
    },
    {
      name: 'haushalt',
      displayName: 'Haushalt',
      kwh: d.solarZuHaushalt + d.speicherZuHaushalt + d.netzZuHaushalt,
      itemStyle: { color: '#ab47bc' },
      label: { position: isMobile ? 'bottom' : 'right' },
    },
    {
      name: 'netz_out',
      displayName: 'Netz',
      kwh: d.solarEinspeisung,
      itemStyle: { color: '#42a5f5' },
      label: { position: isMobile ? 'bottom' : 'right' },
    },
  ];

  // ── Links (filter near-zero flows) ───────────────────────────
  const rawLinks = [
    { source: 'pv',      target: 'bat_in',   value: d.solarZuSpeicher },
    { source: 'pv',      target: 'haushalt', value: d.solarZuHaushalt },
    { source: 'pv',      target: 'netz_out', value: d.solarEinspeisung },
    { source: 'bat_out', target: 'haushalt', value: d.speicherZuHaushalt },
    { source: 'netz_in', target: 'haushalt', value: d.netzZuHaushalt },
    { source: 'netz_in', target: 'bat_in',   value: d.netzZuSpeicher },
  ].filter(l => l.value > 0.001);

  // Keep only nodes that participate in at least one link
  const connected = new Set(rawLinks.flatMap(l => [l.source, l.target]));
  const nodes     = allNodes.filter(n => connected.has(n.name));

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter(params) {
        if (params.dataType === 'edge') {
          const src = allNodes.find(n => n.name === params.data.source)?.displayName
            ?? params.data.source;
          const tgt = allNodes.find(n => n.name === params.data.target)?.displayName
            ?? params.data.target;
          return `${src} → ${tgt}<br/><strong>${fmtKwh(params.data.value)}</strong>`;
        }
        // Node tooltip
        const nd = params.data;
        return `<strong>${nd.displayName}</strong><br/>${fmtKwh(nd.kwh)}`;
      },
    },
    series: [{
      type: 'sankey',
      data: nodes,
      links: rawLinks,
      orient: isMobile ? 'vertical' : 'horizontal',
      left: isMobile ? 24 : 130,
      right: isMobile ? 24 : 130,
      top: isMobile ? 78 : 28,
      bottom: isMobile ? 78 : 28,
      nodeWidth: isMobile ? 18 : 22,
      nodeGap: isMobile ? 18 : 16,
      layoutIterations: 32,
      emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'gradient', opacity: 0.45, curveness: 0.5 },
      label: {
        color: labelColor,
        fontSize: 13,
        fontWeight: 'bold',
        formatter(params) {
          const nd = params.data;
          return nd.displayName + '\n' + fmtKwh(nd.kwh);
        },
      },
    }],
  };
}

/** Build the common dual-axis stacked-bar and autarky line chart. */
function buildTimeSeriesOption(points, series, lineSeries) {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isMobile = isMobileViewport();
  const labelColor = isDark ? '#c9d1d9' : '#24292f';
  const gridColor = isDark ? '#30363d' : '#d8dee4';

  return {
    backgroundColor: 'transparent',
    color: series.map(item => item.color).concat(lineSeries.color),
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter(params) {
        const lines = [`<strong>${params[0].axisValueLabel}</strong>`];
        params.forEach(item => {
          const value = item.seriesName === lineSeries.name
            ? `${Number(item.value).toFixed(1)} %`
            : fmtKwh(Number(item.value));
          lines.push(`${item.marker}${item.seriesName}: ${value}`);
        });
        return lines.join('<br/>');
      },
    },
    legend: {
      top: 12,
      left: 'center',
      width: isMobile ? '92%' : undefined,
      itemGap: isMobile ? 8 : 10,
      textStyle: { color: labelColor, fontSize: 12 },
    },
    // Leave enough room for the legend, which can wrap on narrow screens.
    grid: {
      left: 62,
      right: 58,
      top: isMobile ? 126 : 100,
      bottom: 58,
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: points.map(point => point.label),
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: labelColor, rotate: points.length > 14 ? 45 : 0, interval: 'auto' },
    },
    yAxis: [
      {
        type: 'value',
        name: 'kWh',
        min: 0,
        axisLabel: { color: labelColor, formatter: value => `${value} kWh` },
        nameTextStyle: { color: labelColor },
        splitLine: { lineStyle: { color: gridColor } },
      },
      {
        type: 'value',
        name: '%',
        min: 0,
        max: 100,
        axisLabel: { color: labelColor, formatter: value => `${value} %` },
        nameTextStyle: { color: labelColor },
        splitLine: { show: false },
      },
    ],
    series: [
      ...series.map(item => ({
        name: item.name,
        type: 'bar',
        stack: 'energie',
        emphasis: { focus: 'series' },
        itemStyle: { color: item.color },
        data: points.map(point => +point.values[item.key].toFixed(3)),
      })),
      {
        name: lineSeries.name,
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 3 },
        itemStyle: { color: lineSeries.color },
        data: points.map(point => +point[lineSeries.key].toFixed(1)),
      },
    ],
  };
}

/* ── UI updates ─────────────────────────────────────────────── */

function updateNavControls() {
  document.getElementById('period-label').textContent = fmtPeriod();
  const prev = document.getElementById('btn-prev');
  const next = document.getElementById('btn-next');

  if (viewType === 'total') {
    prev.disabled = true;
    next.disabled = true;
  } else if (viewType === 'year') {
    prev.disabled = yearIdx() <= 0;
    next.disabled = yearIdx() >= availableYears.length - 1;
  } else {
    const idx  = monthIdx();
    prev.disabled = idx <= 0;
    next.disabled = idx >= availableMonths.length - 1;
  }
}

function updateStats(data) {
  // Autarkiegrad: household consumption supplied by PV or battery.
  const autarkie = data.eigenverbrauch > 0
    ? (data.solarZuHaushalt + data.speicherZuHaushalt) / data.eigenverbrauch * 100
    : 0;
  // Eigenverbrauchsquote: generated PV energy sent to household or battery.
  const eigenverbrauch = data.gesamtSolar > 0
    ? (data.solarZuHaushalt + data.solarZuSpeicher) / data.gesamtSolar * 100
    : 0;
  document.getElementById('autarkie-value').textContent = `${autarkie.toFixed(1)} %`;
  document.getElementById('eigenverbrauch-value').textContent = `${eigenverbrauch.toFixed(1)} %`;
}

/* ── Chart rendering ─────────────────────────────────────────── */

function disposeCharts() {
  [chart, householdChart, pvDistributionChart].forEach(instance => {
    if (instance) instance.dispose();
  });
  chart = null;
  householdChart = null;
  pvDistributionChart = null;
}

function getChartTabs() {
  return [...document.querySelectorAll('.chart-tab')];
}

function updateChartTabs() {
  getChartTabs().forEach(tab => {
    const name = tab.id.replace('tab-', '');
    const selected = name === activeChartTab;
    tab.setAttribute('aria-selected', selected);
    tab.tabIndex = selected ? 0 : -1;
    tab.classList.toggle('is-active', selected);
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
  });
}

function ensureChart(instance, elementId, theme) {
  return instance || echarts.init(document.getElementById(elementId), theme, { renderer: 'canvas' });
}

/** (Re-)render the active chart for the current period. */
function render() {
  const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : null;
  const mobile = isMobileViewport();
  if (lastTheme !== theme || lastMobile !== mobile) disposeCharts();
  lastTheme = theme;
  lastMobile = mobile;

  const rows = getCurrentRows();
  const data = aggregateRows(rows);
  const points = buildTimeSeries(rows);
  updateNavControls();
  updateStats(data);
  updateChartTabs();

  if (activeChartTab === 'sankey') {
    chart = ensureChart(chart, 'sankey-chart', theme);
    chart.setOption(buildSankeyOption(data), { notMerge: true });
    chart.resize();
  } else if (activeChartTab === 'haushalt') {
    householdChart = ensureChart(householdChart, 'household-chart', theme);
    householdChart.setOption(buildTimeSeriesOption(points, [
      { name: 'Solarstrom zu Haushalt', key: 'solarZuHaushalt', color: '#f5a623' },
      { name: 'Batterie zu Haushalt', key: 'speicherZuHaushalt', color: '#26c6da' },
      { name: 'Netzstrom zu Haushalt', key: 'netzZuHaushalt', color: '#5c6bc0' },
    ], { name: 'Autarkiegrad', key: 'autarkie', color: '#e91e63' }), { notMerge: true });
    householdChart.resize();
  } else if (activeChartTab === 'pv-verteilung') {
    pvDistributionChart = ensureChart(pvDistributionChart, 'pv-distribution-chart', theme);
    pvDistributionChart.setOption(buildTimeSeriesOption(points, [
      { name: 'Solarstrom zu Haushalt', key: 'solarZuHaushalt', color: '#f5a623' },
      { name: 'Solarstrom zu Speicher', key: 'solarZuSpeicher', color: '#26c6da' },
      { name: 'Solarstrom-Einspeisung', key: 'solarEinspeisung', color: '#42a5f5' },
    ], { name: 'Eigenverbrauchsquote', key: 'eigenverbrauchsquote', color: '#e91e63' }), { notMerge: true });
    pvDistributionChart.resize();
  }
}

function selectChartTab(tab, focus = false) {
  activeChartTab = tab;
  render();
  if (focus) document.getElementById(`tab-${tab}`).focus();
}

/* ── Period navigation ───────────────────────────────────────── */

function navigate(delta) {
  if (viewType === 'total') return;
  if (viewType === 'year') {
    const idx   = Math.max(0, Math.min(availableYears.length - 1, yearIdx() + delta));
    currentYear = availableYears[idx];
  } else {
    const idx    = Math.max(0, Math.min(availableMonths.length - 1, monthIdx() + delta));
    currentYear  = availableMonths[idx].year;
    currentMonth = availableMonths[idx].month;
  }
  render();
}

/* ── Screen transitions ──────────────────────────────────────── */

function showDashboard() {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('dashboard').style.display    = 'flex';
}

function showUpload() {
  document.getElementById('dashboard').style.display    = 'none';
  document.getElementById('upload-screen').style.display = '';
  hideError();
  disposeCharts();
  records         = [];
  availableYears  = [];
  availableMonths = [];
  firstDate       = null;
  lastDate        = null;
  activeChartTab  = 'sankey';
}

function showError(msg) {
  const el      = document.getElementById('upload-error');
  el.textContent = msg;
  el.hidden      = false;
}

function hideError() {
  document.getElementById('upload-error').hidden = true;
}

/* ── File loading ────────────────────────────────────────────── */

function loadFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('Bitte eine CSV-Datei auswählen (.csv).');
    return;
  }

  const reader = new FileReader();
  reader.onload = ({ target }) => {
    try {
      parseCSV(target.result);

      // Default view: latest year, year view
      viewType     = 'year';
      currentYear  = availableYears[availableYears.length - 1];
      currentMonth = null;
      activeChartTab = 'sankey';
      document.getElementById('view-type').value = 'year';

      showDashboard();
      // Use setTimeout(0) so the browser completes the display:flex reflow
      // before ECharts reads the container dimensions on first render.
      setTimeout(render, 0);
    } catch (err) {
      showError(err.message);
    }
  };
  reader.onerror = () => showError('Fehler beim Lesen der Datei.');
  reader.readAsText(file, 'utf-8');
}

/* ── Initialisation ──────────────────────────────────────────── */

function init() {
  const fileInput = document.getElementById('file-input');
  const dropZone  = document.getElementById('drop-zone');

  // ── Browse button via hidden file input ──────────────────────
  fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) loadFile(e.target.files[0]);
    fileInput.value = ''; // reset so same file can be re-loaded
  });

  // ── Drag-and-drop ─────────────────────────────────────────────
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    hideError();
    loadFile(e.dataTransfer.files[0]);
  });

  // ── Click anywhere in the drop zone (except the label / input) ─
  // Exclude the file input too: clicking the label fires a synthetic
  // click on the associated <input> which bubbles here; if we called
  // fileInput.click() again we would open a second dialog and the
  // browser would cancel or ignore the user's file selection.
  dropZone.addEventListener('click', e => {
    if (!e.target.closest('label') && e.target !== fileInput) {
      fileInput.click();
    }
  });

  // ── Keyboard accessibility for drop zone ─────────────────────
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // ── Period navigation ─────────────────────────────────────────
  document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
  document.getElementById('btn-next').addEventListener('click', () => navigate(+1));

  // ── Chart tabs ───────────────────────────────────────────────
  getChartTabs().forEach(tab => {
    const tabName = tab.id.replace('tab-', '');
    tab.addEventListener('click', () => selectChartTab(tabName));
    tab.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectChartTab(tabName);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const direction = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
        const visibleTabs = getChartTabs().filter(candidate => !candidate.hidden);
        const index = visibleTabs.indexOf(tab);
        const next = visibleTabs[(index + direction + visibleTabs.length) % visibleTabs.length];
        selectChartTab(next.id.replace('tab-', ''), true);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const visibleTabs = getChartTabs().filter(candidate => !candidate.hidden);
        const next = e.key === 'Home' ? visibleTabs[0] : visibleTabs.at(-1);
        selectChartTab(next.id.replace('tab-', ''), true);
      }
    });
  });

  // ── View-type switch (Jahr ↔ Monat) ──────────────────────────
  document.getElementById('view-type').addEventListener('change', e => {
    viewType = e.target.value;
    if (viewType === 'month') {
      // Default to the first available month of the current year
      const inYear = availableMonths.filter(m => m.year === currentYear);
      const target = inYear.length > 0 ? inYear[0] : availableMonths[0];
      currentYear  = target.year;
      currentMonth = target.month;
    } else {
      currentMonth = null;
    }
    render();
  });

  // ── Reload ────────────────────────────────────────────────────
  document.getElementById('btn-reload').addEventListener('click', showUpload);

  // ── Responsive chart resize ───────────────────────────────────
  // ResizeObserver fires when #chart-wrap changes size — including
  // when the dashboard transitions from display:none to display:flex,
  // which is exactly when ECharts may have been initialised at 0×0.
  const ro = new ResizeObserver(() => {
    if ((chart || householdChart || pvDistributionChart) && lastMobile !== isMobileViewport()) {
      render();
      return;
    }
    if (chart && activeChartTab === 'sankey') chart.resize();
    if (householdChart && activeChartTab === 'haushalt') householdChart.resize();
    if (pvDistributionChart && activeChartTab === 'pv-verteilung') pvDistributionChart.resize();
  });
  ['chart-wrap', 'household-chart-wrap', 'pv-distribution-chart-wrap']
    .forEach(id => ro.observe(document.getElementById(id)));
  window.addEventListener('resize', () => {
    if ((chart || householdChart || pvDistributionChart) && lastMobile !== isMobileViewport()) {
      render();
      return;
    }
    if (chart && activeChartTab === 'sankey') chart.resize();
    if (householdChart && activeChartTab === 'haushalt') householdChart.resize();
    if (pvDistributionChart && activeChartTab === 'pv-verteilung') pvDistributionChart.resize();
  });

  // ── OS theme change: re-init chart with correct ECharts theme ─
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (records.length > 0) render();
  });
}

document.addEventListener('DOMContentLoaded', init);
