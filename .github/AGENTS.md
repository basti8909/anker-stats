# AGENTS.md — Anker Solix Energieauswertung

> Repository-scoped instructions for AI coding agents working on this project.

---

## Project overview

A **pure static frontend** (no build step, no server required) that reads an Anker Solix energy details CSV export and renders an interactive **Sankey energy-flow diagram** and a **PV panel production pie chart** using Apache ECharts.

The user uploads a CSV file via drag-and-drop or file picker. The app parses it entirely in the browser, aggregates the daily rows by year, month, or total range, and draws a Sankey diagram showing how energy flows between sources (PV, Battery, Grid) and sinks (Battery charge, Household, Grid feed-in). A donut pie chart below the Sankey shows the proportional production contribution of each PV panel string (PV1–PV4) for the selected period. A CO₂ savings stat is shown below both charts. The UI language is German.

---

## File structure

```
/
├── index.html          Main HTML shell (upload screen + dashboard)
├── style.css           Styling; auto dark/light via prefers-color-scheme
├── app.js              All application logic (parse → aggregate → render)
├── .github/
│   ├── AGENTS.md       This file
│   └── skills/
│       └── grilling/   Grilling skill for design review
└── sample/
    ├── Solar zuhause_Energiedetails_3_Jul_2025_to_3_Jul_2026.csv
    └── sankey.webp     Reference image of target Sankey design
```

---

## CSV format — Anker Solix Energiedetails export

### File structure

| Row | Content |
|-----|---------|
| 0   | Quoted definition comment: `"Definition: Netzimport = …"` |
| 1   | Column headers |
| 2+  | Daily data rows (one row per calendar day) |

The app detects the header row by finding the first row where `row[0] === 'Datum'`.

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
| 15 | `Solarbank 3 E2700 Pro – PV1‑Erzeugung (kWh)` | PV string 1 generation — used in pie chart |
| 16 | `Solarbank 3 E2700 Pro – PV2‑Erzeugung (kWh)` | PV string 2 generation — used in pie chart |
| 17 | `Solarbank 3 E2700 Pro – PV3‑Erzeugung (kWh)` | PV string 3 generation — used in pie chart |
| 18 | `Solarbank 3 E2700 Pro – PV4‑Erzeugung (kWh)` | PV string 4 generation — used in pie chart |
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

### Adding new chart types
- Add a new section to `#dashboard` in `index.html`
- Create a dedicated `buildXxxOption(data)` function in `app.js`
- Re-use the existing `aggregate()` function; it returns sums for all Sankey and PV columns
- PV panel detail columns (15–18) are already parsed and available via `data.pv1`–`data.pv4` from `aggregate()`

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
- German month names are in the `DE_MONTHS` constant
- All UI strings are inline in `index.html` and `app.js`
- To add English, extract strings to a `LOCALE` object and switch based on a URL parameter or localStorage setting

The app supports three view types controlled by the `#view-type` select:
- **Jahr** (`viewType = 'year'`): aggregate all records for a given calendar year; navigate with prev/next.
- **Monat** (`viewType = 'month'`): aggregate records for a given month; navigate with prev/next.
- **Gesamt** (`viewType = 'total'`): aggregate all records across the entire CSV; prev/next buttons are disabled.

### Deployment
The app requires no build step. Copy `index.html`, `style.css`, and `app.js` to any static host (GitHub Pages, Netlify, Caddy, nginx, S3) and open `index.html`. It also works directly as a local `file://` URL.
