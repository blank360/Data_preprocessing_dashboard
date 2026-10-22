# Data Cleaning Dashboard
Setup: `pip install -r requirements.txt`, then `python -m streamlit run app.py`
Tests: `python -m pytest tests` · Timing: `python benchmark.py` · Docs: `USER_GUIDE.md`, `TEST_RESULTS.md`
Rules chosen: missing = empty cell + optional markers; duplicates = exact match (all or selected columns), first kept;
quartiles = linear interpolation (pandas default); dates need an explicit format (default %Y-%m-%d, stored as YYYY-MM-DD).
