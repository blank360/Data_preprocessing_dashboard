"""Upload validation and CSV parsing (FR-001..006, FR-044, NFR-006, NFR-015).
Missing = empty cell, plus any user-configured marker (exact match). Other text such as "NA" stays text."""
import csv
import io

import pandas as pd

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS, MAX_COLS = 100_000, 100


class ParseError(Exception):
    pass


def _reader(text):
    return csv.reader(io.StringIO(text, newline=""), strict=True)


def parse_csv(filename: str, data: bytes, markers=()) -> pd.DataFrame:
    if not filename.lower().endswith(".csv"):
        raise ParseError("Unsupported file type. Upload a .csv file.")
    if len(data) > MAX_BYTES:
        raise ParseError("File exceeds the 10 MiB limit. Upload a smaller file.")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ParseError("File is not valid UTF-8. Re-save it as UTF-8 CSV.")
    if not text.strip():
        raise ParseError("File is empty.")
    try:
        header = next(_reader(text))
        single = len(header) == 1
        if single:  # a blank line is a blank cell here; only trailing newlines are dropped
            text = text.rstrip("\r\n")
        if any(not h.strip() for h in header) or len(set(header)) != len(header):
            raise ParseError("Header row has empty or duplicate column names. Fix the header.")
        if len(header) > MAX_COLS:
            raise ParseError(f"More than {MAX_COLS} columns. Remove columns and retry.")
        reader = _reader(text)
        next(reader)
        n = 0
        for row in reader:
            if not row:
                if not single:
                    continue
                row = [""]
            n += 1
            if len(row) != len(header):
                raise ParseError(f"Data row {n} has {len(row)} fields; expected {len(header)}.")
    except csv.Error as e:
        raise ParseError(f"Malformed CSV (check quotes): {e}")
    if n == 0:
        raise ParseError("File has a header but no data rows.")
    if n > MAX_ROWS:
        raise ParseError(f"More than {MAX_ROWS:,} data rows. Split the file and retry.")
    na = [""] + [m for m in markers if m]
    try:
        return pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False, na_values=na,
                           skip_blank_lines=not single)
    except (pd.errors.ParserError, pd.errors.EmptyDataError, ValueError) as e:
        raise ParseError(f"Could not parse file: {e}")
