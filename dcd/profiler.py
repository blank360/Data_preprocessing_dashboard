"""Profiling (FR-010..014). Type inference is advisory and never converts values."""
import numpy as np
import pandas as pd

INT_RE = r"^[+-]?(0|[1-9]\d*)$"
DATE_RE = r"^\d{4}-\d{2}-\d{2}$"


def is_numeric(s: pd.Series) -> bool:
    v = s.dropna()
    return len(v) > 0 and bool(np.isfinite(pd.to_numeric(v, errors="coerce")).all())


def infer_type(s: pd.Series) -> str:
    v = s.dropna().astype(str)
    if v.empty:
        return "text"
    if v.str.lower().isin(["true", "false"]).all():
        return "boolean"
    if is_numeric(v):
        return "integer" if v.str.match(INT_RE).all() else "decimal"
    if v.str.match(DATE_RE).all() and pd.to_datetime(v, format="%Y-%m-%d", errors="coerce").notna().all():
        return "date"
    return "text"


def numeric_stats(s: pd.Series) -> dict:
    x = pd.to_numeric(s.dropna())
    return {"count": int(len(x)), "min": float(x.min()), "max": float(x.max()),
            "mean": float(x.mean()), "median": float(x.median())}


def dataset_summary(df: pd.DataFrame) -> dict:
    r, c = df.shape
    cells = r * c
    miss = int(df.isna().sum().sum())
    return {"rows": r, "columns": c, "missing_cells": miss,
            "duplicate_rows": int(df.duplicated(keep="first").sum()),
            "completeness": round((1 - miss / cells) * 100, 2) if cells else None}


def profile(df: pd.DataFrame) -> pd.DataFrame:
    f = lambda v: f"{v:.6g}"
    rows = []
    for c in df.columns:
        s = df[c]
        miss, typ = int(s.isna().sum()), infer_type(s)
        r = {"Column": c, "Suggested type (inferred)": typ, "Missing": miss,
             "Missing %": f"{miss / len(df) * 100:.2f}", "Distinct": int(s.nunique(dropna=True))}
        if typ in ("integer", "decimal"):
            st_ = numeric_stats(s)
            r.update({"Count": str(st_["count"]), "Min": f(st_["min"]), "Max": f(st_["max"]),
                      "Mean": f(st_["mean"]), "Median": f(st_["median"])})
        else:
            r.update({k: "N/A" for k in ("Count", "Min", "Max", "Mean", "Median")})
        rows.append(r)
    return pd.DataFrame(rows)
