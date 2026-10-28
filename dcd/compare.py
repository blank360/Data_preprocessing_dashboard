"""Before/after comparison (FR-035, 036): reports direction and size only, no quality verdict."""
import pandas as pd

from .profiler import dataset_summary

LABELS = [("rows", "Rows"), ("columns", "Columns"), ("missing_cells", "Missing cells"),
          ("duplicate_rows", "Duplicate rows"), ("completeness", "Completeness (%)")]


def compare(baseline, working) -> pd.DataFrame:
    a, b = dataset_summary(baseline), dataset_summary(working)
    rows = []
    for k, label in LABELS:
        x, y = a[k], b[k]
        if x is None or y is None:
            change = "N/A"
        elif y == x:
            change = "no change"
        else:
            change = f"{'increased' if y > x else 'decreased'} by {abs(y - x):g}"
        rows.append({"Metric": label, "Original": str(x), "Current": str(y), "Change": change})
    return pd.DataFrame(rows)
