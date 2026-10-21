# Data Cleaning Dashboard (DMDW Project, KIIT)
Implements the baseline SRS: CSV upload, preview, profiling, missing values, duplicates, type conversion,
IQR outlier flags, operation history with undo/reset, before/after comparison, CSV export.
Runs fully in the browser; no server, database, account or internet needed (NFR-014, NFR-005).

## Run
Open `index.html` in Chrome/Edge/Firefox. Tests (Node 16+): `node tests/core.test.js`.
Try it with `sample_data.csv`.

## Files
| File | Role (SRS module) |
|---|---|
| `core.js` | Parsing, profiling, cleaning ops, outliers, comparison, export. Pure functions (NFR-008) |
| `app.js` | UI wiring, history, undo/reset, confirmations |
| `index.html` | Layout/styles (Upload, Preview, Profile, Clean, Compare, Export) |
| `tests/core.test.js` | Automated tests for TC-002 to TC-007, TC-010, upload validation |
| `sample_data.csv` | Demo data with missing values, duplicates, an outlier and a bad number |

## Design decisions (documented per SRS)
- Missing = empty cell, plus optional markers set in Upload tab. Literal "NA" is text unless configured.
- Duplicates: exact match on cell strings, all columns by default (optional column subset), first occurrence kept.
- Quartiles: linear interpolation (R type 7 / Excel QUARTILE.INC); fences Q1-1.5*IQR, Q3+1.5*IQR.
- Every operation builds a new dataset, so failures leave data unchanged; undo pops a snapshot, reset restores baseline.
- Type inference is advisory; integer-looking columns with leading zeros are inferred as text.

## Not included yet
Progress indicator (FR-043), outlier treatment (FR-030), performance/browser test report (TC-012, TC-014),
full user guide and traceability document. Should-have items, deferrable per SRS 6.3.

