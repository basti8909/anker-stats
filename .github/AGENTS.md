# AGENTS.md — Anker Solix Energieauswertung

> Repository-scoped instructions for AI coding agents working on this project.

---

## Project overview

A **pure static frontend** (no build step; a server is optional for local preview) that reads an Anker Solix energy details CSV export and renders an interactive **Sankey energy-flow diagram** plus time-series views for household supply and PV distribution using Apache ECharts.

The user uploads a CSV file via drag-and-drop or file picker. The app parses it entirely in the browser, aggregates the daily rows by year, month, or total range, and draws a Sankey diagram showing how energy flows between sources (PV, Battery, Grid) and sinks (Battery charge, Household, Grid feed-in). Additional time-series views show household supply and the distribution of solar energy. The UI supports German and English.

The **Ersparnis** tab adds a persistent electricity price, optional feed-in tariff, and a date-based electricity-price schedule. It evaluates daily records so the selected month, year, or total range is always priced accurately across historical tariff changes.

---

## File structure

```
/
├── index.html          Main HTML shell (upload screen + dashboard)
├── style.css           Styling; auto dark/light via prefers-color-scheme
├── app.js              All application logic (parse → aggregate → render)
├── LICENSE             Apache License 2.0
├── README.md           Public project documentation
├── .github/
│   └── AGENTS.md       This file
└── sample/
    ├── Solar zuhause_Energiedetails_3_Jul_2025_to_3_Jul_2026.csv
    └── Solar zuhause_Energy_Details_14_Jul_2025_to_14_Jul_2026.csv
```

---

## CSV format — Anker Solix Energiedetails export

### File structure

| Row | Content |
|-----|---------|
| 0   | Quoted definition comment: `"Definition: Netzimport = …"` |
| 1   | Column headers |
| 2+  | Daily data rows (one row per calendar day) |

Header labels are localized by the Anker app and are not interpreted by the parser. The app detects the header row structurally: it must contain all columns used by the application, must not contain a date in column 0, and must be followed by a row whose column 0 contains a valid `DD/MM/YYYY` date. The German file `sample/Solar zuhause_Energiedetails_3_Jul_2025_to_3_Jul_2026.csv` and English file `sample/Solar zuhause_Energy_Details_14_Jul_2025_to_14_Jul_2026.csv` demonstrate the same positional layout with different header labels.

### Date format

`DD/MM/YYYY` (e.g. `03/07/2025`)

### Column reference

| Index | Header (German) | Meaning |
|-------|-----------------|---------|
| 0  | `Datum` | Date DD/MM/YYYY |
| 1  | `Eigenverbrauch (kWh)` | Total household self-consumption |
| 2  | `Verbrauch über Smart Plug (kWh)` | Smart Plug sub-consumption (always 0 in current exports) |
| 3  | `Netzimport (kWh)` | Total grid import (= col 4 + col 5) |
| 4  | `Netzstrom zu Haushalt (kWh)` | Grid energy delivered to household |
| 5  | `Netzstrom zu Speicher (kWh)` | Grid energy used to charge battery |
| 6  | `Solarstrom zu Haushalt (kWh)` | Solar energy delivered directly to household |
| 7  | `Solarstrom zu Speicher (kWh)` | Solar energy used to charge battery |
| 8  | `Speicherladung (kWh)` | Total battery charging (= col 7 + col 5) |
| 9  | `Speicherentladung (kWh)` | Total battery discharge (≈ col 10, slight conversion loss) |
| 10 | `Speicher zu Haushalt (kWh)` | Battery energy delivered to household |
| 11 | `Genutzte Solarenergie (kWh)` | Used solar energy (= col 1 − col 3) |
| 12 | `Gesamte Solarstromerzeugung (kWh)` | Total PV generation (= col 6 + col 7 + col 13) |
| 13 | `Solarstrom‑Einspeisung (kWh)` | Solar energy fed into grid |
| 14 | `Solarbank 3 E2700 Pro – Gesamterzeugung (kWh)` | Device total generation |
| 15–18 | PV panel generation columns | Present in the export but not used by the application |
| 19 | `CO₂‑Reduktion (kgCO₂/kWh)` | CO₂ saved = total PV × 0.363 |

> **Note on special characters:** column 13 uses a non-breaking hyphen (U+2011) in the CSV header. The app accesses all columns by index, not by name, so encoding issues do not affect parsing.

---

## Sankey diagram — flow mapping

```
Sources (left)          Flow               Sinks (right)
──────────────────────────────────────────────────────────
PV (Gesamt Solar)  ──┬─ Solarstrom zu Speicher  ──▶  Batterie (Ladung)
                     ├─ Solarstrom zu Haushalt  ──▶  Haushalt
                     └─ Solarstrom-Einspeisung  ──▶  Netz (Einspeisung)

Batterie (Entladung) ── Speicher zu Haushalt    ──▶  Haushalt

Netz (Import)      ──┬─ Netzstrom zu Haushalt   ──▶  Haushalt
                     └─ Netzstrom zu Speicher   ──▶  Batterie (Ladung)
```

