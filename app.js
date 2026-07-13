/* ══════════════════════════════════════════════════════════════
   Anker Solix Energieauswertung  –  app.js
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
  PV1:                  15,
  PV2:                  16,
  PV3:                  17,
  PV4:                  18,
  CO2:                  19,
});

const DE_MONTHS = Object.freeze([
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]);

/* ── Application state ──────────────────────────────────────── */
let records         = [];     // Array of parsed daily record objects
let availableYears  = [];     // Sorted number[]
let availableMonths = [];     // Sorted {year, month}[]
let viewType        = 'year'; // 'year' | 'month' | 'total'
let currentYear     = null;
let currentMonth    = null;   // 1–12 (only used in 'month' view)
let chart           = null;   // ECharts instance (Sankey)
let pvChart         = null;   // ECharts instance (PV pie)
let lastTheme       = undefined;

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
  const first = availableYears[0];
  const last  = availableYears[availableYears.length - 1];
  return first === last ? String(first) : `${first} – ${last}`;
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
      co2:                n(COL.CO2),
      pv1:                n(COL.PV1),
      pv2:                n(COL.PV2),
      pv3:                n(COL.PV3),
      pv4:                n(COL.PV4),
    });
  }

  if (parsed.length === 0) {
    throw new Error('Die CSV-Datei enthält keine auswertbaren Datensätze.');
  }

  records = parsed;

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
    co2:                sum('co2'),
    pv1:                sum('pv1'),
    pv2:                sum('pv2'),
    pv3:                sum('pv3'),
    pv4:                sum('pv4'),
  };
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
 * KPIs shown on nodes:
 *   PV        – Selbstverbrauchsquote = Genutzte Solar / Gesamt Solar
 *   Haushalt  – Solar-Anteil am Verbrauch = (Solar + Batterie) / Eigenverbrauch
 *   Netz out  – Einspeisungsquote = Einspeisung / Gesamt Solar
 */
function buildSankeyOption(d) {
  const isDark     = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const labelColor = isDark ? '#c9d1d9' : '#24292f';

  // ── KPIs ─────────────────────────────────────────────────────
  const svq = d.gesamtSolar    > 0 ? d.genutzeSolar / d.gesamtSolar * 100 : 0;
  const sa  = d.eigenverbrauch > 0
    ? (d.solarZuHaushalt + d.speicherZuHaushalt) / d.eigenverbrauch * 100
    : 0;
  const esq = d.gesamtSolar    > 0 ? d.solarEinspeisung / d.gesamtSolar * 100 : 0;

  // ── Node definitions ─────────────────────────────────────────
  // Custom properties (displayName, kwh, pct) are accessible in the
  // series-level label formatter via params.data.
  const allNodes = [
    {
      name: 'pv',
      displayName: 'PV',
      kwh: d.solarZuHaushalt + d.solarZuSpeicher + d.solarEinspeisung,
      pct: svq,
      itemStyle: { color: '#f5a623' },
      label: { position: 'left' },
    },
    {
      name: 'bat_out',
      displayName: 'Batterie',
      kwh: d.speicherZuHaushalt,
      itemStyle: { color: '#26c6da' },
      label: { position: 'left' },
    },
    {
      name: 'netz_in',
      displayName: 'Netz',
      kwh: d.netzZuHaushalt + d.netzZuSpeicher,
      itemStyle: { color: '#5c6bc0' },
      label: { position: 'left' },
    },
    {
      name: 'bat_in',
      displayName: 'Batterie',
      kwh: d.solarZuSpeicher + d.netzZuSpeicher,
      itemStyle: { color: '#26c6da' },
      label: { position: 'right' },
    },
    {
      name: 'haushalt',
      displayName: 'Haushalt',
      kwh: d.solarZuHaushalt + d.speicherZuHaushalt + d.netzZuHaushalt,
      pct: sa,
      itemStyle: { color: '#ab47bc' },
      label: { position: 'right' },
    },
    {
      name: 'netz_out',
      displayName: 'Netz',
      kwh: d.solarEinspeisung,
      pct: esq,
      itemStyle: { color: '#42a5f5' },
      label: { position: 'right' },
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
        let html = `<strong>${nd.displayName}</strong><br/>${fmtKwh(nd.kwh)}`;
        if (nd.pct !== undefined) html += `<br/>${nd.pct.toFixed(1)} %`;
        return html;
      },
    },
    series: [{
      type: 'sankey',
      data: nodes,
      links: rawLinks,
      orient: 'horizontal',
      nodeWidth: 22,
      nodeGap: 16,
      layoutIterations: 32,
      emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'gradient', opacity: 0.45, curveness: 0.5 },
      label: {
        color: labelColor,
        fontSize: 13,
        fontWeight: 'bold',
        formatter(params) {
          const nd = params.data;
          let text = nd.displayName + '\n' + fmtKwh(nd.kwh);
          if (nd.pct !== undefined) text += '\n' + nd.pct.toFixed(1) + ' %';
          return text;
        },
      },
    }],
  };
}

