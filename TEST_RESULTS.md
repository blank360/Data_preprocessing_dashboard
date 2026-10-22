# Test results (fill in; record your machine and browser versions)
Machine / OS / RAM / CPU: ________  Browsers: Chrome ___ , Edge ___

## Automated (`python -m pytest tests`): covers the logic behind TC-001 to TC-010 plus FR-020, FR-030, FR-044 and single-column parsing
Result on your machine: ______ (expected: all pass)

## Manual (use `sample_students.csv`; Pass/Fail + notes)
| ID | What to check | Pass/Fail | Notes |
|---|---|---|---|
| TC-001–010 | Repeat each case in the UI (upload rules, NA vs blank, profile, missing, duplicates, conversion, outliers, undo/reset, compare, export) | | |
| TC-011 | Full workflow: upload → profile → clean → compare → export | | |
| TC-012 | Run `python benchmark.py`, paste output below | | |
| TC-013 | Browser DevTools → Network: no dataset content sent to outside hosts while using the app | | |
| TC-014 | Core workflow in two browsers and using the keyboard only | | |

## Performance output (`python benchmark.py`)
```
(paste here)
```
