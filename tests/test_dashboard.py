import numpy as np
import pandas as pd
import pytest

from dcd import cleaner, compare, exporter, parser, profiler
from dcd.history import Session


def P(text):
    return parser.parse_csv("t.csv", text.encode())


def test_tc001_upload_validation():
    assert P("a,b\n1,2\n").shape == (1, 2)
    bad = [("x.txt", b"a\n1"), ("e.csv", b""), ("h.csv", b"a,b\n"), ("r.csv", b"a,b\n1,2,3\n"),
           ("big.csv", b"a\n" + b"1\n" * 5_300_000)]
    for name, data in bad:
        with pytest.raises(parser.ParseError):
            parser.parse_csv(name, data)


def test_tc002_missing_vs_literal_NA():
    df = P("a,b,c\n1,,NA\n2,x,\n3,y,z\n4,,\n5,w,v\n")
    assert df.shape == (5, 3) and df["c"][0] == "NA"
    assert df["b"].isna().sum() == 2 and df["c"].isna().sum() == 2


def test_tc003_profile():
    df = P("n,t\n1,a\n2,a\n3,\n4,b\n")
    assert profiler.numeric_stats(df["n"]) == {"count": 4, "min": 1.0, "max": 4.0, "mean": 2.5, "median": 2.5}
    p = profiler.profile(df).set_index("Column")
    assert p.loc["t", "Missing"] == 1 and p.loc["t", "Missing %"] == "25.00" and p.loc["t", "Distinct"] == 2
    sm = profiler.dataset_summary(df)
    assert sm["missing_cells"] == 1 and sm["completeness"] == 87.5 and sm["duplicate_rows"] == 0


def test_tc004_missing_treatment():
    df = P("a,b\n1,x\n,y\n3,\n")
    out, n = cleaner.apply_missing(df, "a", "constant", "0")
    assert out["a"].tolist() == ["1", "0", "3"] and n == 1 and out["b"].isna().sum() == 1
    assert cleaner.apply_missing(df, "a", "mean")[0]["a"].tolist() == ["1", "2", "3"]
    assert len(cleaner.apply_missing(df, "a", "drop")[0]) == 2
    with pytest.raises(cleaner.CleanError):
        cleaner.apply_missing(df, "b", "mean")


def test_tc005_duplicates():
    df = P("k\nA\nA\nB\nB\nB\n")
    assert cleaner.count_duplicates(df) == 3
    out, n = cleaner.remove_duplicates(df)
    assert out["k"].tolist() == ["A", "B"] and n == 3 and len(df) == 5


def test_tc006_conversion():
    df = P("v\n12\n15\nx\n")
    _, bad = cleaner.convert_preview(df["v"], "integer")
    assert bad.sum() == 1 and (~bad).sum() == 2
    assert cleaner.apply_conversion(df, "v", "integer", "keep")[0]["v"].tolist() == ["12", "15", "x"]
    assert cleaner.apply_conversion(df, "v", "integer", "missing")[0]["v"].isna().tolist() == [False, False, True]
    with pytest.raises(cleaner.CleanError):
        cleaner.apply_conversion(df, "v", "integer", "cancel")
    d = P("d\n2026-01-05\n05/01/2026\n")
    assert cleaner.convert_preview(d["d"], "date")[1].sum() == 1


def test_tc007_outliers_flag_only():
    df = P("v\n1\n2\n3\n4\n5\n100\n")
    before = df.copy()
    r = cleaner.iqr_outliers(df, "v")
    assert r["hi"] == 8.5 and r["mask"].tolist() == [False] * 5 + [True]
    pd.testing.assert_frame_equal(df, before)


def test_tc008_history_undo_reset():
    s = Session("t.csv", P("k,v\nA,1\nA,1\nB,\n,2\n"))
    for res, t, st_ in [(cleaner.apply_missing(s.working, "v", "constant", "7"), "v", "fill"),
                        (cleaner.remove_duplicates(s.working), "all", "dedupe")]:
        s.commit(res[0], t, st_, res[1])
    new, n = cleaner.apply_missing(s.working, "k", "drop")
    s.commit(new, "k", "drop", n)
    assert len(s.working) == 2 and len(s.history) == 3
    assert s.undo() and len(s.working) == 3 and len(s.history) == 2
    s.reset()
    pd.testing.assert_frame_equal(s.working, s.baseline)
    assert s.history == [] and not s.undo()


def test_tc009_compare():
    d = P("k,v\nA,1\nA,1\nB,\n")
    out, _ = cleaner.remove_duplicates(d)
    c = compare.compare(d, out).set_index("Metric")
    assert c.loc["Duplicate rows", "Change"] == "decreased by 1" and c.loc["Rows", "Change"] == "decreased by 1"
    assert "improv" not in " ".join(c["Change"]).lower()


def test_tc010_export_round_trip():
    df = pd.DataFrame({"a": ["x,y", 'say "hi"', "line1\nline2"], "b": ["1", np.nan, "3"]})
    pd.testing.assert_frame_equal(P(exporter.to_csv_bytes(df).decode()), df)
    assert exporter.default_filename("../data.csv") == "data_cleaned.csv"


def test_fr044_markers():
    df = parser.parse_csv("t.csv", b"a,b\n1,?\nNA,x\n", ("NA", "?"))
    assert df.isna().sum().sum() == 2
    assert parser.parse_csv("t.csv", b"a\nNA\n")["a"][0] == "NA"


def test_single_column_blank_rows_kept():
    df = parser.parse_csv("t.csv", b"a\n1\n\n3\n")
    assert len(df) == 3 and df["a"].isna().sum() == 1


def test_fr020_subset_duplicates():
    df = P("k,v\nA,1\nA,2\nB,3\n")
    assert cleaner.count_duplicates(df) == 0 and cleaner.count_duplicates(df, ["k"]) == 1
    assert cleaner.remove_duplicates(df, ["k"])[0]["v"].tolist() == ["1", "3"]


def test_fr030_outlier_treatment():
    df = P("v\n1\n2\n3\n4\n5\n100\n")
    assert len(cleaner.apply_outliers(df, "v", "remove")[0]) == 5
    assert cleaner.apply_outliers(df, "v", "cap")[0]["v"].tolist()[-1] == "8.5"
    assert bool(cleaner.apply_outliers(df, "v", "missing")[0]["v"].isna().tolist()[-1])
    assert df["v"].tolist()[-1] == "100"