/* ── PV pie chart option builder ─────────────────────────────── */

/**
 * Build the ECharts pie/donut option for PV panel production breakdown.
 * Channels with zero production are excluded from the chart.
 */
function buildPieOption(d) {
  const isDark     = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const labelColor = isDark ? '#c9d1d9' : '#24292f';

  const channels = [
    { name: 'PV1', value: d.pv1, color: '#f5a623' },
    { name: 'PV2', value: d.pv2, color: '#42a5f5' },
    { name: 'PV3', value: d.pv3, color: '#66bb6a' },
    { name: 'PV4', value: d.pv4, color: '#ab47bc' },
  ].filter(c => c.value > 0.001);

  return {
    backgroundColor: 'transparent',
    title: {
      text: 'PV-Erzeugung nach Panel',
      left: 'center',
      top: 8,
      textStyle: { color: labelColor, fontSize: 13, fontWeight: 'bold' },
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter(params) {
        return `${params.name}<br/><strong>${fmtKwh(params.value)}</strong><br/>${params.percent} %`;
      },
    },
    legend: {
      bottom: '4%',
      left: 'center',
      textStyle: { color: labelColor, fontSize: 12 },
    },
    series: [{
      type: 'pie',
      radius: ['38%', '68%'],
      center: ['50%', '50%'],
      data: channels.map(c => ({
        name: c.name,
        value: +c.value.toFixed(3),
        itemStyle: { color: c.color },
      })),
      label: {
        color: labelColor,
        formatter: '{b}\n{d} %',
      },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,.3)' },
      },
    }],
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

function updateCO2Stat(co2) {
  const text = co2 >= 1000
    ? (co2 / 1000).toFixed(2) + ' t CO₂'
    : co2.toFixed(1) + ' kg CO₂';
  document.getElementById('co2-value').textContent = text;
}

/* ── Chart rendering ─────────────────────────────────────────── */

/**
 * (Re-)render the Sankey and PV pie chart for the current period.
 * Disposes and re-inits ECharts instances only when the OS theme changes.
 */
function render() {
  const isDark       = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme        = isDark ? 'dark' : null;
  const themeChanged = lastTheme !== theme;
  const el           = document.getElementById('sankey-chart');

  if (!chart || themeChanged) {
    if (chart) chart.dispose();
    chart     = echarts.init(el, theme, { renderer: 'canvas' });
    lastTheme = theme;
  }

  const data = viewType === 'total'
    ? aggregate()
    : viewType === 'year'
      ? aggregate(currentYear)
      : aggregate(currentYear, currentMonth);

  chart.setOption(buildSankeyOption(data), { notMerge: true });
  chart.resize();
  updateNavControls();
  updateCO2Stat(data.co2);

  // ── PV pie chart ─────────────────────────────────────────────
  const pvWrap = document.getElementById('pv-chart-wrap');
  const hasPV  = data.pv1 + data.pv2 + data.pv3 + data.pv4 > 0;
  pvWrap.style.display = hasPV ? '' : 'none';
  if (hasPV) {
    const pvEl = document.getElementById('pv-chart');
    if (!pvChart || themeChanged) {
      if (pvChart) pvChart.dispose();
      pvChart = echarts.init(pvEl, theme, { renderer: 'canvas' });
    }
    pvChart.setOption(buildPieOption(data), { notMerge: true });
    pvChart.resize();
  } else if (pvChart) {
    pvChart.dispose();
    pvChart = null;
  }
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
  if (chart)   { chart.dispose();   chart   = null; }
  if (pvChart) { pvChart.dispose(); pvChart = null; }
  records         = [];
  availableYears  = [];
  availableMonths = [];
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
    if (chart)   chart.resize();
    if (pvChart) pvChart.resize();
  });
  ro.observe(document.getElementById('chart-wrap'));
  ro.observe(document.getElementById('pv-chart-wrap'));
  window.addEventListener('resize', () => {
    if (chart)   chart.resize();
    if (pvChart) pvChart.resize();
  });

  // ── OS theme change: re-init chart with correct ECharts theme ─
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (records.length > 0) render();
  });
}

document.addEventListener('DOMContentLoaded', init);
