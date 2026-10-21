
/*
 * Data Cleaning Dashboard - Core Tests
 *
 * Run: node tests/core.test.js
 *
 * Covers:
 * TC-002: Missing-value markers
 * TC-003: Dataset profiling
 * TC-004: Missing-value replacement
 * TC-005: Duplicate removal
 * TC-006: Column type conversion
 * TC-007: IQR-based outlier detection
 * TC-010: CSV export and round trip
 * Additional: Upload validation
 */

const assert = require("assert");
const D = require("../core.js");

let passedTests = 0;

// -------------------- Test Utilities --------------------

function test(name, callback) {
    callback();
    passedTests++;

    console.log("PASS", name);
}

// Build a dataset from a header row and data rows.
function createDataset(rows) {
    return {
        columns: rows[0],
        rows: rows.slice(1),
    };
}

// -------------------- TC-002: Missing-Value Markers --------------------

test("TC-002: Literal NA stays text unless configured", () => {
    const dataset = D.load(
        "a,b\n" +
        "1,\n" +
        "NA,x\n"
    );

    // NA is not missing by default.
    assert.strictEqual(
        D.profile(dataset).cols[0].missing,
        0
    );

    // NA is missing when explicitly configured.
    assert.strictEqual(
        D.profile(dataset, ["NA"]).cols[0].missing,
        1
    );

    // Empty cells are always considered missing.
    assert.strictEqual(
        D.profile(dataset).cols[1].missing,
        1
    );
});

// -------------------- TC-003: Dataset Profiling --------------------

test("TC-003: Profile calculates missing values and statistics", () => {
    const dataset = createDataset([
        ["v"],
        ["1"],
        ["2"],
        ["3"],
        [""],
    ]);

    const profile = D.profile(dataset);
    const column = profile.cols[0];

    assert.strictEqual(column.missing, 1);
    assert.strictEqual(column.missingPct, 25);

    assert.strictEqual(column.stats.mean, 2);
    assert.strictEqual(column.stats.median, 2);

    assert.strictEqual(profile.completeness, 75);
});

// -------------------- TC-004: Fill Missing Values --------------------

test("TC-004: Constant replacement works; mean rejects text", () => {
    const dataset = createDataset([
        ["a", "b"],
        ["x", ""],
        ["y", "5"],
    ]);

    const result = D.fillMissing(dataset, {
        col: 1,
        strategy: "constant",
        value: "0",
    });

    assert.strictEqual(result.affected, 1);
    assert.strictEqual(result.ds.rows[0][1], "0");

    // Original dataset must remain unchanged.
    assert.strictEqual(dataset.rows[0][1], "");

    // Mean replacement must reject a non-numeric column.
    assert.throws(() =>
        D.fillMissing(dataset, {
            col: 0,
            strategy: "mean",
        })
    );
});

// -------------------- TC-005: Duplicate Removal --------------------

test("TC-005: Removes duplicates and keeps first occurrences", () => {
    const dataset = createDataset([
        ["k"],
        ["A"],
        ["A"],
        ["B"],
        ["B"],
        ["B"],
    ]);

    const result = D.removeDuplicates(dataset);

    assert.strictEqual(result.affected, 3);

    assert.deepStrictEqual(result.ds.rows, [
        ["A"],
        ["B"],
    ]);
});

// -------------------- TC-006: Column Type Conversion --------------------

test("TC-006: Converts integers and handles failed conversions", () => {
    const dataset = createDataset([
        ["v"],
        ["12"],
        ["15"],
        ["x"],
    ]);

    const result = D.convertColumn(dataset, {
        col: 0,
        type: "integer",
        onFail: "missing",
    });

    assert.strictEqual(result.valid, 2);
    assert.strictEqual(result.invalid, 1);

    assert.strictEqual(result.ds.rows[2][0], "");

    // Cancellation must return the original dataset.
    const cancelled = D.convertColumn(dataset, {
        col: 0,
        type: "integer",
        onFail: "cancel",
    });

    assert.strictEqual(cancelled.ds, dataset);

    // Missing failure-handling strategy must be rejected.
    assert.throws(() =>
        D.convertColumn(dataset, {
            col: 0,
            type: "integer",
        })
    );
});

// -------------------- TC-007: Outlier Detection --------------------

test("TC-007: Detects outliers using the IQR method", () => {
    const dataset = createDataset([
        ["v"],
        ["1"],
        ["2"],
        ["3"],
        ["4"],
        ["5"],
        ["100"],
    ]);

    const result = D.outliers(dataset, 0);

    assert.strictEqual(result.q1, 2.25);
    assert.strictEqual(result.q3, 4.75);
    assert.strictEqual(result.hi, 8.5);

    assert.deepStrictEqual(result.flagged, [
        {
            row: 6,
            value: 100,
        },
    ]);

    // Outlier detection must not modify the dataset.
    assert.strictEqual(dataset.rows[5][0], "100");
});

// -------------------- TC-010: CSV Round Trip --------------------

test("TC-010: CSV round trip preserves special characters", () => {
    const dataset = createDataset([
        ["a", "b"],
        ["x,y", 'say "hi"'],
        ["line1\nline2", "ok"],
    ]);

    const csv = D.toCSV(dataset);
    const restoredDataset = D.load(csv);

    assert.deepStrictEqual(restoredDataset, dataset);
});

// -------------------- Upload Validation --------------------

test("Upload validation rejects malformed datasets", () => {
    // Inconsistent row lengths.
    assert.throws(() =>
        D.load("a,b\n1\n")
    );

    // Header without any data rows.
    assert.throws(() =>
        D.load("a,b\n")
    );

    // Unclosed quoted field.
    assert.throws(() =>
        D.load('a\n"open')
    );
});

// -------------------- Test Summary --------------------

console.log(`\n${passedTests} tests passed`);