### Node identifiers in code

| `name` (ECharts ID) | Display label | Side  | Colour   |
|---------------------|---------------|-------|----------|
| `pv`                | PV            | left  | `#f5a623` (yellow-orange) |
| `bat_out`           | Batterie      | left  | `#26c6da` (teal) |
| `netz_in`           | Netz          | left  | `#5c6bc0` (indigo) |
| `bat_in`            | Batterie      | right | `#26c6da` (teal) |
| `haushalt`          | Haushalt      | right | `#ab47bc` (purple) |
| `netz_out`          | Netz          | right | `#42a5f5` (light blue) |

> ECharts requires unique node `name` values, so battery and grid each appear as two separate nodes (source and sink). Display labels in the chart use `displayName`, not `name`.

### KPIs shown on nodes

| Node      | KPI label             | Formula |
|-----------|-----------------------|---------|
| PV        | Selbstverbrauchsquote | `Genutzte Solar / Gesamt Solar × 100` |
| Haushalt  | Solar-Anteil          | `(Solar zu Haushalt + Speicher zu Haushalt) / Eigenverbrauch × 100` |
| Netz out  | Einspeisungsquote     | `Einspeisung / Gesamt Solar × 100` |

---

## Tech stack

| Technology | Version | Usage |
|------------|---------|-------|
| Vanilla HTML/CSS/JS | — | No build step; works as `file://` |
| Apache ECharts | 5.5.1 (CDN) | Sankey chart rendering |
| PapaParse | 5.4.1 (CDN) | Robust CSV parsing |

Both CDN scripts are loaded from `cdn.jsdelivr.net`. An internet connection is required on first load (or when the browser cache is cold).

---

## Development guidelines

### Adding or changing charts
- Add a new section and tab wiring to `#dashboard` in `index.html`
- Re-use `aggregateRows()` and `buildTimeSeries(rows)` for data already represented by daily records
- Re-use `buildTimeSeriesOption(points, series, lineSeries)` for compatible household and PV time-series views
- Use a dedicated option builder when the chart has a different structure, as with `buildSankeyOption()` and `buildSavingsOption()`
- PV panel detail columns (15–18) are intentionally not parsed because the panel-level view was removed.

### Time-series charts
The household Supply and PV Production tabs both use `buildTimeSeries(rows)` for grouping and the shared `buildTimeSeriesOption(points, series, lineSeries)` renderer. Series definitions select the record keys, labels, colours, and percentage line for each view.

### Savings tab

The tab uses these parsed CSV values for every individual day:

| Display value | Formula |
|---------------|---------|
| PV | `solarZuHaushalt × electricityPriceCt / 100` |
| Battery | `speicherZuHaushalt × electricityPriceCt / 100` |
| PV export with `feedInTariffCt = 0` | `solarEinspeisung × electricityPriceCt / 100` |
| PV export with `feedInTariffCt > 0` | `solarEinspeisung × feedInTariffCt / 100` |

- Price state is stored in `localStorage` under `solix-dashboard-savings-v1` as `currentPriceCt`, `feedInTariffCt`, and `historicalPrices`.
- The default electricity price is `30.0` ct/kWh; the default feed-in tariff is `0.0` ct/kWh. Both must be non-negative.
- A price-schedule entry has an exclusive `until` date: an entry ending `2025-03-01` applies to days before 1 March 2025. After the final entry, the current electricity price applies.
- With a zero feed-in tariff, export remains grey and is excluded from the donut centre total. With a positive tariff, export has its own colour and is included in the centre total.

### Adding new columns from a future Anker export
1. Add the column index to the `COL` constant in `app.js`
2. Add the field to the `parsed.push({...})` object in `parseCSV()`
3. Add the field to the `sum()` calls in `aggregate()`
4. Update this AGENTS.md column table

### Changing the Sankey node layout
- `allNodes` in `buildSankeyOption()` defines order and colours
- Set `label.position: 'left'` for source nodes, `'right'` for sink nodes
- ECharts merges per-node `label` with the series-level `label` (including the formatter)
- Zero-value links are filtered; disconnected nodes are filtered automatically

### Internationalisation
- German and English translations live in the `TRANSLATIONS` object in `app.js`
- UI strings in `index.html` use `data-i18n` attributes; dynamic labels use `t(key)`
- Add every new user-facing string to both locale objects
- The selected locale is persisted in `localStorage` under `solix-dashboard-locale`

The app supports three view types controlled by the `#view-type` select:
- **Jahr** (`viewType = 'year'`): aggregate all records for a given calendar year; navigate with prev/next.
- **Monat** (`viewType = 'month'`): aggregate records for a given month; navigate with prev/next.
- **Gesamt** (`viewType = 'total'`): aggregate all records across the entire CSV; prev/next buttons are disabled.

### Deployment
The app requires no build step. Copy `index.html`, `style.css`, and `app.js` to any static host (GitHub Pages, Netlify, Caddy, nginx, S3) and open `index.html`. It also works directly as a local `file://` URL.
