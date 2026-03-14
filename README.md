# Resident Tracker

Resident Tracker is a browser-based tool for analyzing neurosurgery resident case logs from a combined PDF export and generating comparison reports.

## What it does

- Uploads a consolidated resident case log PDF.
- Splits the PDF into resident-level records automatically.
- Maps residents to PGY year.
- Compares lead and lead-plus-senior totals against minimum requirements.
- Generates:
  - a grid-style BWH PDF export
  - a per-resident cohort performance PDF export
  - on-screen comparison and ranking views

## Expected input

The current workflow is built around a combined PDF case log file where:

- each resident section begins with `Resident:`
- formatting is preserved from the source ACGME/BWH-style report
- a resident may span multiple pages

Example input used during development:

- `UpdatedResidentLog.pdf`
- `ResMinDefCat160 2.13.26.pdf`

## Current cohort size

The app currently expects 21 residents.

- PGY7: 3
- PGY6: 3
- PGY5: 3
- PGY4: 3
- PGY3: 4
- PGY2: 3
- PGY1: 2

## Tech stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- `pdfjs-dist` for PDF parsing
- `jspdf` for PDF generation
- `xlsx` and `jszip` for template-based export support

## Local development

Requirements:

- Node.js
- npm

Run locally:

```sh
cd "/Users/andrew/Desktop/ResidentLogging/ResidentTracker/resident-success-tracker"
npm i
npm run dev
```

The dev server typically starts at:

```text
http://localhost:8080
```

## Build

Create a production build:

```sh
cd "/Users/andrew/Desktop/ResidentLogging/ResidentTracker/resident-success-tracker"
npm run build
```

Preview the built app locally:

```sh
npm run preview
```

## Share as a static app

This project can be shared as a static web app because it runs entirely in the browser.

Build output is written to:

```text
dist/
```

That folder can be zipped and shared directly, or hosted on a static hosting service such as:

- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages

## Key app files

- `src/pages/Index.tsx`
  - Main upload and reporting workflow.
- `src/lib/parseResidentData.ts`
  - PDF and Excel parsing logic.
- `src/lib/residentRoster.ts`
  - Resident-to-PGY mapping.
- `src/lib/compareResidents.ts`
  - Comparison and ranking logic.
- `src/lib/exportBwhTemplatePdf.ts`
  - Grid export PDF generation.
- `src/lib/exportPdf.ts`
  - Per-resident cohort performance PDF generation.

## Notes

- The app is optimized for the BWH-style case log format currently in use.
- Grid exports are built dynamically from uploaded residents and their PGY assignments.
- If resident names or PGY assignments change, update `src/lib/residentRoster.ts`.
