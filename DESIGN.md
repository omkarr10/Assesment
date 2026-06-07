# Design

## Schema

I use four tables:

- `transactions(id, source_snapshot, txn_date, merchant_raw, merchant_key, category, amount, currency, memo, memo_norm, is_transfer, is_refund)`
- `funds(id, name, category, source_snapshot)`
- `fund_nav(fund_id, nav_date, nav)` with a composite primary key on `(fund_id, nav_date)`
- `holdings(id, source_snapshot, fund_id, fund_name, units, purchase_date, purchase_nav)`

Indexes are on transaction date, category/date, merchant/date, transfer/date, and fund NAV date. That keeps the common filters fast for spend, alias, and return lookups.

## Tool design

I use one grounded tool, `financeResearch`, instead of many narrow overlapping tools. It accepts the user question and deterministically routes to the right SQL-backed computation. That reduces tool-selection ambiguity and keeps all numbers grounded in code.

## Grounding

The model never invents figures. The tool computes the answer from Postgres, and the agent only paraphrases the tool output. If the database has no matching rows, the tool returns a no-data message rather than zero or a guess.

## Formulas

- Spend: sum of transaction `amount`.
- Net spend: positive transactions minus refunds/reversals, with refunds represented as negative amounts.
- Merchant matching: normalize merchant text, strip punctuation, and cluster aliases by a deterministic merchant key derived from the merchant and memo text.
- Recurring detection: at least 3 positive transactions for the same merchant key, with low amount variance across occurrences.
- Fund period return: `(end_nav - start_nav) / start_nav * 100`, using the latest NAV on or before each requested date.
- Holding realised return: `units * latest_nav - units * purchase_nav` and the percentage gain relative to purchase cost.

## Relative dates

Relative phrases like “last month” are resolved against the latest transaction date in the ingested snapshot, not the system clock. That keeps historical snapshots stable and reproducible.

## Evals

The eval script runs a fixed question set against the same code path as `/ask` and prints a pass/fail summary. It covers spending, merchant aliases, refunds, transfers, recurring subscriptions, no-data cases, fund returns, holding returns, and portfolio valuation.

## Observability

Each `/ask` request appends one JSON line to `logs/ask.ndjson` with the request id, question, inferred intent, tools called, sanitized inputs, tables read, latency, status, and any error message.

## Async milestone

I did not implement background jobs. All tools execute synchronously. That keeps the first version simple and predictable, and it matches the assignment's allowance to skip the async milestone if documented.

## Risks

The main remaining risk is parser coverage. The system is deterministic, but some unseen phrasing may need additional intent rules or alias heuristics. Given more time, I would replace the current question planner with a richer structured parser and add a larger automated eval corpus.
