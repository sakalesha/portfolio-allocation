/**
 * Exact arbitrary-precision decimal arithmetic (BigInt-backed)
 * Mirrors Python's `decimal.Decimal` behavior used in portfolio_allocator.py
 * so division, floor division (//), multiplication, and sums never suffer
 * from IEEE-754 floating-point drift.
 */
(function (global) {
  "use strict";

  const POW10_CACHE = new Map([[0, 1n]]);
  function pow10(n) {
    if (n <= 0) return 1n;
    let cached = POW10_CACHE.get(n);
    if (cached !== undefined) return cached;
    cached = 10n ** BigInt(n);
    POW10_CACHE.set(n, cached);
    return cached;
  }

  class ExactDecimal {
    /**
     * @param {bigint} coeff
     * @param {number} scale - number of digits after decimal point (>= 0)
     */
    constructor(coeff, scale) {
      this.coeff = coeff;
      this.scale = scale;
    }

    static from(input) {
      if (input instanceof ExactDecimal) return input;
      const raw = String(input ?? "").trim().replace(/,/g, "");
      if (!raw) return null;
      const match = raw.match(/^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/);
      if (!match) return null;

      const sign = match[1] === "-" ? -1n : 1n;
      const intPart = match[2] || "0";
      const fracPart = match[3] ?? match[4] ?? "";
      const exp = match[5] ? parseInt(match[5], 10) : 0;
      if (!Number.isSafeInteger(exp)) return null;

      let digits = intPart + fracPart;
      let scale = fracPart.length - exp;
      if (scale < 0) {
        digits += "0".repeat(-scale);
        scale = 0;
      }
      const coeff = sign * BigInt(digits);
      return new ExactDecimal(coeff, scale).normalize();
    }

    normalize() {
      if (this.coeff === 0n) return new ExactDecimal(0n, 0);
      let c = this.coeff;
      let s = this.scale;
      while (s > 0 && c % 10n === 0n) {
        c /= 10n;
        s -= 1;
      }
      return new ExactDecimal(c, s);
    }

    isZero() {
      return this.coeff === 0n;
    }

    isNegative() {
      return this.coeff < 0n;
    }

    isPositive() {
      return this.coeff > 0n;
    }

    cmp(other) {
      const b = ExactDecimal.from(other);
      const maxScale = Math.max(this.scale, b.scale);
      const ac = this.coeff * pow10(maxScale - this.scale);
      const bc = b.coeff * pow10(maxScale - b.scale);
      return ac < bc ? -1 : ac > bc ? 1 : 0;
    }

    eq(other) {
      return this.cmp(other) === 0;
    }

    add(other) {
      const b = ExactDecimal.from(other);
      const maxScale = Math.max(this.scale, b.scale);
      const ac = this.coeff * pow10(maxScale - this.scale);
      const bc = b.coeff * pow10(maxScale - b.scale);
      return new ExactDecimal(ac + bc, maxScale).normalize();
    }

    sub(other) {
      const b = ExactDecimal.from(other);
      const maxScale = Math.max(this.scale, b.scale);
      const ac = this.coeff * pow10(maxScale - this.scale);
      const bc = b.coeff * pow10(maxScale - b.scale);
      return new ExactDecimal(ac - bc, maxScale).normalize();
    }

    mul(other) {
      const b = ExactDecimal.from(other);
      return new ExactDecimal(this.coeff * b.coeff, this.scale + b.scale).normalize();
    }

    divPow10(power) {
      if (this.coeff === 0n) return ExactDecimal.ZERO;
      return new ExactDecimal(this.coeff, this.scale + power).normalize();
    }

    /**
     * Exact integer floor division `floor(this / other)` matching Python `int(a // b)`
     * for non-negative `this` and positive `other`.
     */
    floorDiv(other) {
      const b = ExactDecimal.from(other);
      if (b.coeff === 0n) throw new Error("Division by zero");
      const maxScale = Math.max(this.scale, b.scale);
      const num = this.coeff * pow10(maxScale - this.scale);
      const den = b.coeff * pow10(maxScale - b.scale);
      // Python floor division semantics
      let q = num / den;
      const r = num % den;
      if (r !== 0n && (num < 0n) !== (den < 0n)) {
        q -= 1n;
      }
      return q;
    }

    toNumber() {
      return Number(this.toPlainString());
    }

    toPlainString() {
      if (this.coeff === 0n) return "0";
      const sign = this.coeff < 0n ? "-" : "";
      const absStr = (this.coeff < 0n ? -this.coeff : this.coeff).toString();
      if (this.scale === 0) return sign + absStr;
      if (absStr.length <= this.scale) {
        return sign + "0." + "0".repeat(this.scale - absStr.length) + absStr;
      }
      const split = absStr.length - this.scale;
      return sign + absStr.slice(0, split) + "." + absStr.slice(split);
    }

    /**
     * Round half-up to `decimals` places and format with comma thousands separators.
     */
    format(decimals = 2, useGrouping = true) {
      const sign = this.coeff < 0n ? "-" : "";
      const absCoeff = this.coeff < 0n ? -this.coeff : this.coeff;

      let scaled;
      if (this.scale <= decimals) {
        scaled = absCoeff * pow10(decimals - this.scale);
      } else {
        const diff = this.scale - decimals;
        const factor = pow10(diff);
        const q = absCoeff / factor;
        const r = absCoeff % factor;
        // Round half-even (matches Python f"{val:,.2f}" default ROUND_HALF_EVEN)
        const twiceR = r * 2n;
        if (twiceR > factor || (twiceR === factor && q % 2n === 1n)) {
          scaled = q + 1n;
        } else {
          scaled = q;
        }
      }

      const str = scaled.toString();
      let intStr;
      let fracStr;
      if (decimals === 0) {
        intStr = str;
        fracStr = "";
      } else if (str.length <= decimals) {
        intStr = "0";
        fracStr = "0".repeat(decimals - str.length) + str;
      } else {
        intStr = str.slice(0, str.length - decimals);
        fracStr = str.slice(str.length - decimals);
      }

      if (useGrouping) {
        intStr = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      }

      return decimals > 0 ? `${sign}${intStr}.${fracStr}` : `${sign}${intStr}`;
    }
  }

  ExactDecimal.ZERO = new ExactDecimal(0n, 0);
  ExactDecimal.HUNDRED = new ExactDecimal(100n, 0);

  global.ExactDecimal = ExactDecimal;
})(typeof window !== "undefined" ? window : globalThis);
