"""Cleaning operations (FR-015..030). Every function works on a copy and returns
(new_df, affected) so a failure leaves the working dataset unchanged (atomic)."""
import numpy as np
import pandas as pd

from .profiler import is_numeric


class CleanError(Exception):
    pass


TYPES = ["text", "integer", "decimal", "date", "boolean"]
_TRUE = {"true", "t", "yes", "y", "1"}
_FALSE = {"false", "f", "no", "n", "0"}


def fmt_num(x: float) -> str:
    x = float(x)
    return str(int(x)) if x.is_integer() else repr(x)


# ---- missing values -------------------------------------------------------
def missing_check(df, col, strategy, value=None):
    n = int(df[col].isna().sum())
    if strategy in ("leave", "drop"):
        return (0 if strategy == "leave" else n), None
    if strategy == "constant":
        return n, (None if value else "Enter a non-empty constant value.")
    if strategy in ("mean", "median"):
        if not is_numeric(df[col]):
            return n, "Mean/median is unavailable: this column is not numeric or has no valid numeric values."
        return n, None
    return n, "Unknown strategy."


def apply_missing(df, col, strategy, value=None):
    affected, err = missing_check(df, col, strategy, value)
    if err:
        raise CleanError(err)
    out = df.copy()
    if strategy == "drop":
        out = out[out[col].notna()].reset_index(drop=True)
    elif strategy == "constant":
        out[col] = out[col].fillna(value)
    elif strategy in ("mean", "median"):
        x = pd.to_numeric(out[col].dropna())
        out[col] = out[col].fillna(fmt_num(x.mean() if strategy == "mean" else x.median()))
    return out, affected


# ---- duplicates (exact match on all columns, keep first) --------------------
def count_duplicates(df, cols=None) -> int:
    return int(df.duplicated(subset=list(cols) or None, keep="first").sum()) if cols else int(df.duplicated(keep="first").sum())


def remove_duplicates(df, cols=None):
    out = df.drop_duplicates(subset=list(cols) if cols else None, keep="first").reset_index(drop=True)
    return out, len(df) - len(out)


# ---- type validation / conversion -------------------------------------------
def convert_preview(s: pd.Series, target: str, fmt: str = "%Y-%m-%d"):
    """Return (converted series with NaN where invalid, boolean mask of invalid cells)."""
    if target not in TYPES:
        raise CleanError("Unsupported target type.")
    v = s.dropna().astype(str)
    if target == "text":
        conv = v
    elif target in ("integer", "decimal"):
        num = pd.to_numeric(v, errors="coerce")
        ok = np.isfinite(num)
        if target == "integer":
            ok &= num == num.round()
            conv = num[ok].round().astype("int64").astype(str).reindex(v.index)
        else:
            conv = v.where(ok)
    elif target == "date":
        conv = pd.to_datetime(v, format=fmt, errors="coerce").dt.strftime("%Y-%m-%d")
    else:
        low = v.str.strip().str.lower()
        conv = low.map({**{k: "True" for k in _TRUE}, **{k: "False" for k in _FALSE}})
    bad = pd.Series(False, index=s.index)
    bad[v.index[conv.isna().to_numpy()]] = True
    out = s.copy()
    out.loc[v.index] = conv
    return out, bad


def apply_conversion(df, col, target, policy, fmt="%Y-%m-%d"):
    conv, bad = convert_preview(df[col], target, fmt)
    if bad.any():
        if policy == "keep":
            conv = conv.where(~bad, df[col])
        elif policy != "missing":
            raise CleanError("Conversion cancelled: choose how to handle values that cannot be converted.")
    out = df.copy()
    out[col] = conv
    return out, int(df[col].notna().sum())


# ---- outliers: flag only, never modifies data -------------------------------
def iqr_outliers(df, col, k: float = 1.5) -> dict:
    if not is_numeric(df[col]):
        raise CleanError("Column is not numeric.")
    num = pd.to_numeric(df[col], errors="coerce")
    v = num.dropna()
    if len(v) < 4:
        raise CleanError("At least 4 numeric values are needed to compute quartiles; no outliers flagged.")
    q1, q3 = float(v.quantile(0.25)), float(v.quantile(0.75))
    iqr = q3 - q1
    lo, hi = q1 - k * iqr, q3 + k * iqr
    return {"q1": q1, "q3": q3, "iqr": iqr, "lo": lo, "hi": hi, "mask": (num < lo) | (num > hi)}


def apply_outliers(df, col, action, k: float = 1.5):
    """Optional treatment (FR-030): remove flagged rows, cap at the IQR bounds, or set to missing."""
    r = iqr_outliers(df, col, k)
    m, out = r["mask"], df.copy()
    if action == "remove":
        out = out[~m].reset_index(drop=True)
    elif action == "missing":
        out.loc[m, col] = np.nan
    elif action == "cap":
        out.loc[m, col] = pd.to_numeric(out.loc[m, col]).clip(r["lo"], r["hi"]).map(fmt_num)
    else:
        raise CleanError("Unknown outlier treatment.")
    return out, int(m.sum())
