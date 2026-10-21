const assert = require("assert");
const D = require("../core.js");

let passedTests = 0;



function test(name, callback) {
    callback();
    passedTests++;

    console.log("PASS", name);
}


function createDataset(rows) {
    return {
        columns: rows[0],
        rows: rows.slice(1),
    };
}



test("TC-002: Literal NA stays text unless configured", () => {
    const dataset = D.load(
        "a,b\n" +
        "1,\n" +
        "NA,x\n"
    );


    assert.strictEqual(
        D.profile(dataset).cols[0].missing,
        0
    );


    assert.strictEqual(
        D.profile(dataset, ["NA"]).cols[0].missing,
        1
    );


    assert.strictEqual(
        D.profile(dataset).cols[1].missing,
        1
    );
});



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


    assert.strictEqual(dataset.rows[0][1], "");


    assert.throws(() =>
        D.fillMissing(dataset, {
            col: 0,
            strategy: "mean",
        })
    );
});



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


    const cancelled = D.convertColumn(dataset, {
        col: 0,
        type: "integer",
        onFail: "cancel",
    });

    assert.strictEqual(cancelled.ds, dataset);


    assert.throws(() =>
        D.convertColumn(dataset, {
            col: 0,
            type: "integer",
        })
    );
});



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


    assert.strictEqual(dataset.rows[5][0], "100");
});



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



test("Upload validation rejects malformed datasets", () => {

    assert.throws(() =>
        D.load("a,b\n1\n")
    );


    assert.throws(() =>
        D.load("a,b\n")
    );


    assert.throws(() =>
        D.load('a\n"open')
    );
});



console.log(`\n${passedTests} tests passed`);
