# portfolio-allocation

Interactive two-round whole-share portfolio allocator converted from `portfolio_allocator.py`, using Indian Rupee (`₹`) by default and exact `BigInt` decimal arithmetic.

- **Live Website (GitHub Pages):** https://sakalesha.github.io/portfolio-allocation/

## How It Works
- **Round 1:** Allocates `total fund × allocation %` to each stock and buys the maximum whole number of shares within `price + brokerage per share`.
- **Round 2:** Sweeps leftover cash into extra shares in priority order (`1` = highest priority; ties preserve input order).

## Files
- `index.html`, `styles.css`, `decimal.js`, `allocator.js`, `app.js` — Interactive static web application.
- `portfolio_allocator.py` — Original CLI script.
- `.github/workflows/deploy-pages.yml` — Automated GitHub Pages deployment workflow.
