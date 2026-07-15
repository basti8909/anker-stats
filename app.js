/* ══════════════════════════════════════════════════════════════
  Solix Dashboard  –  app.js
   ══════════════════════════════════════════════════════════════ */

'use strict';

/* ── CSV column indices ─────────────────────────────────────────
   Row 0 of the file is a definition comment (quoted string).
    Row 1 is the actual localized header: Date/Datum/etc., ...
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

const TRANSLATIONS = Object.freeze({
  de: {
    months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    upload: {
      subtitle: 'Energiediagramme aus CSV-Export',
      dropZone: 'CSV-Datei hier ablegen',
      or: 'oder',
      browse: 'Datei auswählen',
      dropZoneAria: 'CSV-Datei auswählen oder hier ablegen',
    },
    dashboard: {
      reload: 'Andere Datei laden',
      viewAria: 'Ansicht wählen',
      year: 'Jahr',
      month: 'Monat',
      total: 'Gesamt',
      previous: 'Vorheriger Zeitraum',
      next: 'Nächster Zeitraum',
      charts: 'Diagramme',
      energyFlow: 'Energiefluss',
      household: 'Versorgung',
      production: 'Erzeugung',
      savings: 'Ersparnis',
      autonomy: 'Autarkie',
      selfConsumption: 'Eigenverbrauch',
      language: 'Sprache',
      german: 'Deutsch',
      english: 'Englisch',
    },
    energy: { pv: 'PV', battery: 'Batterie', grid: 'Netz', household: 'Haushalt' },
    savings: {
      electricityPrice: 'Strompreis',
      feedInTariff: 'Einspeisevergütung',
      ctPerKwh: 'ct/kWh',
      priceSchedule: 'Strompreis nach Zeitraum',
      until: 'Bis',
      price: 'Preis',
      addPeriod: 'Zeitraum hinzufügen',
      removePeriod: 'Zeitraum entfernen',
      pvExport: 'PV export',
      unused: 'Nicht genutzt',
      totalSavings: 'Ersparnis',
    },
    series: {
      solarToHousehold: 'Solarstrom zu Haushalt',
      batteryToHousehold: 'Batterie zu Haushalt',
      gridToHousehold: 'Netzstrom zu Haushalt',
      solarToBattery: 'Solarstrom zu Speicher',
      solarFeedIn: 'Solarstrom-Einspeisung',
    },
    errors: {
      csvOnly: 'Bitte eine CSV-Datei auswählen (.csv).',
      invalidCsv: 'Keine gültige Anker Solix CSV-Datei – erwartete Tabellenstruktur nicht gefunden.',
      noRecords: 'Die CSV-Datei enthält keine auswertbaren Datensätze.',
      read: 'Fehler beim Lesen der Datei.',
    },
  },
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    upload: {
      subtitle: 'Energy diagrams from CSV export',
      dropZone: 'Drop CSV file here',
      or: 'or',
      browse: 'Choose file',
      dropZoneAria: 'Choose or drop a CSV file here',
    },
    dashboard: {
      reload: 'Load another file',
      viewAria: 'Choose view',
      year: 'Year',
      month: 'Month',
      total: 'Total',
      previous: 'Previous period',
      next: 'Next period',
      charts: 'Charts',
      energyFlow: 'Energy flow',
      household: 'Supply',
      production: 'Production',
      savings: 'Savings',
      autonomy: 'Self-sufficiency',
      selfConsumption: 'Self-consumption',
      language: 'Language',
      german: 'German',
      english: 'English',
    },
    energy: { pv: 'PV', battery: 'Battery', grid: 'Grid', household: 'Household' },
    savings: {
      electricityPrice: 'Electricity price',
      feedInTariff: 'Feed-in tariff',
      ctPerKwh: 'ct/kWh',
      priceSchedule: 'Electricity price by period',
      until: 'Until',
      price: 'Price',
      addPeriod: 'Add period',
      removePeriod: 'Remove period',
      pvExport: 'PV export',
      unused: 'Unused',
      totalSavings: 'Savings',
    },
    series: {
      solarToHousehold: 'Solar to household',
      batteryToHousehold: 'Battery to household',
      gridToHousehold: 'Grid to household',
      solarToBattery: 'Solar to battery',
      solarFeedIn: 'Solar feed-in',
    },
    errors: {
      csvOnly: 'Please choose a CSV file (.csv).',
      invalidCsv: 'Not a valid Anker Solix CSV file: expected table structure was not found.',
      noRecords: 'The CSV file contains no usable records.',
      read: 'Error reading the file.',
    },
  },
});

const SUPPORTED_LOCALES = Object.freeze(Object.keys(TRANSLATIONS));
const LOCALE_STORAGE_KEY = 'solix-dashboard-locale';
const SAVINGS_STORAGE_KEY = 'solix-dashboard-savings-v1';

const MOBILE_BREAKPOINT = 600;

/* ── Application state ──────────────────────────────────────── */
let records         = [];     // Array of parsed daily record objects
let availableYears  = [];     // Sorted number[]
let availableMonths = [];     // Sorted {year, month}[]
let firstDate       = null;   // Earliest date present in the CSV
let lastDate        = null;   // Latest date present in the CSV
let viewType        = 'year'; // 'year' | 'month' | 'total'
let currentLocale   = 'de';
let currentYear     = null;
let currentMonth    = null;   // 1–12 (only used in 'month' view)
let activeChartTab   = 'sankey';
let chart           = null;   // ECharts instance (Sankey)
let householdChart  = null;   // ECharts instance (household supply)
let pvDistributionChart = null; // ECharts instance (PV distribution)
let savingsChart = null; // ECharts instance (savings donut)
let currentPriceCt = 30;
let feedInTariffCt = 0;
let historicalPrices = [];
let priceScheduleDrafts = [];
let lastTheme;
let lastMobile;

