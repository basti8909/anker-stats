# Solix Dashboard

Solix Dashboard is a browser-based viewer for Anker Solix energy-details CSV exports. It turns daily energy data into interactive energy-flow, supply, production, and savings views without uploading the CSV to an application server.

The project is a static website and is suitable for GitHub Pages or any other static host.

## Features

- Upload an Anker Solix CSV by choosing a file or dragging it onto the upload area
- Sankey energy-flow view for PV, battery, household consumption, grid import, and grid feed-in
- Household supply view with solar, battery, and grid contributions
- PV production view with household use, battery charging, and grid feed-in
- Savings view with configurable electricity price, feed-in tariff, and historical electricity-price periods
- Year, month, and total-range views with period navigation
- German and English user interface
- Responsive charts for desktop and mobile screens
- Automatic light/dark chart theme based on the operating-system preference
- Language and savings settings persisted in the browser

## Getting Started

### Use locally

1. Download or clone the repository.
2. Open `index.html` in a modern browser.
3. Export an energy-details CSV from the Anker Solix app and choose it, or drag it onto the upload area.

A local static server is also useful when previewing the project:

```text
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser. The project has no build step and no package manager is required.

### Use with GitHub Pages

GitHub Pages can serve this repository as a static site. Enable Pages for the repository and select the branch and folder containing `index.html`. No server-side runtime or build command is required.

The application loads Apache ECharts 5.5.1 and PapaParse 5.4.1 from jsDelivr. Internet access is therefore needed when those CDN resources are not already cached by the browser.

## Using the Dashboard

1. Export **Energy Details** from Anker Solix as a CSV file.
2. Choose the CSV file or drop it onto the upload screen.
3. Select `Year`, `Month`, or `Total` and use the navigation buttons where available.
4. Switch between the Energy flow, Supply, Production, and Savings tabs.
5. In Savings, enter the electricity price and optional feed-in tariff in `ct/kWh`.
6. Add historical price periods when the electricity price changed over time. A period ending on a date applies to days before that date; after the final period, the current electricity price is used.

The default electricity price is `30.0 ct/kWh`. The default feed-in tariff is `0.0 ct/kWh`.

## CSV Format

The parser currently targets the table structure produced by Anker Solix energy-details exports:

| Rows | Expected content |
| --- | --- |
| First definition row | A quoted description of calculated fields |
| Header row | Localized column names, such as `Datum` or `Date` |
| Following rows | One daily record per row |

Dates must use the export format `DD/MM/YYYY`, for example `03/07/2025`. Header labels may be German or English. The application identifies the header by structure and reads the supported values by column position, not by header text.

The relevant values include household usage, grid import, grid-to-household, grid-to-storage, solar-to-household, solar-to-storage, battery-to-household, utilized solar, total solar generation, and solar feed-in. Unsupported or differently structured CSV files are rejected with an error instead of being treated as arbitrary tables.

Sample exports are included for reference:

- [German sample CSV](sample/Solar%20zuhause_Energiedetails_3_Jul_2025_to_3_Jul_2026.csv)
- [English sample CSV](sample/Solar%20zuhause_Energy_Details_14_Jul_2025_to_14_Jul_2026.csv)

## How Values Are Calculated

The charts aggregate daily records for the selected period. The Sankey view uses these current application mappings:

- PV supplies the household, battery charging, or grid feed-in.
- Battery discharge supplies the household.
- Grid import supplies the household or battery charging.
- Autarky is the share of household usage supplied by solar or battery energy.
- Self-consumption is the share of total PV generation sent to the household or battery.

The Savings view calculates values day by day so historical electricity prices work correctly across selected periods:

- Direct PV value = solar-to-household energy × electricity price
- Battery value = battery-to-household energy × electricity price
- Export value = solar feed-in energy × electricity price when the feed-in tariff is zero
- Export value = solar feed-in energy × feed-in tariff when a positive feed-in tariff is configured

Prices are entered in `ct/kWh` and displayed savings are in euros. These formulas describe the application's current model and are not an energy-market settlement or accounting statement.

## Privacy and Data Handling

- CSV files are read and parsed in the browser.
- This repository does not provide an application backend or CSV upload endpoint.
- Language and savings preferences are stored in the browser's `localStorage`.
- ECharts and PapaParse are third-party libraries loaded from jsDelivr; their own licenses and terms apply separately.
- A network connection may be needed to load the CDN libraries. The application is not advertised as fully offline unless those resources are available locally or cached.

## Technology and Development

The project uses:

- Vanilla HTML, CSS, and JavaScript
- [Apache ECharts](https://echarts.apache.org/) 5.5.1 for charts
- [PapaParse](https://www.papaparse.com/) 5.4.1 for CSV parsing

The main files are `index.html`, `style.css`, and `app.js`. There is no build pipeline. Preview changes by opening `index.html` directly or by running a static server such as `python3 -m http.server 8000`.

When changing CSV fields, preserve the positional contract in `app.js` and update the CSV documentation. When adding time-series views, reuse the existing aggregation and shared time-series option builder where possible.

## Contributing

Bug reports and pull requests are welcome through the repository's GitHub issue and pull-request workflows. Please include a clear description of the observed behavior and, where possible, a minimal example or an anonymized CSV structure. Do not include personal energy data in public issues.

Before submitting a change, verify it with both sample CSV files and check the relevant desktop and mobile views.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

The project license does not change the licenses of Apache ECharts, PapaParse, or other third-party resources used by the application. Refer to each dependency's own license information for those terms.
