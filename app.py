"""Data Cleaning Dashboard. Run with:  streamlit run app.py"""
import pandas as pd
import streamlit as st

from dcd import cleaner, compare, exporter, parser, profiler
from dcd.history import Session

st.set_page_config(page_title="Data Cleaning Dashboard", layout="wide")
PAGE_SIZE = 50
STRATS = {"leave": "Leave unchanged", "drop": "Remove rows with a missing value in this column",
          "constant": "Replace with a constant", "mean": "Impute numeric mean", "median": "Impute numeric median"}
POLICIES = {"cancel": "Cancel conversion", "keep": "Keep original values for failures",
            "missing": "Convert failures to missing"}


def commit(s, fn, target, strategy):
    try:
        with st.spinner("Applying operation…"):
            new, n = fn()
    except Exception as e:
        st.error(f"Cleaning failed: {e} The dataset was not changed.")
        return
    s.commit(new, target, strategy, n)
    st.session_state["flash"] = f"Applied: {strategy} on {target} ({n} affected)."
    st.rerun()


def clean_missing(s):
    df, v = s.working, s.version
    col = st.selectbox("Column", list(df.columns), key=f"mc{v}")
    strat = st.selectbox("Strategy", list(STRATS), format_func=STRATS.get, key=f"ms{v}")
    val = st.text_input("Constant value", key=f"mv{v}") if strat == "constant" else None
    n, err = cleaner.missing_check(df, col, strat, val)
    st.write(f"Missing cells in **{col}**: {n}")
    if err:
        st.warning(err)
    elif strat != "leave":
        unit = "row(s) would be removed" if strat == "drop" else "cell(s) would be changed"
        st.write(f"Expected effect: {n} {unit}. Other columns are not changed.")
        k = f"{v}-{col}-{strat}"
        ok = st.checkbox("I confirm this change", key=f"mk{k}")
        label = STRATS[strat] + (f" ({val})" if strat == "constant" else "")
        if st.button("Apply", disabled=not ok, key=f"mb{k}"):
            commit(s, lambda: cleaner.apply_missing(df, col, strat, val), col, label)


def clean_duplicates(s):
    df, v = s.working, s.version
    cols = st.multiselect("Columns to compare (leave empty to use all columns)", list(df.columns), key=f"du{v}")
    n = cleaner.count_duplicates(df, cols)
    scope = ", ".join(cols) if cols else "all columns"
    st.write(f"Duplicate rows (exact match on {scope}): **{n}**")
    if n == 0:
        st.info("No duplicate rows found.")
        return
    st.write(f"Removing keeps the first occurrence of each group; {n} row(s) would be removed.")
    if cols:
        st.caption("Whole rows are removed, including values in columns you did not select.")
    k = f"{v}-{'|'.join(cols)}"
    ok = st.checkbox("I confirm removal", key=f"dk{k}")
    if st.button("Remove duplicates", disabled=not ok, key=f"db{k}"):
        commit(s, lambda: cleaner.remove_duplicates(df, cols), scope, "Remove exact duplicates")


def clean_convert(s):
    df, v = s.working, s.version
    col = st.selectbox("Column", list(df.columns), key=f"cc{v}")
    target = st.selectbox("Target type", cleaner.TYPES, key=f"ct{v}")
    fmt = "%Y-%m-%d"
    if target == "date":
        fmt = st.text_input("Date format (strptime, e.g. %d/%m/%Y)", fmt, key=f"cf{v}")
        st.caption("Converted dates are stored as YYYY-MM-DD.")
    try:
        _, bad = cleaner.convert_preview(df[col], target, fmt)
    except Exception as e:
        st.error(f"Cannot validate this conversion: {e} Check the target type and date format.")
        return
    total, nb = int(df[col].notna().sum()), int(bad.sum())
    st.write(f"Valid: **{total - nb}** · Cannot be converted: **{nb}** (of {total} non-missing values)")
    policy = None
    if nb:
        st.write("Examples of failing values:", df[col][bad].head(5).tolist())
        policy = st.radio("How should failed conversions be handled?", list(POLICIES),
                          format_func=POLICIES.get, index=None, key=f"cp{v}-{col}-{target}")
    ready = nb == 0 or policy in ("keep", "missing")
    k = f"{v}-{col}-{target}-{policy}"
    ok = st.checkbox("I confirm this conversion may overwrite values", key=f"ck{k}")
    if st.button("Apply conversion", disabled=not (ok and ready), key=f"cb{k}"):
        label = f"Convert to {target}" + (f" ({POLICIES[policy]})" if nb else "")
        commit(s, lambda: cleaner.apply_conversion(df, col, target, policy, fmt), col, label)


