# Data Cleaning Dashboard

A web-based tool for inspecting and cleaning a single CSV dataset: find missing values, duplicates, type problems and outliers, apply cleaning operations you choose, compare before and after, and export the cleaned file.

Built for the KIIT Data Mining and Data Warehousing (DMDW) group project, following the project's Software Requirements Specification (SRS). It uses fixed, rule-based data-preprocessing operations. It does not train or use any machine-learning model (the SRS lists ML as out of scope).

## Features

| Area | What it does |
|---|---|
| **Upload** | One UTF-8 `.csv`, up to 10 MiB, 100,000 rows × 100 columns. Rejects bad files with a clear message and keeps the previous dataset. Optional extra missing-value markers (e.g. `NA`, `?`). |
| **Preview** | Paginated table (50 rows per page). Missing cells show as `<missing>`, so literal text like "NA" stays distinguishable. |
| **Profile** | Missing count and %, distinct count, inferred type (a suggestion only), numeric count/min/max/mean/median, dataset completeness, duplicate count. |
| **Clean: missing values** | Leave, remove rows, constant, mean or median (numeric columns only). |
| **Clean: duplicates** | Exact match on all columns or on selected columns; the first occurrence is kept. |
| **Clean: type conversion** | Text, integer, decimal, date (explicit format), boolean. Reports values that cannot convert; you choose cancel, keep original, or set to missing. |
| **Clean: outliers** | 1.5×IQR rule. Flagging never changes data; optional treatment (remove rows, cap at bounds, set to missing) needs confirmation. |
| **History / Undo / Reset** | Every applied operation is logged. Undo reverses the latest one; Reset restores the original upload after confirmation. |
| **Compare** | Original vs current: rows, columns, missing cells, duplicate rows, completeness. Changes are described, not judged. |
| **Export** | UTF-8 CSV of the current data with correct quoting; original file is never modified. |

Every change that removes rows or overwrites values shows its expected effect and needs an explicit confirmation. Each operation is applied to a copy and committed only if it succeeds, so a failure leaves your data unchanged.

## Tech stack

Python 3.10+, [Streamlit](https://streamlit.io) (UI), [pandas](https://pandas.pydata.org) and NumPy (data handling), pytest (tests). No database, accounts, cloud services or analytics; the data stays on your machine.

## Setup and run

```bash
# 1. (optional) create a virtual environment
python -m venv venv
venv\Scripts\activate          # Windows PowerShell
# source venv/bin/activate     # macOS / Linux

# 2. install dependencies
python -m pip install -r requirements.txt

# 3. start the app
python -m streamlit run app.py
```

The app opens at <http://localhost:8501>. Use `python -m streamlit ...` rather than plain `streamlit ...`; on Windows the `streamlit` command is often not on PATH.
To stop the app, press `Ctrl+C` in the terminal.

## Try it with sample data

| File | Purpose |
|---|---|
| `sample_students.csv` | 13 rows with one planted problem per feature (blank cell, literal NA, duplicate row, text in a numeric column, bad date, outlier). |
| `sample_employees_1000.csv` | 1,010 rows × 10 columns for a larger run, including duplicate rows, repeated emails, mixed date formats and salary outliers. |

Upload a file in the **Upload** section, then move through the sidebar: Preview → Profile → Clean → Compare → Export. See `USER_GUIDE.md` for a step-by-step guide.

## Tests and timing

```bash
python -m pytest tests      # automated tests for the cleaning logic
python benchmark.py         # timing for the SRS performance targets (PR-001 to PR-006)
```

Record manual acceptance results (full workflow, performance, network check, browser/keyboard check) in `TEST_RESULTS.md`.

## Project structure

```
app.py                 Streamlit user interface only
dcd/
  parser.py            upload validation and CSV parsing
  profiler.py          profiling and type inference
  cleaner.py           missing values, duplicates, type conversion, outliers
  history.py           baseline, working copy, operation log, undo, reset
  compare.py           before/after comparison
  exporter.py          CSV export
tests/                 automated tests
benchmark.py           performance timing script
.streamlit/config.toml upload limit and usage-statistics setting
USER_GUIDE.md          how to use the dashboard
TEST_RESULTS.md        acceptance-test and performance record (to fill in)
```

The modules are independent of the UI, so each can be tested on its own.

## Rules chosen where the SRS leaves a choice

- **Missing** means an empty cell, plus any markers you configure at upload. Other text such as `NA` stays text unless you add it as a marker.
- **Duplicates** are exact matches on the parsed text values; the first occurrence is kept.
- **Quartiles** use linear interpolation (the pandas default). Outliers lie outside Q1 − 1.5×IQR … Q3 + 1.5×IQR.
- **Dates** need an explicit format (default `%Y-%m-%d`) and are stored as `YYYY-MM-DD` after conversion.
- **Type inference** is only a suggestion; it recognises ISO dates and `true`/`false` booleans, and values are never converted until you ask.

## Limitations

- CSV only; one user and one dataset at a time.
- Data and history exist only for the current browser session; they are lost on reload. Export before leaving.
- Outlier flags can include legitimate values; mean/median imputation can distort distributions; duplicate detection is exact only.
- Undo keeps a full copy of the data per operation, so very large files with many operations use more memory.
- In a single-column file, a blank last line cannot be told apart from the end of the file and is not kept.
- Changing the missing-value markers re-reads the file and discards cleaning history.

## Project information

- **Course:** DMDW, KIIT
- **Guide:** Dr. Chitaranjan Pradhan
- **Group:** 3
- **Team:** _add member names here_
- **Specification:** project SRS (Software Requirements Specification), dated 15 October 2026
