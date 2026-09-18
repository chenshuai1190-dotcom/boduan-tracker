# META completed-day RSI replay

`META-2026-09-17.json` contains public EODHD daily OHLCV observations retrieved
with one bounded META.US request, retaining `adjusted_close` and the original
263-observation window. No account data or credentials are included.

The unchanged production Wilder RSI(6), before this change, returned
87.77178025015014 on 2026-09-17 and 87.83704550365046 on 2026-09-09.
The respective adjusted closes are 682.31 and 653.69. The earlier date is a
two-sided closing-price/RSI swing, observable on 2026-09-11, even though later
intraday highs prevent the old three-bar high-pivot detector from selecting it.

The user's illustrative earlier RSI of 89.56 is tested separately as a numeric
example; it is not substituted for this provider history. Both comparisons
produce WATCH through the general thresholds. Tests also replay each September
prefix to verify that future observations cannot change earlier outputs.
