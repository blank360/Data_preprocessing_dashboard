
/*
 * Data Cleaning Dashboard - Core Logic
 *
 * Responsibilities:
 * - CSV parsing and dataset validation
 * - Data type inference and conversion
 * - Dataset profiling and duplicate detection
 * - Missing-value handling and outlier detection
 * - Dataset comparison and CSV export
 *
 * Pure functions with no DOM dependencies.
 * Supported environments: Browser (window.DCD) and Node.js.
 */

(function (root) {
    const D = {};

    // -------------------- Configuration --------------------

    D.LIMITS = {
        bytes: 10 * 1024 * 1024,
        rows: 100000,
        cols: 100,
    };

    const pad = (number) => String(number).padStart(2, "0");
    const INT = /^[-+]?\d+$/;

    // -------------------- CSV Parsing --------------------

    /*
     * Parses CSV data, supporting:
     * - Quoted fields
     * - Escaped double quotes
     * - Commas inside quoted fields
     * - Embedded newlines
     * - CRLF and LF line endings
     *
     * Blank lines are skipped.
     */

    D.parseCSV = function (text) {
        // Remove the UTF-8 BOM if present.
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }

        const rows = [];

        let row = [];
        let field = "";
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (inQuotes) {
                if (char === '"') {
                    // Handle escaped double quotes.
                    if (text[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += char;
                }

                continue;
            }

            // Start a quoted field.
            if (char === '"' && field === "") {
                inQuotes = true;
            } else if (char === ",") {
                row.push(field);
                field = "";
            } else if (char === "\n" || char === "\r") {
                // Treat CRLF as a single line ending.
                if (char === "\r" && text[i + 1] === "\n") {
                    i++;
                }

                // Skip blank lines.
                if (row.length || field !== "") {
                    row.push(field);
                    rows.push(row);
                }

                row = [];
                field = "";
            } else {
                field += char;
            }
        }

        if (inQuotes) {
            throw new Error(
                "Malformed CSV: a quoted field is never closed. " +
                "Fix the quotes and re-upload."
            );
        }

        // Process the final row.
        if (row.length || field !== "") {
            row.push(field);
            rows.push(row);
        }

        return rows;
    };

    // -------------------- Dataset Loading --------------------

    D.load = function (text) {
        const rows = D.parseCSV(text);

        if (rows.length < 2) {
            throw new Error(
                "File needs a header row and at least one data row."
            );
        }

        const columnCount = rows[0].length;

        // Every row must have the same number of fields.
        for (let i = 1; i < rows.length; i++) {
            if (rows[i].length !== columnCount) {
                throw new Error(
                    `Row ${i + 1} has ${rows[i].length} fields ` +
                    `but the header has ${columnCount}. ` +
                    "Fix the file and re-upload."
                );
            }
        }

        const dataRowCount = rows.length - 1;

        if (
            columnCount > D.LIMITS.cols ||
            dataRowCount > D.LIMITS.rows
        ) {
            throw new Error(
                `Dataset exceeds the limit of ${D.LIMITS.rows} rows ` +
                `x ${D.LIMITS.cols} columns.`
            );
        }

        return {
            columns: rows[0],
            rows: rows.slice(1),
        };
    };

    // -------------------- Shared Helpers --------------------

    // Create a deep-enough copy for a dataset of strings.
    const cloneDataset = (dataset) => ({
        columns: dataset.columns.slice(),
        rows: dataset.rows.map((row) => row.slice()),
    });

    // Check whether a value represents missing data.
    D.isMissing = (value, markers) =>
        value === "" || (markers || []).includes(value);

    // Convert a string to a number, or NaN if invalid.
    D.num = function (value) {
        const text = String(value).trim();

        const numericPattern =
            /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

        return numericPattern.test(text)
            ? Number(text)
            : NaN;
    };

    // -------------------- Date Parsing --------------------

    function validateDate(year, month, day) {
        const date = new Date(
            Date.UTC(year, month - 1, day)
        );

        const isValid =
            date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day;

        return isValid
            ? `${year}-${pad(month)}-${pad(day)}`
            : null;
    }

    D.parseDate = function (value, format) {
        const text = value.trim();
        let match;

        // DD/MM/YYYY
        if (
            format === "DD/MM/YYYY" &&
            (match = text.match(
                /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
            ))
        ) {
            return validateDate(
                +match[3],
                +match[2],
                +match[1]
            );
        }

        // MM/DD/YYYY
        if (
            format === "MM/DD/YYYY" &&
            (match = text.match(
                /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
            ))
        ) {
            return validateDate(
                +match[3],
                +match[1],
                +match[2]
            );
        }

        // YYYY-MM-DD
        if (
            (!format || format === "YYYY-MM-DD") &&
            (match = text.match(
                /^(\d{4})-(\d{2})-(\d{2})$/
            ))
        ) {
            return validateDate(
                +match[1],
                +match[2],
                +match[3]
            );
        }

        return null;
    };

    // -------------------- Type Conversion --------------------

    D.convertValue = function (value, type, format) {
        const text = value.trim();

        if (type === "text") {
            return value;
        }

        if (type === "integer") {
            return INT.test(text)
                ? String(parseInt(text, 10))
                : null;
        }

        if (type === "decimal") {
            const number = D.num(text);

            return isNaN(number)
                ? null
                : String(number);
        }

        if (type === "boolean") {
            const booleanValues = {
                true: "true",
                false: "false",
                yes: "true",
                no: "false",
                1: "true",
                0: "false",
            };

            return booleanValues[text.toLowerCase()] || null;
        }

        if (type === "date") {
            return D.parseDate(text, format);
        }

        return null;
    };

    D.TYPES = [
        "text",
        "integer",
        "decimal",
        "date",
        "boolean",
    ];

    // Infer a column's type without modifying its values.
    D.inferType = function (values) {
        if (!values.length) {
            return "text";
        }

        const trimmed = values.map((value) => value.trim());

        if (trimmed.every((value) => INT.test(value))) {
            // Preserve values such as 00123 as text.
            const hasLeadingZeros = trimmed.some(
                (value) => /^[-+]?0\d/.test(value)
            );

            return hasLeadingZeros ? "text" : "integer";
        }

        if (trimmed.every((value) => !isNaN(D.num(value)))) {
            return "decimal";
        }

        if (
            trimmed.every((value) =>
                /^(true|false)$/i.test(value)
            )
        ) {
            return "boolean";
        }

        if (values.every((value) => D.parseDate(value))) {
            return "date";
        }

        return "text";
    };

    // -------------------- Statistical Helpers --------------------

    /*
     * Linear interpolation between order statistics.
     * Equivalent to R type 7 / Excel QUARTILE.INC.
     *
     * Input must be a non-empty sorted array and p must be in [0, 1].
     */

    D.quantile = function (sortedValues, probability) {
        const position =
            (sortedValues.length - 1) * probability;

        const lowerIndex = Math.floor(position);
        const upperIndex = Math.ceil(position);

        return (
            sortedValues[lowerIndex] +
            (sortedValues[upperIndex] - sortedValues[lowerIndex]) *
            (position - lowerIndex)
        );
    };

    const median = (sortedValues) =>
        D.quantile(sortedValues, 0.5);

    const getColumnValues = (dataset, columnIndex, markers) =>
        dataset.rows
            .map((row) => row[columnIndex])
            .filter((value) => !D.isMissing(value, markers));

    // -------------------- Duplicate Detection --------------------

    /*
     * Returns zero-based indices of duplicate rows.
     * The first occurrence is retained.
     *
     * If no columns are supplied, all columns are compared.
     */

    D.dupIndices = function (dataset, columns) {
        const selectedColumns =
            columns && columns.length
                ? columns
                : dataset.columns.map((_, index) => index);

        const seen = new Set();
        const duplicateIndices = [];

        dataset.rows.forEach((row, index) => {
            const key = JSON.stringify(
                selectedColumns.map(
                    (columnIndex) => row[columnIndex]
                )
            );

            if (seen.has(key)) {
                duplicateIndices.push(index);
            } else {
                seen.add(key);
            }
        });

        return duplicateIndices;
    };

    // -------------------- Dataset Profiling --------------------

    D.profile = function (dataset, markers) {
        const rowCount = dataset.rows.length;

        const columns = dataset.columns.map((name, columnIndex) => {
            const values = getColumnValues(
                dataset,
                columnIndex,
                markers
            );

            const missingCount = rowCount - values.length;
            const type = D.inferType(values);

            const columnProfile = {
                name,
                missing: missingCount,
                missingPct: rowCount
                    ? (missingCount / rowCount) * 100
                    : null,
                distinct: new Set(values).size,
                type,
                stats: null,
            };

            // Calculate numeric statistics when applicable.
            if (
                ["integer", "decimal"].includes(type) &&
                values.length
            ) {
                const sortedValues = values
                    .map(Number)
                    .sort((a, b) => a - b);

                const sum = sortedValues.reduce(
                    (total, value) => total + value,
                    0
                );

                columnProfile.stats = {
                    count: sortedValues.length,
                    min: sortedValues[0],
                    max: sortedValues[sortedValues.length - 1],
                    mean: sum / sortedValues.length,
                    median: median(sortedValues),
                };
            }

            return columnProfile;
        });

        const totalCells = rowCount * dataset.columns.length;

        const missingCells = columns.reduce(
            (total, column) => total + column.missing,
            0
        );

        return {
            cols: columns,
            rows: rowCount,
            columns: dataset.columns.length,
            missingCells,
            completeness: totalCells
                ? (1 - missingCells / totalCells) * 100
                : null,
            duplicates: D.dupIndices(dataset).length,
        };
    };

    // -------------------- Missing-Value Handling --------------------

    D.fillMissing = function (
        dataset,
        { col, strategy, value },
        markers
    ) {
        const output = cloneDataset(dataset);
        let affected = 0;

        // Remove rows with missing values in the selected column.
        if (strategy === "remove") {
            output.rows = output.rows.filter(
                (row) => !D.isMissing(row[col], markers)
            );

            affected = dataset.rows.length - output.rows.length;

            return { ds: output, affected };
        }

        let fillValue;

        if (strategy === "constant") {
            if (value === undefined || value === "") {
                throw new Error(
                    "Enter a constant to replace missing values with."
                );
            }

            fillValue = value;
        } else if (
            strategy === "mean" ||
            strategy === "median"
        ) {
            const values = getColumnValues(
                dataset,
                col,
                markers
            );

            if (
                !values.length ||
                values.some((item) => isNaN(D.num(item)))
            ) {
                throw new Error(
                    "Mean/median needs a numeric column " +
                    "with at least one valid value."
                );
            }

            const sortedValues = values
                .map(Number)
                .sort((a, b) => a - b);

            const replacement =
                strategy === "mean"
                    ? sortedValues.reduce(
                        (total, number) => total + number,
                        0
                    ) / sortedValues.length
                    : median(sortedValues);

            fillValue = String(
                +replacement.toFixed(6)
            );
        } else {
            throw new Error("Unknown strategy.");
        }

        output.rows.forEach((row) => {
            if (D.isMissing(row[col], markers)) {
                row[col] = fillValue;
                affected++;
            }
        });

        return { ds: output, affected };
    };

    // -------------------- Duplicate Removal --------------------

    D.removeDuplicates = function (dataset, columns) {
        const duplicates = new Set(
            D.dupIndices(dataset, columns)
        );

        const output = cloneDataset(dataset);

        output.rows = output.rows.filter(
            (_, index) => !duplicates.has(index)
        );

        return {
            ds: output,
            affected: duplicates.size,
        };
    };

    // -------------------- Column Type Conversion --------------------

    D.convertColumn = function (
        dataset,
        { col, type, fmt, onFail },
        markers
    ) {
        if (!["cancel", "keep", "missing"].includes(onFail)) {
            throw new Error(
                "Choose how failed conversions are handled."
            );
        }

        const output = cloneDataset(dataset);

        let valid = 0;
        let invalid = 0;
        let changed = 0;

        const examples = [];

        output.rows.forEach((row) => {
            if (D.isMissing(row[col], markers)) {
                return;
            }

            const convertedValue = D.convertValue(
                row[col],
                type,
                fmt
            );

            if (convertedValue === null) {
                invalid++;

                if (examples.length < 5) {
                    examples.push(row[col]);
                }

                if (onFail === "missing") {
                    row[col] = "";
                    changed++;
                }

                return;
            }

            valid++;

            if (convertedValue !== row[col]) {
                changed++;
            }

            row[col] = convertedValue;
        });

        // Cancel the entire conversion if any values failed.
        if (onFail === "cancel" && invalid) {
            return {
                ds: dataset,
                affected: 0,
                valid,
                invalid,
                examples,
                cancelled: true,
            };
        }

        return {
            ds: output,
            affected: changed,
            valid,
            invalid,
            examples,
        };
    };

    // -------------------- Outlier Detection --------------------

    /*
     * Uses the 1.5 x IQR rule.
     * Diagnostic only: the dataset is never modified.
     */

    D.outliers = function (dataset, columnIndex, markers) {
        const numericPoints = [];

        dataset.rows.forEach((row, index) => {
            const value = row[columnIndex];

            if (D.isMissing(value, markers)) {
                return;
            }

            const number = D.num(value);

            if (!isNaN(number)) {
                numericPoints.push([index, number]);
            }
        });

        if (numericPoints.length < 4) {
            return {
                ok: false,
                reason:
                    "Need at least 4 numeric values to compute quartiles.",
                flagged: [],
            };
        }

        const sortedValues = numericPoints
            .map((point) => point[1])
            .sort((a, b) => a - b);

        const q1 = D.quantile(sortedValues, 0.25);
        const q3 = D.quantile(sortedValues, 0.75);
        const iqr = q3 - q1;

        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;

        const flagged = numericPoints
            .filter(
                ([, value]) =>
                    value < lowerBound || value > upperBound
            )
            .map(([index, value]) => ({
                row: index + 1,
                value,
            }));

        return {
            ok: true,
            q1,
            q3,
            iqr,
            lo: lowerBound,
            hi: upperBound,
            flagged,
        };
    };

    // -------------------- Comparison Metrics --------------------

    D.metrics = function (dataset, markers) {
        const profile = D.profile(dataset, markers);

        return {
            Rows: profile.rows,
            Columns: profile.columns,
            "Missing cells": profile.missingCells,
            "Duplicate rows": profile.duplicates,
            "Completeness %": profile.completeness,
        };
    };

    D.compare = function (original, current, markers) {
        const originalMetrics = D.metrics(original, markers);
        const currentMetrics = D.metrics(current, markers);

        return Object.keys(originalMetrics).map((metric) => {
            const originalValue = originalMetrics[metric];
            const currentValue = currentMetrics[metric];

            return {
                metric,
                original: originalValue,
                current: currentValue,
                change:
                    originalValue === null ||
                    currentValue === null
                        ? null
                        : currentValue - originalValue,
            };
        });
    };

    // -------------------- CSV Export --------------------

    D.toCSV = function (dataset) {
        const escapeCSVField = (value) => {
            const text = String(value);

            return /[",\r\n]/.test(text)
                ? '"' + text.replace(/"/g, '""') + '"'
                : text;
        };

        const rows = [
            dataset.columns,
            ...dataset.rows,
        ];

        return (
            rows
                .map((row) =>
                    row.map(escapeCSVField).join(",")
                )
                .join("\r\n") + "\r\n"
        );
    };

    // -------------------- Module Export --------------------

    if (typeof module !== "undefined") {
        module.exports = D;
    } else {
        root.DCD = D;
    }
})(typeof window !== "undefined" ? window : globalThis);
