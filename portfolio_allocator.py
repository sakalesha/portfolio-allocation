"""
Portfolio Allocator
-------------------
Given a total fund, a % allocation, a priority, a price, and brokerage for
each stock, work out how many whole shares of each stock to buy.
Brokerage is entered per share for each stock.

Round 1 - every stock gets its own slice of the fund:
    allocated amount = total fund x allocation %
    shares bought    = the largest whole number where
                       shares x (price + per-share brokerage) <= allocated amount

Round 2 - because only whole shares can be bought, some cash is left over.
That leftover is used to buy extra shares, going through the stocks in
priority order (1 = highest priority). Each stock takes as many extra
shares as the leftover can pay for, then the next stock gets its turn.

Run:  python portfolio_allocator.py
"""

from decimal import Decimal, InvalidOperation


# ---------- input helpers ----------

def ask_number(prompt, allow_zero=False):
    """Keep asking until the user enters a valid positive number."""
    while True:
        raw = input(prompt).strip().replace(",", "")
        try:
            value = Decimal(raw)
        except InvalidOperation:
            print("  Please enter a valid number.")
            continue
        if not value.is_finite() or value < 0 or (value == 0 and not allow_zero):
            print("  Please enter a positive number.")
            continue
        return value


def ask_int(prompt, minimum=1):
    """Keep asking until the user enters a whole number >= minimum."""
    while True:
        raw = input(prompt).strip()
        if raw.isdigit() and int(raw) >= minimum:
            return int(raw)
        print(f"  Please enter a whole number (minimum {minimum}).")


def collect_allocations(count):
    """Ask for each stock's name and allocation %, until the total is 100."""
    while True:
        print("\nEnter the allocation for each stock (must total 100%).")
        names, percents = [], []
        for i in range(1, count + 1):
            name = input(f"Stock {i} name/symbol: ").strip() or f"Stock {i}"
            percents.append(ask_number(f"  Allocation % for {name}: "))
            names.append(name)
        total = sum(percents)
        if total == 100:
            return names, percents
        print(f"\nAllocations add up to {total}%, not 100%. Please enter them again.")


def collect_priorities(names):
    """Priority only matters when there is more than one stock."""
    if len(names) == 1:
        return [1]
    print("\nEnter the priority of each stock (1 = highest priority).")
    print("Leftover cash is used to buy extra shares in this order.")
    print("If two stocks share a priority, the one you entered first goes first.")
    return [ask_int(f"  Priority of {name}: ") for name in names]


# ---------- calculation ----------

def calculate_shares(budget, price, brokerage_per_share):
    """
    Return (shares, brokerage_paid) that `budget` can pay for.
    """
    shares = int(budget // (price + brokerage_per_share))
    brokerage_paid = brokerage_per_share * shares
    return shares, brokerage_paid


# ---------- main ----------

def main():
    print("=== Portfolio Allocator ===\n")
    fund = ask_number("Total fund amount: ")
    count = ask_int("Number of stocks: ")

    names, percents = collect_allocations(count)
    priorities = collect_priorities(names)

    print("\nEnter the price of one share for each stock.")
    prices = [ask_number(f"  Price of {name}: ") for name in names]
    print("\nEnter the brokerage charged per share for each stock.")
    brokerages = [ask_number(f"  Brokerage per share for {name}: ", allow_zero=True)
                  for name in names]

    # Round 1: each stock buys from its own allocated amount.
    stocks = []
    for name, pct, pri, price, brokerage in zip(names, percents, priorities, prices, brokerages):
        allocated = fund * pct / 100
        shares, paid = calculate_shares(allocated, price, brokerage)
        stocks.append({"name": name, "pct": pct, "priority": pri, "price": price,
                       "brokerage_per_share": brokerage,
                       "allocated": allocated, "base": shares, "extra": 0,
                       "brokerage_paid": paid})

    leftover_round1 = fund - sum(s["base"] * s["price"] + s["brokerage_paid"] for s in stocks)

    # Round 2: spend the leftover on extra shares, highest priority first.
    leftover = leftover_round1
    for s in sorted(stocks, key=lambda s: s["priority"]):  # stable sort keeps input order on ties
        extra, paid = calculate_shares(leftover, s["price"], s["brokerage_per_share"])
        s["extra"] = extra
        s["brokerage_paid"] += paid
        leftover -= extra * s["price"] + paid

    # ---------- report ----------
    header = (f"{'Stock':<16}{'Pri':>4}{'Alloc %':>9}{'Allocated':>13}{'Price':>11}"
              f"{'Base':>6}{'Extra':>6}{'Total':>7}{'Invested':>14}{'Brokerage':>11}")
    line = "-" * len(header)
    print("\n" + header)
    print(line)
    for s in stocks:
        total_shares = s["base"] + s["extra"]
        invested = total_shares * s["price"]
        print(f"{s['name'][:15]:<16}{s['priority']:>4}{s['pct']:>9.2f}{s['allocated']:>13,.2f}"
              f"{s['price']:>11,.2f}{s['base']:>6}{s['extra']:>6}{total_shares:>7}"
              f"{invested:>14,.2f}{s['brokerage_paid']:>11,.2f}")
    print(line)

    total_invested = sum((s["base"] + s["extra"]) * s["price"] for s in stocks)
    total_brokerage = sum(s["brokerage_paid"] for s in stocks)
    unused = fund - total_invested - total_brokerage

    print("\nBase  = shares bought from the stock's own allocation")
    print("Extra = shares bought from leftover cash, in priority order")
    print(f"\nTotal fund                    : {fund:>14,.2f}")
    print(f"Leftover after round 1        : {leftover_round1:>14,.2f}")
    print(f"Invested in shares            : {total_invested:>14,.2f}")
    print(f"Total brokerage               : {total_brokerage:>14,.2f}")
    print(f"Unused (left in cash)         : {unused:>14,.2f}")


if __name__ == "__main__":
    main()
