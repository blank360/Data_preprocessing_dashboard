# User Guide: Data Cleaning Dashboard

**Start:** `python -m streamlit run app.py` (browser opens at http://localhost:8501). Use the sidebar to move between sections.

**Upload.** Choose one UTF-8 `.csv` (max 10 MiB, 100,000 rows × 100 columns, one header row, same number of fields in every row).
Only empty cells count as missing. To treat other values (e.g. `NA`, `?`) as missing, type them comma-separated in the markers box
*before* uploading; changing them later re-reads the file and discards history. A failed upload never replaces the current data.

**Preview / Profile.** Browse 50 rows per page (missing cells show as `<missing>`). Profile shows missing %, distinct counts, an
*inferred* type (a suggestion only), numeric statistics, completeness and duplicate count.

**Clean.** Every change needs you to tick the confirmation box first and shows its expected effect.
- *Missing values:* leave, remove rows, constant, mean or median (numeric columns only).
- *Duplicates:* exact match on all columns, or on columns you select; the first occurrence is kept.
- *Type conversion:* text, integer, decimal, date (give a format such as `%d/%m/%Y`), boolean. Values that cannot convert are reported;
  choose to cancel, keep originals, or set them to missing.
- *Outliers:* values outside Q1 − 1.5×IQR … Q3 + 1.5×IQR are flagged only. Optionally remove the rows, cap values at the bounds, or set them to missing.
- *History:* every applied operation is listed. **Undo** reverses the latest one; **Reset** (with confirmation) restores the original upload.

**Compare / Export.** Compare shows original vs current counts. Export downloads the current data as UTF-8 CSV (original file is never modified).

**Limitations.** Data and history are lost when the page reloads. CSV only; one dataset at a time. Outlier flags can include legitimate
values; mean/median imputation can distort distributions; duplicates are exact matches only; type inference is a suggestion.
In a single-column file, a blank last line cannot be told apart from the end of the file and is not kept.
