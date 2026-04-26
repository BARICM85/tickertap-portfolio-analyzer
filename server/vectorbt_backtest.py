#!/usr/bin/env python3

import json
import sys

try:
    import pandas as pd
    import vectorbt as vbt
except Exception as exc:  # pragma: no cover - fallback is handled by Node
    print(json.dumps({"error": f"vectorbt unavailable: {exc}"}))
    sys.exit(0)


def _load_payload():
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _series_from_points(points):
    filtered = [
        {
            "date": point.get("date"),
            "close": float(point.get("close") or 0),
        }
        for point in points
        if point.get("date") and float(point.get("close") or 0) > 0
    ]
    if not filtered:
        return pd.Series(dtype="float64")

    index = pd.to_datetime([point["date"] for point in filtered], utc=True)
    values = [point["close"] for point in filtered]
    return pd.Series(values, index=index)


def main():
    payload = _load_payload()
    points = payload.get("points") or []
    benchmark_points = payload.get("benchmarkPoints") or []
    settings = payload.get("settings") or {}

    close = _series_from_points(points)
    if close.empty:
        print(json.dumps({"error": "no price history"}))
        return

    fast_window = max(2, int(settings.get("fastWindow") or 20))
    slow_window = max(fast_window + 1, int(settings.get("slowWindow") or 50))
    initial_cash = max(1, float(settings.get("initialCash") or 100000))
    commission_bps = max(0, float(settings.get("commissionBps") or 0))
    fee_rate = commission_bps / 10000.0

    fast_ma = vbt.MA.run(close, window=fast_window).ma
    slow_ma = vbt.MA.run(close, window=slow_window).ma
    entries = fast_ma.vbt.crossed_above(slow_ma)
    exits = fast_ma.vbt.crossed_below(slow_ma)

    portfolio = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        init_cash=initial_cash,
        fees=fee_rate,
        size=1,
        size_type="percent",
    )

    stats = portfolio.stats()
    close_values = close.to_list()
    first_close = close_values[0]
    final_close = close_values[-1]

    benchmark_series = _series_from_points(benchmark_points)
    benchmark_return = 0.0
    if not benchmark_series.empty and benchmark_series.iloc[0] > 0:
        benchmark_return = ((benchmark_series.iloc[-1] - benchmark_series.iloc[0]) / benchmark_series.iloc[0]) * 100

    curve_values = portfolio.value().tail(90)
    close_tail = close.loc[curve_values.index]
    benchmark_tail = (close_tail / first_close) * initial_cash if first_close > 0 else None
    curve = []
    for index, equity in curve_values.items():
        curve.append(
            {
                "date": str(index),
                "equity": float(equity),
                "benchmark": float(benchmark_tail.loc[index]) if benchmark_tail is not None else None,
                "price": float(close.loc[index]),
                "signal": "BUY" if bool(entries.loc[index]) else "SELL" if bool(exits.loc[index]) else "HOLD",
            }
        )

    output = {
        "strategyReturnPercent": float(stats.get("Total Return [%]", 0.0)),
        "buyHoldReturnPercent": ((final_close - first_close) / first_close) * 100 if first_close > 0 else 0.0,
        "benchmarkReturnPercent": benchmark_return,
        "maxDrawdownPercent": float(stats.get("Max Drawdown [%]", 0.0)),
        "winRatePercent": float(stats.get("Win Rate [%]", 0.0)),
        "trades": int(stats.get("Total Trades", 0)),
        "tradeEntries": int(stats.get("Total Trades", 0)),
        "completedTrades": int(stats.get("Total Trades", 0)),
        "finalEquity": float(portfolio.value().iloc[-1]),
        "curve": curve,
        "lastSignal": "BUY" if bool(entries.iloc[-1]) else "SELL" if bool(exits.iloc[-1]) else "HOLD",
    }

    print(json.dumps(output))


if __name__ == "__main__":
    main()