function isMobileViewport() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function t(key) {
  const value = key.split('.').reduce((result, part) => result?.[part], TRANSLATIONS[currentLocale]);
  return value ?? key.split('.').reduce((result, part) => result?.[part], TRANSLATIONS.de) ?? key;
}

function normalizeLocale(locale) {
  const language = String(locale || '').toLowerCase().split('-')[0];
  return SUPPORTED_LOCALES.includes(language) ? language : null;
}

function detectLocale() {
  try {
    const stored = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    if (stored) return stored;
  } catch (_) {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
  const browserLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
  return browserLocales.map(normalizeLocale).find(Boolean) || 'de';
}

function applyTranslations() {
  document.documentElement.lang = currentLocale;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('.language-select').forEach(select => {
    select.value = currentLocale;
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });
}

function setLocale(locale, persist = true) {
  const normalized = normalizeLocale(locale);
  if (!normalized) return;
  currentLocale = normalized;
  if (persist) {
    try { localStorage.setItem(LOCALE_STORAGE_KEY, currentLocale); } catch (_) { /* Ignore unavailable storage. */ }
  }
  applyTranslations();
  updateSavingsInputs();
  renderPriceSchedule();
  if (records.length > 0) render();
}

/* ── Utilities ──────────────────────────────────────────────── */

/** Format kWh value; switches to MWh above 1000 kWh. */
function fmtKwh(kwh) {
  const format = value => new Intl.NumberFormat(currentLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  if (kwh >= 1000) return format(kwh / 1000) + ' MWh';
  return format(kwh) + ' kWh';
}

/** Format the current period as a human-readable string. */
function fmtPeriod() {
  if (viewType === 'year') return String(currentYear);
  if (viewType === 'month') return `${t('months')[currentMonth - 1]} ${currentYear}`;
  if (!firstDate || !lastDate) return '—';
  return `${fmtDate(firstDate)} - ${fmtDate(lastDate)}`;
}

function fmtDate(date) {
  return currentLocale === 'en'
    ? `${date.month}/${date.day}/${date.year}`
    : `${date.day}.${date.month}.${date.year}`;
}

function fmtCurrency(value) {
  return new Intl.NumberFormat(currentLocale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtPriceCt(value) {
  return new Intl.NumberFormat(currentLocale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function parsePriceCt(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseInputDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp
    : null;
}

function loadSavingsSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SAVINGS_STORAGE_KEY) || '{}');
    const storedPrice = parsePriceCt(stored.currentPriceCt);
    const storedTariff = parsePriceCt(stored.feedInTariffCt);
    currentPriceCt = storedPrice ?? 30;
    feedInTariffCt = storedTariff ?? 0;
    historicalPrices = Array.isArray(stored.historicalPrices)
      ? stored.historicalPrices
        .map(item => ({ until: item?.until, priceCt: parsePriceCt(item?.priceCt) }))
        .filter(item => parseInputDate(item.until) !== null && item.priceCt !== null)
        .sort((first, second) => first.until.localeCompare(second.until))
      : [];
    historicalPrices = historicalPrices.filter((item, index, items) => index === 0 || item.until !== items[index - 1].until);
  } catch (_) {
    currentPriceCt = 30;
    feedInTariffCt = 0;
    historicalPrices = [];
  }
  priceScheduleDrafts = historicalPrices.map(item => ({ until: item.until, price: fmtPriceCt(item.priceCt) }));
}

function saveSavingsSettings() {
  try {
    localStorage.setItem(SAVINGS_STORAGE_KEY, JSON.stringify({
      currentPriceCt,
      feedInTariffCt,
      historicalPrices,
    }));
  } catch (_) {
    // Saving remains optional when local storage is unavailable.
  }
}

function getPriceForDate(date) {
  const timestamp = Date.UTC(date.year, date.month - 1, date.day);
  const pricePeriod = historicalPrices.find(period => timestamp < parseInputDate(period.until));
  return pricePeriod ? pricePeriod.priceCt : currentPriceCt;
}

function calculateSavings(rows) {
  const useFeedInTariff = feedInTariffCt > 0;
  const totals = { pv: 0, battery: 0, export: 0 };

  rows.forEach(row => {
    const priceCt = getPriceForDate(row.date);
    totals.pv += row.solarZuHaushalt * priceCt / 100;
    totals.battery += row.speicherZuHaushalt * priceCt / 100;
    totals.export += row.solarEinspeisung * (useFeedInTariff ? feedInTariffCt : priceCt) / 100;
  });

  return {
    ...totals,
    useFeedInTariff,
    total: totals.pv + totals.battery + (useFeedInTariff ? totals.export : 0),
  };
}

function getExportLabel(useFeedInTariff) {
  return t(useFeedInTariff ? 'savings.pvExport' : 'savings.unused');
}

/* ── CSV Parsing ────────────────────────────────────────────── */

function parseCsvDate(raw) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(raw ?? '').trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;

  return { day, month, year };
}

/**
 * Parse the Anker Solix energy details CSV text.
 * Populates the global `records`, `availableYears`, `availableMonths`.
 * Throws on invalid format.
 */
function parseCSV(text) {
  const { data: rows } = Papa.parse(text, { skipEmptyLines: true });

  // Header labels are localized; the stable contract is column count and a date row after it.
  const headerIdx = rows.findIndex((row, index) =>
    row.length > COL.SOLAR_EINSPEISUNG
    && parseCsvDate(row[COL.DATUM]) === null
    && parseCsvDate(rows[index + 1]?.[COL.DATUM]) !== null
  );
  if (headerIdx === -1) {
    throw new Error(t('errors.invalidCsv'));
  }

  const parsed = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const date = parseCsvDate(row[COL.DATUM]);
    if (!date) continue;

    const n = idx => parseFloat(row[idx]) || 0;
    parsed.push({
      date,
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
    throw new Error(t('errors.noRecords'));
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
        : `${t('months')[month - 1].slice(0, 3)} ${year}`,
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
      displayName: t('energy.pv'),
      kwh: d.solarZuHaushalt + d.solarZuSpeicher + d.solarEinspeisung,
      itemStyle: { color: '#f5a623' },
      label: { position: isMobile ? 'top' : 'left' },
    },
    {
      name: 'bat_out',
      displayName: t('energy.battery'),
      kwh: d.speicherZuHaushalt,
      itemStyle: { color: '#26c6da' },
      label: { position: isMobile ? 'top' : 'left' },
    },
    {
      name: 'netz_in',
      displayName: t('energy.grid'),
      kwh: d.netzZuHaushalt + d.netzZuSpeicher,
      itemStyle: { color: '#5c6bc0' },
      label: { position: isMobile ? 'top' : 'left' },
    },
    {
      name: 'bat_in',
      displayName: t('energy.battery'),
      kwh: d.solarZuSpeicher + d.netzZuSpeicher,
      itemStyle: { color: '#26c6da' },
      label: { position: isMobile ? 'bottom' : 'right' },
    },
    {
      name: 'haushalt',
      displayName: t('energy.household'),
      kwh: d.solarZuHaushalt + d.speicherZuHaushalt + d.netzZuHaushalt,
      itemStyle: { color: '#ab47bc' },
      label: { position: isMobile ? 'bottom' : 'right' },
    },
    {
      name: 'netz_out',
      displayName: t('energy.grid'),
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

function buildSavingsOption(savings) {
  const exportColor = savings.useFeedInTariff ? '#5c6bc0' : '#8b949e';
  const exportLabel = getExportLabel(savings.useFeedInTariff);
  return {
    backgroundColor: 'transparent',
    color: ['#f5a623', '#26c6da', exportColor],
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: params => `<strong>${params.name}</strong><br/>${fmtCurrency(params.value)}`,
    },
    series: [{
      type: 'pie',
      radius: ['58%', '78%'],
      center: ['50%', '50%'],
      padAngle: 3,
      stillShowZeroSum: false,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderRadius: 3 },
      data: [
        { name: t('energy.pv'), value: +savings.pv.toFixed(4) },
        { name: t('energy.battery'), value: +savings.battery.toFixed(4) },
        { name: exportLabel, value: +savings.export.toFixed(4), itemStyle: { color: exportColor } },
      ],
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

function updateStats(data) {
  // Autarkie: household consumption supplied by PV or battery.
  const autarkie = data.eigenverbrauch > 0
    ? (data.solarZuHaushalt + data.speicherZuHaushalt) / data.eigenverbrauch * 100
    : 0;
  // Eigenverbrauch: generated PV energy sent to household or battery.
  const eigenverbrauch = data.gesamtSolar > 0
    ? (data.solarZuHaushalt + data.solarZuSpeicher) / data.gesamtSolar * 100
    : 0;
  document.getElementById('autarkie-value').textContent = `${autarkie.toFixed(1)} %`;
  document.getElementById('eigenverbrauch-value').textContent = `${eigenverbrauch.toFixed(1)} %`;
}

function updateSavingsInputs() {
  document.getElementById('electricity-price').value = fmtPriceCt(currentPriceCt);
  document.getElementById('feed-in-tariff').value = fmtPriceCt(feedInTariffCt);
}

function renderPriceSchedule() {
  const container = document.getElementById('price-schedule-rows');
  container.replaceChildren();

  priceScheduleDrafts.forEach((draft, index) => {
    const row = document.createElement('div');
    row.className = 'price-schedule-row';

    const until = document.createElement('input');
    until.type = 'date';
    until.value = draft.until;
    until.dataset.index = index;
    until.dataset.field = 'until';
    until.setAttribute('aria-label', t('savings.until'));

    const priceWrap = document.createElement('span');
    priceWrap.className = 'price-input-wrap';
    const price = document.createElement('input');
    price.type = 'text';
    price.inputMode = 'decimal';
    price.autocomplete = 'off';
    price.value = draft.price;
    price.dataset.index = index;
    price.dataset.field = 'price';
    price.setAttribute('aria-label', t('savings.price'));
    const unit = document.createElement('span');
    unit.textContent = t('savings.ctPerKwh');
    priceWrap.append(price, unit);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn-remove-price';
    remove.dataset.removeIndex = index;
    remove.setAttribute('aria-label', t('savings.removePeriod'));
    remove.textContent = 'x';

    row.append(until, priceWrap, remove);
    container.append(row);
  });
  syncPriceSchedule(false);
}

function syncPriceSchedule(persist = true) {
  const candidates = priceScheduleDrafts.map((draft, index) => ({
    index,
    until: draft.until,
    timestamp: parseInputDate(draft.until),
    priceCt: parsePriceCt(draft.price),
  }));
  const duplicates = new Set();
  candidates.forEach(candidate => {
    if (candidate.timestamp === null) return;
    if (candidates.some(other => other.index !== candidate.index && other.until === candidate.until)) {
      duplicates.add(candidate.index);
    }
  });

  historicalPrices = candidates
    .filter(candidate => candidate.timestamp !== null && candidate.priceCt !== null && !duplicates.has(candidate.index))
    .sort((first, second) => first.timestamp - second.timestamp)
    .map(candidate => ({ until: candidate.until, priceCt: candidate.priceCt }));

  candidates.forEach(candidate => {
    const valid = candidate.timestamp !== null && candidate.priceCt !== null && !duplicates.has(candidate.index);
    const row = document.querySelector(`.price-schedule-row:nth-child(${candidate.index + 1})`);
    if (row) {
      row.classList.toggle('is-invalid', !valid && (candidate.until || candidate.price));
      row.querySelectorAll('input').forEach(input => input.setAttribute('aria-invalid', String(!valid && (candidate.until || candidate.price))));
    }
  });

  if (persist) saveSavingsSettings();
}

function updateSavingsDisplay(savings) {
  document.getElementById('savings-pv-value').textContent = fmtCurrency(savings.pv);
  document.getElementById('savings-battery-value').textContent = fmtCurrency(savings.battery);
  document.getElementById('savings-export-value').textContent = fmtCurrency(savings.export);
  document.querySelector('#savings-export-item dt').textContent = getExportLabel(savings.useFeedInTariff);
  document.getElementById('savings-export-item').classList.toggle('is-tariff', savings.useFeedInTariff);
  document.getElementById('savings-total').textContent = `${t('savings.totalSavings')}\n${fmtCurrency(savings.total)}`;
}

function setSavingsPrice(input, type) {
  const priceCt = parsePriceCt(input.value);
  if (priceCt === null) {
    input.value = fmtPriceCt(type === 'electricity' ? currentPriceCt : feedInTariffCt);
    input.setAttribute('aria-invalid', 'true');
    return;
  }
  input.setAttribute('aria-invalid', 'false');
  if (type === 'electricity') currentPriceCt = priceCt;
  else feedInTariffCt = priceCt;
  input.value = fmtPriceCt(priceCt);
  saveSavingsSettings();
  if (records.length > 0 && activeChartTab === 'ersparnis') render();
}

/* ── Chart rendering ─────────────────────────────────────────── */

function disposeCharts() {
  [chart, householdChart, pvDistributionChart, savingsChart].forEach(instance => {
    if (instance) instance.dispose();
  });
  chart = null;
  householdChart = null;
  pvDistributionChart = null;
  savingsChart = null;
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
      { name: t('series.solarToHousehold'), key: 'solarZuHaushalt', color: '#f5a623' },
      { name: t('series.batteryToHousehold'), key: 'speicherZuHaushalt', color: '#26c6da' },
      { name: t('series.gridToHousehold'), key: 'netzZuHaushalt', color: '#5c6bc0' },
    ], { name: t('dashboard.autonomy'), key: 'autarkie', color: '#e91e63' }), { notMerge: true });
    householdChart.resize();
  } else if (activeChartTab === 'pv-verteilung') {
    pvDistributionChart = ensureChart(pvDistributionChart, 'pv-distribution-chart', theme);
    pvDistributionChart.setOption(buildTimeSeriesOption(points, [
      { name: t('series.solarToHousehold'), key: 'solarZuHaushalt', color: '#f5a623' },
      { name: t('series.solarToBattery'), key: 'solarZuSpeicher', color: '#26c6da' },
      { name: t('series.solarFeedIn'), key: 'solarEinspeisung', color: '#42a5f5' },
    ], { name: t('dashboard.selfConsumption'), key: 'eigenverbrauchsquote', color: '#e91e63' }), { notMerge: true });
    pvDistributionChart.resize();
  } else if (activeChartTab === 'ersparnis') {
    const savings = calculateSavings(rows);
    updateSavingsDisplay(savings);
    savingsChart = ensureChart(savingsChart, 'ersparnis-chart', theme);
    savingsChart.setOption(buildSavingsOption(savings), { notMerge: true });
    savingsChart.resize();
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
  viewType        = 'year';
  currentYear     = null;
  currentMonth    = null;
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
    showError(t('errors.csvOnly'));
    return;
  }

  const reader = new FileReader();
  reader.onload = ({ target }) => {
    try {
      parseCSV(target.result);

      // Default view: all available data
      viewType     = 'total';
      currentYear  = availableYears[availableYears.length - 1];
      currentMonth = null;
      activeChartTab = 'sankey';
      document.getElementById('view-type').value = 'total';

      showDashboard();
      // Use setTimeout(0) so the browser completes the display:flex reflow
      // before ECharts reads the container dimensions on first render.
      setTimeout(render, 0);
    } catch (err) {
      showError(err.message);
    }
  };
  reader.onerror = () => showError(t('errors.read'));
  reader.readAsText(file, 'utf-8');
}

/* ── Initialisation ──────────────────────────────────────────── */

function init() {
  currentLocale = detectLocale();
  applyTranslations();
  loadSavingsSettings();
  updateSavingsInputs();
  renderPriceSchedule();

  const fileInput = document.getElementById('file-input');
  const dropZone  = document.getElementById('drop-zone');

  document.querySelectorAll('.language-select').forEach(languageSelect => {
    languageSelect.addEventListener('change', e => setLocale(e.target.value));
  });

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

  // ── Savings controls ─────────────────────────────────────────
  document.getElementById('electricity-price').addEventListener('change', event => {
    setSavingsPrice(event.currentTarget, 'electricity');
  });
  document.getElementById('feed-in-tariff').addEventListener('change', event => {
    setSavingsPrice(event.currentTarget, 'feedIn');
  });
  document.getElementById('btn-add-price-period').addEventListener('click', () => {
    priceScheduleDrafts.push({ until: '', price: '' });
    renderPriceSchedule();
  });
  document.getElementById('price-schedule-rows').addEventListener('change', event => {
    const input = event.target;
    const index = Number(input.dataset.index);
    const field = input.dataset.field;
    if (!Number.isInteger(index) || !field || !priceScheduleDrafts[index]) return;
    priceScheduleDrafts[index][field] = input.value;
    if (field === 'price') {
      const priceCt = parsePriceCt(input.value);
      if (priceCt !== null) {
        priceScheduleDrafts[index].price = fmtPriceCt(priceCt);
        input.value = priceScheduleDrafts[index].price;
      }
    }
    syncPriceSchedule();
    if (records.length > 0 && activeChartTab === 'ersparnis') render();
  });
  document.getElementById('price-schedule-rows').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-index]');
    if (!button) return;
    priceScheduleDrafts.splice(Number(button.dataset.removeIndex), 1);
    renderPriceSchedule();
    saveSavingsSettings();
    if (records.length > 0 && activeChartTab === 'ersparnis') render();
  });

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
    if ((chart || householdChart || pvDistributionChart || savingsChart) && lastMobile !== isMobileViewport()) {
      render();
      return;
    }
    if (chart && activeChartTab === 'sankey') chart.resize();
    if (householdChart && activeChartTab === 'haushalt') householdChart.resize();
    if (pvDistributionChart && activeChartTab === 'pv-verteilung') pvDistributionChart.resize();
    if (savingsChart && activeChartTab === 'ersparnis') savingsChart.resize();
  });
  ['chart-wrap', 'household-chart-wrap', 'pv-distribution-chart-wrap', 'ersparnis-chart-wrap']
    .forEach(id => ro.observe(document.getElementById(id)));
  window.addEventListener('resize', () => {
    if ((chart || householdChart || pvDistributionChart || savingsChart) && lastMobile !== isMobileViewport()) {
      render();
      return;
    }
    if (chart && activeChartTab === 'sankey') chart.resize();
    if (householdChart && activeChartTab === 'haushalt') householdChart.resize();
    if (pvDistributionChart && activeChartTab === 'pv-verteilung') pvDistributionChart.resize();
    if (savingsChart && activeChartTab === 'ersparnis') savingsChart.resize();
  });

  // ── OS theme change: re-init chart with correct ECharts theme ─
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (records.length > 0) render();
  });
}

document.addEventListener('DOMContentLoaded', init);
