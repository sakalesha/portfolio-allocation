/**
 * Portfolio Allocator Core Engine
 * Direct port of portfolio_allocator.py using ExactDecimal arithmetic.
 */
(function (global) {
  "use strict";

  const ExactDecimal = global.ExactDecimal;

  /**
   * Return { shares: bigint, brokeragePaid: ExactDecimal } that `budget` can pay for.
   * Matches `calculate_shares(budget, price, brokerage_per_share)` in portfolio_allocator.py.
   */
  function calculateShares(budget, price, brokeragePerShare) {
    const unitCost = price.add(brokeragePerShare);
    const shares = budget.floorDiv(unitCost);
    const sharesDec = new ExactDecimal(shares, 0);
    const brokeragePaid = brokeragePerShare.mul(sharesDec);
    return { shares, brokeragePaid };
  }

  /**
   * Validate raw portfolio inputs and run Round 1 + Round 2 allocation.
   * @param {Object} input
   * @param {string|number} input.fund
   * @param {Array<{id?: string, name: string, pct: string|number, priority: string|number, price: string|number, brokerage: string|number}>} input.stocks
   */
  function allocatePortfolio(input) {
    const errors = [];
    const stockErrors = new Map();

    const fund = ExactDecimal.from(input.fund);
    if (!fund || !fund.isPositive()) {
      errors.push({ field: "fund", message: "Total fund must be a positive number." });
    }

    const rawStocks = Array.isArray(input.stocks) ? input.stocks : [];
    if (rawStocks.length === 0) {
      errors.push({ field: "stocks", message: "Add at least one stock to allocate." });
    }

    const parsedStocks = [];
    let pctSum = ExactDecimal.ZERO;
    const singleStock = rawStocks.length === 1;

    rawStocks.forEach((item, index) => {
      const rowKey = item.id ?? String(index);
      const rowErr = {};
      const displayName = String(item.name ?? "").trim() || `Stock ${index + 1}`;

      const pct = ExactDecimal.from(item.pct);
      if (!pct || !pct.isPositive()) {
        rowErr.pct = "Enter a positive %";
      } else {
        pctSum = pctSum.add(pct);
      }

      let priority = 1;
      if (!singleStock) {
        const rawPri = String(item.priority ?? "").trim();
        if (!/^\d+$/.test(rawPri) || parseInt(rawPri, 10) < 1) {
          rowErr.priority = "Whole number ≥ 1";
        } else {
          priority = parseInt(rawPri, 10);
        }
      }

      const price = ExactDecimal.from(item.price);
      if (!price || !price.isPositive()) {
        rowErr.price = "Price must be > 0";
      }

      const brokerageRaw = String(item.brokerage ?? "").trim() === "" ? "0" : item.brokerage;
      const brokerage = ExactDecimal.from(brokerageRaw);
      if (!brokerage || brokerage.isNegative()) {
        rowErr.brokerage = "Brokerage must be ≥ 0";
      }

      if (Object.keys(rowErr).length > 0) {
        stockErrors.set(rowKey, rowErr);
      }

      parsedStocks.push({
        id: rowKey,
        index,
        name: displayName,
        pct,
        priority,
        price,
        brokeragePerShare: brokerage
      });
    });

    const hasAllocationMismatch = parsedStocks.length > 0 && !pctSum.eq(ExactDecimal.HUNDRED);
    if (hasAllocationMismatch) {
      errors.push({
        field: "allocations",
        message: `Allocations add up to ${pctSum.format(2, false)}%, not 100%.`
      });
    }

    if (errors.length > 0 || stockErrors.size > 0) {
      return {
        ok: false,
        errors,
        stockErrors,
        pctSum,
        singleStock
      };
    }

    // Round 1: each stock buys from its own allocated amount.
    const results = parsedStocks.map((s) => {
      const allocated = fund.mul(s.pct).divPow10(2);
      const { shares, brokeragePaid } = calculateShares(allocated, s.price, s.brokeragePerShare);
      const baseDec = new ExactDecimal(shares, 0);
      const baseInvested = baseDec.mul(s.price);
      const baseOutlay = baseInvested.add(brokeragePaid);
      const sliceResidual = allocated.sub(baseOutlay);

      return {
        id: s.id,
        index: s.index,
        name: s.name,
        pct: s.pct,
        priority: s.priority,
        price: s.price,
        brokeragePerShare: s.brokeragePerShare,
        allocated,
        base: shares,
        extra: 0n,
        baseInvested,
        baseBrokerage: brokeragePaid,
        brokeragePaid,
        sliceResidual
      };
    });

    const round1Spent = results.reduce(
      (acc, s) => acc.add(new ExactDecimal(s.base, 0).mul(s.price)).add(s.brokeragePaid),
      ExactDecimal.ZERO
    );
    const leftoverRound1 = fund.sub(round1Spent);

    // Round 2: spend leftover on extra shares, highest priority first.
    // Tie-break on original input order (`index`), matching Python's stable sort.
    let leftover = leftoverRound1;
    const round2Steps = [];
    const priorityOrder = [...results].sort((a, b) => a.priority - b.priority || a.index - b.index);

    for (const s of priorityOrder) {
      const unitCost = s.price.add(s.brokeragePerShare);
      const leftoverBefore = leftover;
      const { shares: extra, brokeragePaid: extraBrokerage } = calculateShares(
        leftover,
        s.price,
        s.brokeragePerShare
      );
      s.extra = extra;
      s.brokeragePaid = s.brokeragePaid.add(extraBrokerage);
      const extraCost = new ExactDecimal(extra, 0).mul(s.price).add(extraBrokerage);
      leftover = leftover.sub(extraCost);

      round2Steps.push({
        id: s.id,
        index: s.index,
        name: s.name,
        priority: s.priority,
        unitCost,
        leftoverBefore,
        extraShares: extra,
        extraInvested: new ExactDecimal(extra, 0).mul(s.price),
        extraBrokerage,
        extraCost,
        leftoverAfter: leftover
      });
    }

    // Finalize row summaries
    let totalInvested = ExactDecimal.ZERO;
    let totalBrokerage = ExactDecimal.ZERO;
    let totalBaseShares = 0n;
    let totalExtraShares = 0n;

    for (const s of results) {
      s.totalShares = s.base + s.extra;
      s.invested = new ExactDecimal(s.totalShares, 0).mul(s.price);
      s.totalCost = s.invested.add(s.brokeragePaid);
      s.actualPct = fund.isPositive()
        ? s.invested.mul(ExactDecimal.HUNDRED).toNumber() / fund.toNumber()
        : 0;
      totalInvested = totalInvested.add(s.invested);
      totalBrokerage = totalBrokerage.add(s.brokeragePaid);
      totalBaseShares += s.base;
      totalExtraShares += s.extra;
    }

    const unused = fund.sub(totalInvested).sub(totalBrokerage);

    return {
      ok: true,
      pctSum,
      singleStock,
      fund,
      leftoverRound1,
      totalInvested,
      totalBrokerage,
      unused,
      totalBaseShares,
      totalExtraShares,
      totalShares: totalBaseShares + totalExtraShares,
      stocks: results,
      round2Steps
    };
  }

  global.PortfolioAllocator = {
    calculateShares,
    allocatePortfolio
  };
})(typeof window !== "undefined" ? window : globalThis);
