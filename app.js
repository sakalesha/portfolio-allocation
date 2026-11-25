(function () {
  "use strict";

  const { ExactDecimal, PortfolioAllocator } = window;

  const STORAGE_KEY = "portfolio_allocator_state_v2";

  const PALETTE = [
    "#0F6B4E", // Forest Emerald
    "#B45309", // Burnished Amber
    "#1D4ED8", // Cobalt
    "#9F1239", // Crimson Rose
    "#0E7490", // Deep Cyan
    "#6D28D9", // Royal Violet
    "#3F6212", // Olive Moss
    "#334155"  // Slate
  ];

  const PRESETS = {
    techCore: {
      currency: "₹",
      fund: "100000",
      stocks: [
        { name: "NVDA", priority: "1", pct: "35", price: "142.50", brokerage: "0.05" },
        { name: "MSFT", priority: "2", pct: "30", price: "418.20", brokerage: "0.05" },
        { name: "AAPL", priority: "3", pct: "20", price: "228.75", brokerage: "0.05" },
        { name: "GOOGL", priority: "4", pct: "15", price: "176.40", brokerage: "0.05" }
      ]
    },
    dividendValue: {
      currency: "₹",
      fund: "250000",
      stocks: [
        { name: "HDFCBANK", priority: "1", pct: "40", price: "1742.50", brokerage: "1.25" },
        { name: "TCS", priority: "2", pct: "35", price: "4120.00", brokerage: "2.00" },
        { name: "ITC", priority: "3", pct: "25", price: "482.30", brokerage: "0.50" }
      ]
    },
    priorityTie: {
      currency: "₹",
      fund: "10000",
      stocks: [
        { name: "ALPHA", priority: "2", pct: "25", price: "310", brokerage: "1" },
        { name: "BETA", priority: "1", pct: "25", price: "600", brokerage: "0" },
        { name: "GAMMA", priority: "1", pct: "25", price: "150", brokerage: "0.5" },
        { name: "DELTA", priority: "3", pct: "25", price: "85", brokerage: "0" }
      ]
    },
    singleStock: {
      currency: "₹",
      fund: "25000",
      stocks: [
        { name: "NIFTYBEES", priority: "1", pct: "100", price: "268.40", brokerage: "0.10" }
      ]
    }
  };

  let nextId = 1;
  function makeRow(data) {
    return {
      id: `row_${nextId++}`,
      name: data.name ?? "",
      priority: String(data.priority ?? "1"),
      pct: String(data.pct ?? ""),
      price: String(data.price ?? ""),
      brokerage: String(data.brokerage ?? "0")
    };
  }

  function clonePreset(key) {
    const preset = PRESETS[key] || PRESETS.dividendValue;
    return {
      currency: preset.currency,
      fund: preset.fund,
      sortMode: "input",
      stocks: preset.stocks.map(makeRow)
    };
  }

  function loadInitialState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.stocks) && parsed.stocks.length > 0) {
          return {
            currency: typeof parsed.currency === "string" ? parsed.currency : "₹",
            fund: String(parsed.fund ?? "250000"),
            sortMode: parsed.sortMode === "priority" ? "priority" : "input",
            stocks: parsed.stocks.map(makeRow)
          };
        }
      }
    } catch (_) {
      // Ignore storage failures
    }
    return clonePreset("dividendValue");
  }

  function saveState() {
    try {
      const payload = {
        currency: state.currency,
        fund: state.fund,
        sortMode: state.sortMode,
        stocks: state.stocks.map(({ name, priority, pct, price, brokerage }) => ({
          name,
          priority,
          pct,
          price,
          brokerage
        }))
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {
      // Ignore storage failures
    }
  }

  let state = loadInitialState();
  let lastResult = null;
  let toastTimer = null;

  // DOM References
  const dom = {
    presetSelect: document.getElementById("preset-select"),
    currencySelect: document.getElementById("currency-select"),
    resetBtn: document.getElementById("reset-btn"),
    fundInput: document.getElementById("fund-input"),
    fundPrefix: document.getElementById("fund-currency-prefix"),
    fundError: document.getElementById("fund-error"),
    allocStatusBadge: document.getElementById("alloc-status-badge"),
    allocMeterTrack: document.getElementById("alloc-meter-track"),
    equalizeBtn: document.getElementById("equalize-btn"),
    fillRemainingBtn: document.getElementById("fill-remaining-btn"),
    validationBanner: document.getElementById("validation-banner"),
    stocksList: document.getElementById("stocks-list"),
    addStockBtn: document.getElementById("add-stock-btn"),
    priorityHint: document.getElementById("priority-hint"),

    kpiFund: document.getElementById("kpi-fund"),
    kpiStockCount: document.getElementById("kpi-stock-count"),
    kpiInvested: document.getElementById("kpi-invested"),
    kpiInvestedPct: document.getElementById("kpi-invested-pct"),
    kpiLeftoverR1: document.getElementById("kpi-leftover-r1"),
    kpiExtraShares: document.getElementById("kpi-extra-shares"),
    kpiBrokerage: document.getElementById("kpi-brokerage"),
    kpiBrokeragePct: document.getElementById("kpi-brokerage-pct"),
    kpiUnused: document.getElementById("kpi-unused"),
    kpiTotalShares: document.getElementById("kpi-total-shares"),

    deploymentEfficiency: document.getElementById("deployment-efficiency"),
    capitalStackBar: document.getElementById("capital-stack-bar"),
    legBase: document.getElementById("leg-base"),
    legExtra: document.getElementById("leg-extra"),
    legFee: document.getElementById("leg-fee"),
    legCash: document.getElementById("leg-cash"),
    weightComparisonList: document.getElementById("weight-comparison-list"),
    round2PoolBadge: document.getElementById("round2-pool-badge"),
    round2Cascade: document.getElementById("round2-cascade"),

    sortButtons: document.querySelectorAll(".seg-btn[data-sort]"),
    copyReportBtn: document.getElementById("copy-report-btn"),
    exportCsvBtn: document.getElementById("export-csv-btn"),
    printBtn: document.getElementById("print-btn"),
    reportTbody: document.getElementById("report-tbody"),
    reportTfoot: document.getElementById("report-tfoot"),
    toast: document.getElementById("toast"),
    footerStatus: document.getElementById("footer-status")
  };

  function colorForIndex(idx) {
    return PALETTE[idx % PALETTE.length];
  }

  function formatMoney(dec, decimals = 2) {
    const formatted = dec.format(decimals, true);
    return state.currency ? `${state.currency}${formatted}` : formatted;
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.hidden = true;
    }, 2600);
  }

  function syncCurrencyUI() {
    dom.currencySelect.value = state.currency;
    const prefixWrap = dom.fundPrefix.parentElement;
    if (state.currency) {
      dom.fundPrefix.textContent = state.currency;
      dom.fundPrefix.hidden = false;
      prefixWrap.classList.remove("no-prefix");
    } else {
      dom.fundPrefix.textContent = "";
      dom.fundPrefix.hidden = true;
      prefixWrap.classList.add("no-prefix");
    }
  }

  function renderStocksList() {
    const single = state.stocks.length === 1;
    dom.stocksList.innerHTML = "";

    state.stocks.forEach((stock, idx) => {
      const row = document.createElement("div");
      row.className = "stock-row";
      row.dataset.id = stock.id;
      row.setAttribute("role", "listitem");

      const color = colorForIndex(idx);

      row.innerHTML = `
        <div class="cell-wrap cell-name">
          <span class="cell-mobile-label">Stock / Symbol</span>
          <div class="stock-name-wrap">
            <span class="stock-dot" style="background:${color}" aria-hidden="true"></span>
            <input
              type="text"
              class="text-input"
              data-field="name"
              value="${escapeAttr(stock.name)}"
              placeholder="Stock ${idx + 1}"
              aria-label="Stock ${idx + 1} name or symbol"
            >
          </div>
          <span class="cell-err" data-err="name"></span>
        </div>

        <div class="cell-wrap">
          <span class="cell-mobile-label">Priority</span>
          <input
            type="text"
            inputmode="numeric"
            class="text-input input-num mono"
            data-field="priority"
            value="${single ? "1" : escapeAttr(stock.priority)}"
            ${single ? "disabled" : ""}
            aria-label="Priority for stock ${idx + 1}"
          >
          <span class="cell-err" data-err="priority"></span>
        </div>

        <div class="cell-wrap">
          <span class="cell-mobile-label">Alloc %</span>
          <input
            type="text"
            inputmode="decimal"
            class="text-input input-num mono"
            data-field="pct"
            value="${escapeAttr(stock.pct)}"
            placeholder="25"
            aria-label="Allocation percentage for stock ${idx + 1}"
          >
          <span class="cell-err" data-err="pct"></span>
        </div>

        <div class="cell-wrap">
          <span class="cell-mobile-label">Share Price</span>
          <input
            type="text"
            inputmode="decimal"
            class="text-input input-num mono"
            data-field="price"
            value="${escapeAttr(stock.price)}"
            placeholder="100.00"
            aria-label="Share price for stock ${idx + 1}"
          >
          <span class="cell-err" data-err="price"></span>
        </div>

        <div class="cell-wrap">
          <span class="cell-mobile-label">Brokerage / sh</span>
          <input
            type="text"
            inputmode="decimal"
            class="text-input input-num mono"
            data-field="brokerage"
            value="${escapeAttr(stock.brokerage)}"
            placeholder="0.00"
            aria-label="Brokerage per share for stock ${idx + 1}"
          >
          <span class="cell-err" data-err="brokerage"></span>
        </div>

        <div class="cell-wrap cell-remove">
          <button
            type="button"
            class="icon-btn"
            data-action="remove"
            ${single ? "disabled" : ""}
            title="${single ? "At least one stock is required" : `Remove ${stock.name || `Stock ${idx + 1}`}`}"
            aria-label="Remove stock ${idx + 1}"
          >×</button>
        </div>
      `;

      dom.stocksList.appendChild(row);
    });

    dom.priorityHint.innerHTML = single
      ? "Single stock mode: priority is locked to <code>1</code>."
      : "Priority <code>1</code> = highest. Ties preserve input order.";
  }

  function escapeAttr(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function updateAllocationMeter(pctSum) {
    const numSum = pctSum.toNumber();
    const diff = ExactDecimal.HUNDRED.sub(pctSum);
    dom.allocMeterTrack.setAttribute("aria-valuenow", String(Math.min(100, Math.max(0, numSum))));

    // Build segmented visual bar
    dom.allocMeterTrack.innerHTML = "";
    const scaleDenom = Math.max(100, numSum || 100);
    state.stocks.forEach((s, idx) => {
      const val = ExactDecimal.from(s.pct);
      if (!val || !val.isPositive()) return;
      const seg = document.createElement("div");
      seg.className = "meter-segment";
      seg.style.width = `${(val.toNumber() / scaleDenom) * 100}%`;
      seg.style.backgroundColor = colorForIndex(idx);
      seg.title = `${s.name || `Stock ${idx + 1}`}: ${val.format(2, false)}%`;
      dom.allocMeterTrack.appendChild(seg);
    });

    dom.allocStatusBadge.classList.remove("is-valid", "is-warn", "is-error");
    if (pctSum.eq(ExactDecimal.HUNDRED)) {
      dom.allocStatusBadge.textContent = "100.00% ✓";
      dom.allocStatusBadge.classList.add("is-valid");
    } else if (diff.isPositive()) {
      dom.allocStatusBadge.textContent = `${pctSum.format(2, false)}% (${diff.format(2, false)}% left)`;
      dom.allocStatusBadge.classList.add("is-warn");
    } else {
      dom.allocStatusBadge.textContent = `${pctSum.format(2, false)}% (${diff.mul(-1).format(2, false)}% over)`;
      dom.allocStatusBadge.classList.add("is-error");
    }
  }

  function applyValidationUI(result) {
    const fundErrObj = result.errors?.find((e) => e.field === "fund");
    dom.fundInput.classList.toggle("is-invalid", Boolean(fundErrObj));
    dom.fundError.textContent = fundErrObj ? fundErrObj.message : "";

    const rows = dom.stocksList.querySelectorAll(".stock-row");
    rows.forEach((row) => {
      const id = row.dataset.id;
      const errs = result.stockErrors?.get(id) || {};
      ["priority", "pct", "price", "brokerage"].forEach((field) => {
        const input = row.querySelector(`[data-field="${field}"]`);
        const errSpan = row.querySelector(`[data-err="${field}"]`);
        if (input && errSpan) {
          input.classList.toggle("is-invalid", Boolean(errs[field]));
          errSpan.textContent = errs[field] || "";
        }
      });
    });

    const bannerMessages = (result.errors || [])
      .filter((e) => e.field !== "fund")
      .map((e) => e.message);

    if (!result.ok && bannerMessages.length === 0 && result.stockErrors?.size > 0) {
      bannerMessages.push("Fix highlighted stock fields to compute the allocation.");
    }

    if (bannerMessages.length > 0) {
      dom.validationBanner.textContent = bannerMessages.join(" ");
      dom.validationBanner.hidden = false;
    } else {
      dom.validationBanner.hidden = true;
    }
  }

  function renderResults(result) {
    if (!result.ok) {
      dom.kpiFund.textContent = "—";
      dom.kpiStockCount.textContent = `${state.stocks.length} stock${state.stocks.length === 1 ? "" : "s"}`;
      dom.kpiInvested.textContent = "—";
      dom.kpiInvestedPct.textContent = "Waiting for valid inputs";
      dom.kpiLeftoverR1.textContent = "—";
      dom.kpiExtraShares.textContent = "—";
      dom.kpiBrokerage.textContent = "—";
      dom.kpiBrokeragePct.textContent = "—";
      dom.kpiUnused.textContent = "—";
      dom.kpiTotalShares.textContent = "—";

      dom.deploymentEfficiency.textContent = "—";
      dom.capitalStackBar.innerHTML = "";
      dom.legBase.textContent = "—";
      dom.legExtra.textContent = "—";
      dom.legFee.textContent = "—";
      dom.legCash.textContent = "—";
      dom.weightComparisonList.innerHTML = `<div class="empty-state">Complete valid inputs totaling 100% to inspect target vs. actual weights.</div>`;
      dom.round2PoolBadge.textContent = "—";
      dom.round2Cascade.innerHTML = `<li class="empty-state">Round 2 walkthrough will appear once allocations total 100%.</li>`;
      dom.reportTbody.innerHTML = `<tr><td colspan="12" class="empty-state">Fix the highlighted validation issues above to generate the execution ticket.</td></tr>`;
      dom.reportTfoot.innerHTML = "";
      dom.footerStatus.textContent = "Incomplete inputs";
      return;
    }

    const fundNum = result.fund.toNumber();
    const investedPct = fundNum > 0 ? (result.totalInvested.toNumber() / fundNum) * 100 : 0;
    const brokeragePct = fundNum > 0 ? (result.totalBrokerage.toNumber() / fundNum) * 100 : 0;
    const deployedPct = fundNum > 0
      ? ((result.totalInvested.add(result.totalBrokerage)).toNumber() / fundNum) * 100
      : 0;

    // KPI Ribbon
    dom.kpiFund.textContent = formatMoney(result.fund);
    dom.kpiStockCount.textContent = `${result.stocks.length} stock${result.stocks.length === 1 ? "" : "s"} configured`;
    dom.kpiInvested.textContent = formatMoney(result.totalInvested);
    dom.kpiInvestedPct.textContent = `${investedPct.toFixed(2)}% of fund in shares`;
    dom.kpiLeftoverR1.textContent = formatMoney(result.leftoverRound1);
    dom.kpiExtraShares.textContent = `${result.totalExtraShares.toString()} extra share${result.totalExtraShares === 1n ? "" : "s"} bought`;
    dom.kpiBrokerage.textContent = formatMoney(result.totalBrokerage);
    dom.kpiBrokeragePct.textContent = `${brokeragePct.toFixed(2)}% fee drag`;
    dom.kpiUnused.textContent = formatMoney(result.unused);
    dom.kpiTotalShares.textContent = `${result.totalShares.toString()} whole shares total`;

    // Capital Stack
    const round1BaseInvested = result.stocks.reduce((acc, s) => acc.add(s.baseInvested), ExactDecimal.ZERO);
    const round2ExtraInvested = result.totalInvested.sub(round1BaseInvested);

    const segments = [
      { cls: "cap-seg--base", val: round1BaseInvested.toNumber(), label: "Round 1 Base" },
      { cls: "cap-seg--extra", val: round2ExtraInvested.toNumber(), label: "Round 2 Extra" },
      { cls: "cap-seg--fee", val: result.totalBrokerage.toNumber(), label: "Brokerage" },
      { cls: "cap-seg--cash", val: result.unused.toNumber(), label: "Unused Cash" }
    ];

    dom.capitalStackBar.innerHTML = "";
    segments.forEach((seg) => {
      if (seg.val <= 0 || fundNum <= 0) return;
      const el = document.createElement("div");
      el.className = `cap-seg ${seg.cls}`;
      el.style.width = `${(seg.val / fundNum) * 100}%`;
      el.title = `${seg.label}: ${((seg.val / fundNum) * 100).toFixed(2)}%`;
      dom.capitalStackBar.appendChild(el);
    });

    dom.deploymentEfficiency.textContent = `${deployedPct.toFixed(2)}% deployed`;
    dom.legBase.textContent = formatMoney(round1BaseInvested);
    dom.legExtra.textContent = formatMoney(round2ExtraInvested);
    dom.legFee.textContent = formatMoney(result.totalBrokerage);
    dom.legCash.textContent = formatMoney(result.unused);

    // Target vs Actual Weight Comparison
    dom.weightComparisonList.innerHTML = "";
    const maxWeight = Math.max(
      1,
      ...result.stocks.map((s) => Math.max(s.pct.toNumber(), s.actualPct))
    );

    result.stocks.forEach((s) => {
      const color = colorForIndex(s.index);
      const targetNum = s.pct.toNumber();
      const actualWidth = Math.min(100, (s.actualPct / maxWeight) * 100);
      const targetMarkerPos = Math.min(100, (targetNum / maxWeight) * 100);
      const drift = s.actualPct - targetNum;
      const driftSign = drift >= 0 ? "+" : "";

      const item = document.createElement("div");
      item.className = "weight-item";
      item.innerHTML = `
        <div class="weight-item-top">
          <span class="weight-item-name">
            <span class="stock-dot" style="background:${color}" aria-hidden="true"></span>
            ${escapeHtml(s.name)}
          </span>
          <span class="weight-item-nums mono">
            Target ${s.pct.format(2, false)}% · Actual ${s.actualPct.toFixed(2)}% (${driftSign}${drift.toFixed(2)}%)
          </span>
        </div>
        <div class="weight-bars" title="Target ${s.pct.format(2, false)}% (black marker) vs Actual ${s.actualPct.toFixed(2)}%">
          <div class="weight-bar-actual" style="width:${actualWidth.toFixed(2)}%;background:${color}"></div>
          <div class="weight-bar-target-marker" style="left:calc(${targetMarkerPos.toFixed(2)}% - 1px)"></div>
        </div>
      `;
      dom.weightComparisonList.appendChild(item);
    });

    // Round 2 Priority Cascade
    dom.round2PoolBadge.textContent = `Pool: ${formatMoney(result.leftoverRound1)}`;
    dom.round2Cascade.innerHTML = "";

    result.round2Steps.forEach((step) => {
      const bought = step.extraShares > 0n;
      const li = document.createElement("li");
      li.className = `cascade-step ${bought ? "is-bought" : "is-skipped"}`;
      li.innerHTML = `
        <span class="pri-pill">P${step.priority}</span>
        <div class="cascade-detail">
          <div class="cascade-name">${escapeHtml(step.name)}</div>
          <div class="cascade-math mono">
            Pool ${formatMoney(step.leftoverBefore)} ÷ ${formatMoney(step.unitCost)}/sh → ${
              bought
                ? `spent ${formatMoney(step.extraCost)}, left ${formatMoney(step.leftoverAfter)}`
                : `cannot afford 1 share`
            }
          </div>
        </div>
        <div class="cascade-outcome ${bought ? "" : "is-zero"}">
          <strong>+${step.extraShares.toString()} sh</strong>
          <span>${bought ? formatMoney(step.extraInvested) : "skipped"}</span>
        </div>
      `;
      dom.round2Cascade.appendChild(li);
    });

    // Execution Report Table
    const rowsToRender =
      state.sortMode === "priority"
        ? [...result.stocks].sort((a, b) => a.priority - b.priority || a.index - b.index)
        : result.stocks;

    dom.reportTbody.innerHTML = "";
    rowsToRender.forEach((s) => {
      const color = colorForIndex(s.index);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <span class="stock-cell-name">
            <span class="stock-dot" style="background:${color}" aria-hidden="true"></span>
            ${escapeHtml(s.name)}
          </span>
        </td>
        <td class="num">${s.priority}</td>
        <td class="num">${s.pct.format(2, false)}%</td>
        <td class="num">${formatMoney(s.allocated)}</td>
        <td class="num">${formatMoney(s.price)}</td>
        <td class="num">${formatMoney(s.brokeragePerShare)}</td>
        <td class="num">${s.base.toString()}</td>
        <td class="num">${
          s.extra > 0n ? `<span class="badge-extra">+${s.extra.toString()}</span>` : "0"
        }</td>
        <td class="num"><strong>${s.totalShares.toString()}</strong></td>
        <td class="num">${formatMoney(s.invested)}</td>
        <td class="num">${formatMoney(s.brokeragePaid)}</td>
        <td class="num">${s.actualPct.toFixed(2)}%</td>
      `;
      dom.reportTbody.appendChild(tr);
    });

    dom.reportTfoot.innerHTML = `
      <tr>
        <td>Total (${result.stocks.length})</td>
        <td class="num">—</td>
        <td class="num">${result.pctSum.format(2, false)}%</td>
        <td class="num">${formatMoney(result.fund)}</td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="num">${result.totalBaseShares.toString()}</td>
        <td class="num">${result.totalExtraShares.toString()}</td>
        <td class="num">${result.totalShares.toString()}</td>
        <td class="num">${formatMoney(result.totalInvested)}</td>
        <td class="num">${formatMoney(result.totalBrokerage)}</td>
        <td class="num">${investedPct.toFixed(2)}%</td>
      </tr>
    `;

    dom.footerStatus.textContent = `Updated · ${result.totalShares.toString()} shares across ${result.stocks.length} stock${result.stocks.length === 1 ? "" : "s"}`;
  }

  function recompute() {
    saveState();
    const result = PortfolioAllocator.allocatePortfolio({
      fund: state.fund,
      stocks: state.stocks
    });
    lastResult = result;
    updateAllocationMeter(result.pctSum);
    applyValidationUI(result);
    renderResults(result);
  }

  function equalizeAllocations() {
    const n = state.stocks.length;
    if (n === 0) return;
    // Exact 2-decimal split summing to 100.00
    const baseCents = Math.floor(10000 / n);
    let remainder = 10000 - baseCents * n;
    state.stocks.forEach((s) => {
      const cents = baseCents + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      s.pct = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2).replace(/\.00$/, "");
    });
    renderStocksList();
    recompute();
  }

  function fillRemainingToLast() {
    if (state.stocks.length === 0) return;
    const lastIdx = state.stocks.length - 1;
    let sumOther = ExactDecimal.ZERO;
    for (let i = 0; i < lastIdx; i++) {
      const val = ExactDecimal.from(state.stocks[i].pct);
      if (val && val.isPositive()) {
        sumOther = sumOther.add(val);
      }
    }
    const remaining = ExactDecimal.HUNDRED.sub(sumOther);
    if (!remaining.isPositive()) {
      showToast("Other stocks already sum to 100% or more.");
      return;
    }
    state.stocks[lastIdx].pct = remaining.toPlainString();
    renderStocksList();
    recompute();
  }

  function generatePythonStyleTextReport(result) {
    const padL = (s, w) => String(s).padEnd(w, " ");
    const padR = (s, w) => String(s).padStart(w, " ");

    const header =
      padL("Stock", 16) +
      padR("Pri", 4) +
      padR("Alloc %", 9) +
      padR("Allocated", 13) +
      padR("Price", 11) +
      padR("Base", 6) +
      padR("Extra", 6) +
      padR("Total", 7) +
      padR("Invested", 14) +
      padR("Brokerage", 11);

    const line = "-".repeat(header.length);
    const lines = [header, line];

    for (const s of result.stocks) {
      lines.push(
        padL(s.name.slice(0, 15), 16) +
          padR(s.priority, 4) +
          padR(s.pct.format(2, false), 9) +
          padR(s.allocated.format(2, true), 13) +
          padR(s.price.format(2, true), 11) +
          padR(s.base.toString(), 6) +
          padR(s.extra.toString(), 6) +
          padR(s.totalShares.toString(), 7) +
          padR(s.invested.format(2, true), 14) +
          padR(s.brokeragePaid.format(2, true), 11)
      );
    }

    lines.push(line);
    lines.push("");
    lines.push("Base  = shares bought from the stock's own allocation");
    lines.push("Extra = shares bought from leftover cash, in priority order");
    lines.push("");
    lines.push(`${padL("Total fund", 30)}: ${padR(result.fund.format(2, true), 14)}`);
    lines.push(`${padL("Leftover after round 1", 30)}: ${padR(result.leftoverRound1.format(2, true), 14)}`);
    lines.push(`${padL("Invested in shares", 30)}: ${padR(result.totalInvested.format(2, true), 14)}`);
    lines.push(`${padL("Total brokerage", 30)}: ${padR(result.totalBrokerage.format(2, true), 14)}`);
    lines.push(`${padL("Unused (left in cash)", 30)}: ${padR(result.unused.format(2, true), 14)}`);

    return lines.join("\n");
  }

  function csvEscape(val) {
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv(result) {
    const headers = [
      "Stock",
      "Priority",
      "Alloc %",
      "Allocated",
      "Price",
      "Brokerage Per Share",
      "Base Shares",
      "Extra Shares",
      "Total Shares",
      "Invested",
      "Brokerage Paid",
      "Actual Weight %"
    ];
    const rows = result.stocks.map((s) => [
      s.name,
      s.priority,
      s.pct.format(2, false),
      s.allocated.format(2, false),
      s.price.format(2, false),
      s.brokeragePerShare.toPlainString(),
      s.base.toString(),
      s.extra.toString(),
      s.totalShares.toString(),
      s.invested.format(2, false),
      s.brokeragePaid.format(2, false),
      s.actualPct.toFixed(2)
    ]);

    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "portfolio-allocation.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Downloaded portfolio-allocation.csv");
  }

  // Event Listeners
  dom.fundInput.addEventListener("input", (e) => {
    state.fund = e.target.value;
    recompute();
  });

  dom.currencySelect.addEventListener("change", (e) => {
    state.currency = e.target.value;
    syncCurrencyUI();
    recompute();
  });

  dom.presetSelect.addEventListener("change", (e) => {
    const key = e.target.value;
    if (!key) return;
    state = clonePreset(key);
    dom.fundInput.value = state.fund;
    syncCurrencyUI();
    renderStocksList();
    recompute();
    e.target.value = "";
    showToast("Loaded sample portfolio");
  });

  dom.resetBtn.addEventListener("click", () => {
    state = clonePreset("dividendValue");
    dom.fundInput.value = state.fund;
    syncCurrencyUI();
    updateSortButtons();
    renderStocksList();
    recompute();
    showToast("Workspace reset to default");
  });

  dom.stocksList.addEventListener("input", (e) => {
    const input = e.target.closest("input[data-field]");
    if (!input) return;
    const rowEl = input.closest(".stock-row");
    const stock = state.stocks.find((s) => s.id === rowEl?.dataset.id);
    if (!stock) return;
    stock[input.dataset.field] = input.value;
    recompute();
  });

  dom.stocksList.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-action="remove"]');
    if (!btn || state.stocks.length <= 1) return;
    const rowEl = btn.closest(".stock-row");
    state.stocks = state.stocks.filter((s) => s.id !== rowEl?.dataset.id);
    renderStocksList();
    recompute();
  });

  dom.addStockBtn.addEventListener("click", () => {
    let currentSum = ExactDecimal.ZERO;
    for (const s of state.stocks) {
      const val = ExactDecimal.from(s.pct);
      if (val && val.isPositive()) currentSum = currentSum.add(val);
    }
    const rem = ExactDecimal.HUNDRED.sub(currentSum);
    const defaultPct = rem.isPositive() ? rem.toPlainString() : "0";
    const maxPri = state.stocks.reduce((m, s) => Math.max(m, parseInt(s.priority, 10) || 1), 0);

    state.stocks.push(
      makeRow({
        name: "",
        priority: String(maxPri + 1),
        pct: defaultPct,
        price: "100",
        brokerage: "0"
      })
    );
    renderStocksList();
    recompute();
    const lastRowInput = dom.stocksList.querySelector('.stock-row:last-child input[data-field="name"]');
    if (lastRowInput) lastRowInput.focus();
  });

  dom.equalizeBtn.addEventListener("click", equalizeAllocations);
  dom.fillRemainingBtn.addEventListener("click", fillRemainingToLast);

  function updateSortButtons() {
    dom.sortButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.sort === state.sortMode);
    });
  }

  dom.sortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sortMode = btn.dataset.sort;
      updateSortButtons();
      saveState();
      if (lastResult) renderResults(lastResult);
    });
  });

  dom.copyReportBtn.addEventListener("click", async () => {
    if (!lastResult || !lastResult.ok) {
      showToast("Fix invalid inputs before copying the report.");
      return;
    }
    const text = generatePythonStyleTextReport(lastResult);
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied formatted text report to clipboard");
    } catch (_) {
      showToast("Clipboard unavailable — use Export CSV or Print.");
    }
  });

  dom.exportCsvBtn.addEventListener("click", () => {
    if (!lastResult || !lastResult.ok) {
      showToast("Fix invalid inputs before exporting CSV.");
      return;
    }
    exportCsv(lastResult);
  });

  dom.printBtn.addEventListener("click", () => window.print());

  // Boot
  dom.fundInput.value = state.fund;
  syncCurrencyUI();
  updateSortButtons();
  renderStocksList();
  recompute();
})();
