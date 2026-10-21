
(function () {
    const D = window.DCD;
    const $ = (selector) => document.querySelector(selector);
    const PAGE_SIZE = 50;

    let base = null;
    let work = null;
    let history = [];
    let fileName = "";
    let page = 0;
    let missingMarkers = [];

    const TABS = [
        "upload",
        "preview",
        "profile",
        "clean",
        "compare",
        "export",
    ];

    // -------------------- Utility Functions --------------------

    const escapeHTML = (value) =>
        String(value).replace(/[&<>"]/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
        })[char]);

    const formatValue = (value) => {
        if (value === null || value === undefined) {
            return "N/A";
        }

        return Number.isInteger(value)
            ? value
            : Number(value).toFixed(2);
    };

    const showMessage = (message, isError = false) => {
        const element = $("#msg");

        element.textContent =
            `${isError ? "Error: " : "Done: "}${message}`;

        element.className = isError ? "err" : "ok";
    };

    const runSafely = (callback) => {
        try {
            callback();
        } catch (error) {
            showMessage(error.message, true);
        }
    };

    const createTable = (headers, rows) => `
        <table>
            <tr>
                ${headers
                    .map((header) => `
                        <th>${escapeHTML(header)}</th>
                    `)
                    .join("")}
            </tr>

            ${rows
                .map((row) => `
                    <tr>
                        ${row
                            .map((cell) => `<td>${cell}</td>`)
                            .join("")}
                    </tr>
                `)
                .join("")}
        </table>
    `;

    const createOptions = (columns) =>
        columns
            .map((column, index) => `
                <option value="${index}">
                    ${escapeHTML(column)}
                </option>
            `)
            .join("");

    // -------------------- Navigation --------------------

    $("#nav").innerHTML = TABS
        .map((tab) => `
            <button data-t="${tab}">
                ${tab[0].toUpperCase() + tab.slice(1)}
            </button>
        `)
        .join("");

    function showTab(tabName) {
        TABS.forEach((tab) => {
            $("#" + tab).classList.toggle(
                "on",
                tab === tabName
            );
        });

        document.querySelectorAll("nav button").forEach((button) => {
            button.classList.toggle(
                "on",
                button.dataset.t === tabName
            );
        });
    }

    $("#nav").onclick = (event) => {
        const tabName = event.target.dataset.t;

        if (!tabName) return;

        if (!work && tabName !== "upload") {
            return showMessage("Upload a CSV first.", true);
        }

        showTab(tabName);
    };

    // -------------------- CSV Upload --------------------

    $("#file").onchange = async (event) => {
        const file = event.target.files[0];

        if (!file) return;

        if (!/\.csv$/i.test(file.name)) {
            return showMessage(
                `"${file.name}" is not a .csv file. Choose a CSV.`,
                true
            );
        }

        if (file.size > D.LIMITS.bytes) {
            return showMessage(
                "File is larger than 10 MiB. Reduce it and retry.",
                true
            );
        }

        try {
            const dataset = D.load(await file.text());

            base = dataset;
            work = dataset;
            history = [];
            fileName = file.name;
            page = 0;

            $("#fn").value =
                file.name.replace(/\.csv$/i, "") + "_cleaned.csv";

            render();
            showTab("preview");
            showMessage("Loaded " + file.name);
        } catch (error) {
            showMessage(
                error.message + " (existing dataset kept)",
                true
            );
        }
    };

    // -------------------- Missing-Value Configuration --------------------

    $("#mkb").onclick = () => {
        missingMarkers = $("#mk").value
            .split(",")
            .map((marker) => marker.trim())
            .filter(Boolean);

        if (work) render();

        showMessage(
            "Missing markers: " +
            (missingMarkers.join(", ") || "empty only")
        );
    };

    // -------------------- Dataset Rendering --------------------

    function render() {
        if (!work) return;

        const profile = D.profile(work, missingMarkers);
        const totalRows = work.rows.length;
        const totalColumns = work.columns.length;
        const totalPages = Math.max(
            1,
            Math.ceil(totalRows / PAGE_SIZE)
        );

        const start = page * PAGE_SIZE;
        const rows = work.rows.slice(start, start + PAGE_SIZE);

        $("#status").textContent = [
            fileName,
            `${totalRows} rows x ${totalColumns} columns`,
            history.length
                ? `${history.length} operation(s) applied`
                : "original state",
        ].join(" | ");

        $("#pg").textContent =
            `Page ${page + 1} of ${totalPages}`;

        // Preview table
        $("#ptab").innerHTML = createTable(
            ["#", ...work.columns],
            rows.map((row, index) => [
                start + index + 1,
                ...row.map((value) =>
                    D.isMissing(value, missingMarkers)
                        ? '<i class="m">(missing)</i>'
                        : escapeHTML(value)
                ),
            ])
        );

        // Dataset profile
        $("#pdata").innerHTML = `
            <p>
                Completeness: ${formatValue(profile.completeness)}%
                | Missing cells: ${profile.missingCells}
                | Duplicate rows: ${profile.duplicates}
            </p>
        ` + createTable(
            [
                "Column",
                "Type (inferred)",
                "Missing",
                "Missing %",
                "Distinct",
                "Count",
                "Min",
                "Max",
                "Mean",
                "Median",
            ],
            profile.cols.map((column) => {
                const stats = column.stats || {};

                return [
                    escapeHTML(column.name),
                    column.type,
                    column.missing,
                    formatValue(column.missingPct),
                    column.distinct,
                    ...["count", "min", "max", "mean", "median"].map(
                        (key) =>
                            column.stats
                                ? formatValue(stats[key])
                                : "N/A"
                    ),
                ];
            })
        );

        // Populate column selectors
        const options = createOptions(work.columns);

        ["#mc", "#tc", "#oc"].forEach((selector) => {
            const select = $(selector);
            const previousValue = select.value;

            select.innerHTML = options;

            if (previousValue) {
                select.value = previousValue;
            }
        });

        $("#dc").innerHTML = options;

        $("#tt").innerHTML = D.TYPES
            .map((type) => `<option>${type}</option>`)
            .join("");

        updateColumnInfo();

        // Original vs. current dataset
        $("#cmp").innerHTML = createTable(
            ["Metric", "Original", "Current", "Change"],
            D.compare(base, work, missingMarkers).map((result) => [
                result.metric,
                formatValue(result.original),
                formatValue(result.current),
                result.change === null
                    ? "N/A"
                    : (result.change > 0 ? "+" : "") +
                      formatValue(result.change),
            ])
        );

        // Operation history
        $("#hist").innerHTML = history
            .map((operation) => `
                <li>${escapeHTML(operation.record)}</li>
            `)
            .join("") || '<li><i class="m">No operations yet</i></li>';

        $("#undo").disabled = history.length === 0;
        $("#reset").disabled = history.length === 0;
    }

    // -------------------- Column Information --------------------

    function updateColumnInfo() {
        const columnIndex = +$("#mc").value;
        const column = D.profile(work, missingMarkers)
            .cols[columnIndex];

        const isNumeric = column &&
            ["integer", "decimal"].includes(column.type);

        [...$("#ms").options].forEach((option) => {
            if (["mean", "median"].includes(option.value)) {
                option.disabled = !isNumeric;
            }
        });

        if (
            !isNumeric &&
            ["mean", "median"].includes($("#ms").value)
        ) {
            $("#ms").value = "remove";
        }

        $("#minfo").textContent = column
            ? `Missing in this column: ${column.missing}. ` +
              (isNumeric
                  ? ""
                  : "Mean/median disabled: column is not numeric.")
            : "";
    }

    $("#mc").onchange = updateColumnInfo;

    // -------------------- Operation Commit / Undo --------------------

    function commitOperation(label, result) {
        const confirmed = confirm(
            `${label}\n` +
            `This will affect ${result.affected} row(s)/cell(s) ` +
            "and can be undone. Proceed?"
        );

        if (!confirmed) {
            return showMessage("Cancelled; data unchanged.");
        }

        history.push({
            dataset: work,
            record: `${label} (${result.affected} affected)`,
        });

        work = result.ds;
        page = 0;

        render();
        showMessage(label);
    }

    // -------------------- Fill Missing Values --------------------

    $("#mgo").onclick = () => runSafely(() => {
        const columnIndex = +$("#mc").value;
        const strategy = $("#ms").value;

        const result = D.fillMissing(
            work,
            {
                col: columnIndex,
                strategy,
                value: $("#mv").value,
            },
            missingMarkers
        );

        commitOperation(
            `Missing values in "${work.columns[columnIndex]}": ${strategy}`,
            result
        );
    });

    // -------------------- Remove Duplicates --------------------

    $("#dgo").onclick = () => runSafely(() => {
        const columns = [...$("#dc").selectedOptions]
            .map((option) => +option.value);

        const result = D.removeDuplicates(work, columns);

        if (!result.affected) {
            return showMessage("No duplicate rows found (0).");
        }

        const columnNames = columns.length
            ? columns.map((index) => work.columns[index]).join("+")
            : "all columns";

        commitOperation(
            `Remove duplicates on ${columnNames}`,
            result
        );
    });

    // -------------------- Convert Column Type --------------------

    $("#tgo").onclick = () => runSafely(() => {
        const columnIndex = +$("#tc").value;
        const type = $("#tt").value;

        const result = D.convertColumn(
            work,
            {
                col: columnIndex,
                type,
                fmt: $("#tf").value,
                onFail: $("#tm").value,
            },
            missingMarkers
        );

        $("#tinfo").textContent =
            `Valid: ${result.valid}, ` +
            `cannot convert: ${result.invalid}` +
            (result.examples.length
                ? ` (e.g. ${result.examples.join(", ")})`
                : "");

        if (result.cancelled) {
            return showMessage(
                "Conversion cancelled because some values failed; data unchanged."
            );
        }

        commitOperation(
            `Convert "${work.columns[columnIndex]}" to ${type}`,
            result
        );
    });

    // -------------------- Outlier Detection --------------------

    $("#ogo").onclick = () => {
        const columnIndex = +$("#oc").value;
        const result = D.outliers(
            work,
            columnIndex,
            missingMarkers
        );

        if (!result.ok) {
            $("#oinfo").innerHTML = escapeHTML(result.reason);
            return;
        }

        $("#oinfo").innerHTML = `
            <p>
                Q1=${formatValue(result.q1)},
                Q3=${formatValue(result.q3)},
                IQR=${formatValue(result.iqr)};
                flag values outside
                [${formatValue(result.lo)}, ${formatValue(result.hi)}].
                Flagged values are candidates, not errors;
                no data changed.
            </p>
        ` + (
            result.flagged.length
                ? createTable(
                    ["Row", "Value"],
                    result.flagged.map((item) => [
                        item.row,
                        escapeHTML(item.value),
                    ])
                )
                : "No outliers flagged."
        );
    };

    // -------------------- Undo / Reset --------------------

    $("#undo").onclick = () => {
        const previous = history.pop();

        if (!previous) return;

        work = previous.dataset;

        render();
        showMessage("Undid: " + previous.record);
    };

    $("#reset").onclick = () => {
        if (!confirm(
            "Restore the original uploaded data and clear history?"
        )) {
            return;
        }

        work = base;
        history = [];

        render();
        showMessage("Reset to original.");
    };

    // -------------------- Pagination --------------------

    $("#pp").onclick = () => {
        page = Math.max(0, page - 1);
        render();
    };

    $("#pn").onclick = () => {
        if ((page + 1) * PAGE_SIZE < work.rows.length) {
            page++;
            render();
        }
    };

    // -------------------- CSV Export --------------------

    $("#exp").onclick = () => {
        try {
            const csv = D.toCSV(work);
            const blob = new Blob(
                [csv],
                { type: "text/csv;charset=utf-8" }
            );

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = $("#fn").value || "cleaned.csv";
            link.click();

            URL.revokeObjectURL(url);
            showMessage("Exported " + link.download);
        } catch (error) {
            showMessage(
                "Export failed: " + error.message +
                " Retry; your data is intact.",
                true
            );
        }
    };

    // -------------------- Prevent Accidental Data Loss --------------------

    window.onbeforeunload = (event) => {
        if (!work) return;

        event.preventDefault();
        event.returnValue = "";
    };

    // -------------------- Initialization --------------------

    showTab("upload");
})();