def clean_outliers(s):
    df = s.working
    cols = [c for c in df.columns if profiler.is_numeric(df[c])]
    if not cols:
        st.info("No numeric columns available.")
        return
    col = st.selectbox("Numeric column", cols, key="oc")
    try:
        r = cleaner.iqr_outliers(df, col)
    except cleaner.CleanError as e:
        st.warning(str(e))
        return
    st.write(f"Rule: flag values below Q1 − 1.5×IQR or above Q3 + 1.5×IQR.")
    st.write(f"Q1 = {r['q1']:g}, Q3 = {r['q3']:g}, IQR = {r['iqr']:g} → lower bound {r['lo']:g}, upper bound {r['hi']:g}")
    n = int(r["mask"].sum())
    st.write(f"Flagged candidate outliers: **{n}**. Flags are diagnostic; nothing changes unless you choose a treatment below.")
    if n:
        st.dataframe(df[r["mask"]].head(200))
        acts = {"none": "No action (flag only)", "remove": "Remove flagged rows",
                "cap": "Cap flagged values at the bounds", "missing": "Set flagged values to missing"}
        act = st.radio("Optional treatment", list(acts), format_func=acts.get, key=f"oa{s.version}-{col}")
        if act != "none":
            st.write(f"Expected effect: {n} " + ("row(s) removed." if act == "remove" else "value(s) changed."))
            k = f"{s.version}-{col}-{act}"
            ok = st.checkbox("I confirm this treatment", key=f"ok{k}")
            if st.button("Apply treatment", disabled=not ok, key=f"ob{k}"):
                commit(s, lambda: cleaner.apply_outliers(df, col, act), col, f"Outliers: {acts[act]}")


def history_controls(s):
    st.subheader("Operation history")
    if s.history:
        st.dataframe(pd.DataFrame(s.history), hide_index=True)
    else:
        st.caption("No operations applied yet.")
    c1, c2 = st.columns(2)
    if c1.button("Undo last operation", disabled=not s.history):
        s.undo()
        st.rerun()
    ok = c2.checkbox("Confirm reset to the original data", key=f"rk{s.version}")
    if c2.button("Reset to original", disabled=not ok):
        s.reset()
        st.rerun()


# ---------------------------------------------------------------- layout ---
st.title("Data Cleaning Dashboard")
s = st.session_state.get("sess")
page = st.sidebar.radio("Navigate", ["Upload", "Preview", "Profile", "Clean", "Compare", "Export"])
st.sidebar.warning("Session data and history are lost if the page is reloaded or the session ends. Export before leaving.")
if s:
    st.caption(f"**{s.name}** · {len(s.working):,} rows × {len(s.working.columns)} columns · "
               f"Working copy, {len(s.history)} operation(s) applied"
               + (f" · extra missing markers: {', '.join(s.markers)}" if s.markers else ""))

if page == "Upload":
    mk = st.text_input("Extra missing-value markers (optional, comma-separated, e.g. NA,?)", key="markers",
                       help="Cells exactly matching a marker are treated as missing. Changing this re-reads the file and discards cleaning history.")
    markers = tuple(m.strip() for m in mk.split(",") if m.strip())
    f = st.file_uploader("Select one UTF-8 CSV file (max 10 MiB, 100,000 rows × 100 columns)")
    if f is None:
        st.session_state.pop("last_upload", None)
    else:
        key = f"{f.name}:{f.size}:{markers}"
        if st.session_state.get("last_upload") != key:
            st.session_state["last_upload"] = key
            try:
                with st.spinner("Reading file…"):
                    df0 = parser.parse_csv(f.name, f.getvalue(), markers)
                st.session_state["sess"] = Session(f.name, df0, markers)
                st.session_state["upload_msg"] = ("ok", f"Loaded {f.name}.")
            except parser.ParseError as e:
                st.session_state["upload_msg"] = ("err", f"Upload failed: {e} Any previous dataset was kept.")
            st.rerun()
    kind, msg = st.session_state.get("upload_msg", (None, None))
    if kind == "ok":
        st.success(msg)
    elif kind == "err":
        st.error(msg)
elif s is None:
    st.info("Upload a CSV file first (Upload section).")
elif page == "Preview":
    df = s.working
    pages = max(1, -(-len(df) // PAGE_SIZE))
    p = st.number_input("Page", 1, pages, 1)
    st.caption(f"{len(df):,} rows × {len(df.columns)} columns. Missing cells are shown as <missing>.")
    st.dataframe(df.iloc[(p - 1) * PAGE_SIZE:p * PAGE_SIZE].fillna("<missing>"))
elif page == "Profile":
    sm = profiler.dataset_summary(s.working)
    c = st.columns(5)
    for col, (label, val) in zip(c, [("Rows", sm["rows"]), ("Columns", sm["columns"]),
                                      ("Missing cells", sm["missing_cells"]),
                                      ("Duplicate rows", sm["duplicate_rows"]),
                                      ("Completeness %", sm["completeness"])]):
        col.metric(label, val)
    st.caption("Types are inferred suggestions; values are not converted.")
    with st.spinner("Profiling…"):
        prof = profiler.profile(s.working)
    st.dataframe(prof, hide_index=True)
elif page == "Clean":
    if "flash" in st.session_state:
        st.success(st.session_state.pop("flash"))
    op = st.selectbox("Cleaning operation", ["Missing values", "Duplicates",
                                             "Type validation / conversion", "Outliers (flag only)"])
    {"Missing values": clean_missing, "Duplicates": clean_duplicates,
     "Type validation / conversion": clean_convert, "Outliers (flag only)": clean_outliers}[op](s)
    st.divider()
    history_controls(s)
elif page == "Compare":
    st.caption("Original (as parsed) vs current working data. Changes are described, not judged.")
    st.dataframe(compare.compare(s.baseline, s.working), hide_index=True)
elif page == "Export":
    name = st.text_input("File name", exporter.default_filename(s.name))
    try:
        with st.spinner("Preparing export…"):
            data = exporter.to_csv_bytes(s.working)
    except Exception as e:
        st.error(f"Export failed: {e} Your data is still in the session; try again.")
    else:
        st.download_button("Download cleaned CSV", data, file_name=exporter.safe_name(name), mime="text/csv")
