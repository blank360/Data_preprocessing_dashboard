"""Timing for PR-001..006 (SRS 3.3). Run: python benchmark.py   Record the output and your machine specs."""
import platform
import time

import numpy as np
import pandas as pd

from dcd import cleaner, exporter, parser, profiler


def make(rows, cols=20, seed=0):
    rng = np.random.default_rng(seed)
    d = {}
    for i in range(cols):
        col = pd.Series(rng.integers(0, 1000, rows).astype(str) if i % 2 == 0
                        else rng.choice(list("abcde"), rows), dtype=object)
        col[rng.random(rows) < 0.05] = np.nan
        d[f"c{i}"] = col
    df = pd.DataFrame(d)
    k = rows // 20
    return pd.concat([df.iloc[: rows - k], df.iloc[:k]], ignore_index=True)  # last k rows are duplicates


def timed(fn):
    t = time.perf_counter()
    fn()
    return time.perf_counter() - t


small, big = make(10_000), make(100_000)
data_small = exporter.to_csv_bytes(small)
checks = [
    ("PR-001 upload + parse, 10,000×20", 5, timed(lambda: parser.parse_csv("a.csv", data_small))),
    ("PR-002 profile, 10,000×20", 5, timed(lambda: profiler.profile(small))),
    ("PR-003 duplicate detection, 100,000×20", 15, timed(lambda: cleaner.count_duplicates(big))),
    ("PR-004 missing-value replacement, 100,000×20", 10, timed(lambda: cleaner.apply_missing(big, "c1", "constant", "x"))),
    ("PR-006 export, 100,000×20", 15, timed(lambda: exporter.to_csv_bytes(big))),
]
print(f"Machine: {platform.platform()} | {platform.processor()} | Python {platform.python_version()} | pandas {pd.__version__}")
for name, limit, secs in checks:
    print(f"{name:50s} {secs:6.2f}s  (target {limit}s)  {'PASS' if secs <= limit else 'FAIL'}")
print("PR-005 (feedback within 1 s of starting an operation): check by hand; the app shows a spinner during every operation.")
