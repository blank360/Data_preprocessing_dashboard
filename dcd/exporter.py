"""CSV export (FR-037..040). Column/row order kept; quoting handled by the CSV writer."""
import os
import re

import pandas as pd


def to_csv_bytes(df: pd.DataFrame) -> bytes:
    return df.to_csv(index=False, na_rep="", lineterminator="\n").encode("utf-8")


def default_filename(src: str) -> str:
    stem = re.sub(r"[^\w.\- ]", "_", os.path.splitext(os.path.basename(src))[0]) or "data"
    return f"{stem}_cleaned.csv"


def safe_name(name: str) -> str:
    name = re.sub(r"[^\w.\- ]", "_", os.path.basename(name.strip())) or "cleaned"
    return name if name.lower().endswith(".csv") else name + ".csv"
