import { query } from './db.js';
import { formatDate, resolveRelativePhrase } from './finance/dates.js';
import { merchantKey, normalizeText } from './finance/merchant.js';

type ToolAnswer = {
  intent: string;
  answer: string;
  tablesRead: string[];
  toolName: string;
  inputSummary: Record<string, unknown>;
};

type TransactionRow = {
  id: string;
  txn_date: string;
  merchant_raw: string;
  merchant_key: string;
  category: string;
  amount: string;
  currency: string;
  memo: string | null;
  is_transfer: boolean;
  is_refund: boolean;
};

type FundNavRow = { fund_id: string; nav_date: string; nav: string };

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function asNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function latestTransactionDate(): Promise<Date> {
  const rows = await query<{ max_date: string | null }>('SELECT MAX(txn_date)::text AS max_date FROM transactions');
  const maxDate = rows[0]?.max_date ? new Date(rows[0].max_date) : new Date();
  return maxDate;
}

async function fetchTransactions(start: Date, end: Date): Promise<TransactionRow[]> {
  return query<TransactionRow>(
    `SELECT id, txn_date::text, merchant_raw, merchant_key, category, amount::text, currency, memo, is_transfer, is_refund
     FROM transactions
     WHERE txn_date BETWEEN $1 AND $2
     ORDER BY txn_date ASC, id ASC`,
    [formatDate(start), formatDate(end)],
  );
}

function extractCategories(question: string): string[] {
  const text = question.toLowerCase();
  const aliases: Record<string, string[]> = {
    food: ['food', 'dining', 'groceries', 'restaurant'],
    travel: ['travel', 'transport', 'cab', 'taxi'],
    rent: ['rent'],
    shopping: ['shopping'],
    utilities: ['utilities', 'utility'],
    health: ['health', 'pharmacy'],
    entertainment: ['entertainment'],
    investment: ['investment'],
    transfer: ['transfer'],
  };

  const out: string[] = [];
  for (const [signal, mapped] of Object.entries(aliases)) {
    if (text.includes(signal)) {
      out.push(...mapped);
    }
  }
  return [...new Set(out)];
}

function extractMerchant(question: string): string | null {
  const text = normalizeText(question);
  const known = text.match(/\b(swiggy(?:\s+instamart)?|amazon(?:\.in)?|amz\*order|zepto|apollo(?:\s+pharmacy)?|blinkit|netflix|spotify|zomato|uber|ola)\b/i);
  if (known) {
    return known[1].trim();
  }

  const explicit = text.match(/\bmerchant\s+([a-z0-9*\s]{2,40})\b/i);
  if (explicit) {
    return explicit[1].trim();
  }

  return null;
}

function formatTransactionLine(row: TransactionRow): string {
  const amount = asNumber(row.amount);
  const signed = amount < 0 ? `refund ${money(Math.abs(amount))}` : money(amount);
  return `${row.txn_date} | ${row.merchant_raw} | ${row.category} | ${signed}`;
}

async function spendByFilters(question: string): Promise<ToolAnswer> {
  const relative = await latestTransactionDate().then(date => resolveRelativePhrase(question, date));
  const range = relative ?? { start: new Date(Date.UTC(2024, 0, 1)), end: new Date(Date.UTC(2025, 11, 31)), label: 'all available data' };
  const categories = extractCategories(question);
  const merchantText = extractMerchant(question);
  const includeTransfers = /\bignore transfers\b|\bexcluding transfers\b/i.test(question) ? false : !/\btransfers?\b/i.test(question) ? true : false;
  const includeRefunds = /\bafter refunds\b|\bincluding refunds\b/i.test(question) || /\bnet spend\b/i.test(question);

  const rows = await query<TransactionRow>(
    `SELECT id, txn_date::text, merchant_raw, merchant_key, category, amount::text, currency, memo, is_transfer, is_refund
     FROM transactions
     WHERE txn_date BETWEEN $1 AND $2
       AND ($3::text[] IS NULL OR category = ANY($3))
       AND ($4::text IS NULL OR merchant_key = $4 OR merchant_raw ILIKE '%' || $4 || '%' OR memo ILIKE '%' || $4 || '%')
       AND ($5::boolean OR NOT is_transfer)
     ORDER BY txn_date ASC, id ASC`,
    [formatDate(range.start), formatDate(range.end), categories.length ? categories : null, merchantText ? merchantKey(merchantText) : null, includeTransfers],
  );

  const filtered = rows.filter(row => includeRefunds || asNumber(row.amount) > 0);
  const total = filtered.reduce((sum, row) => sum + asNumber(row.amount), 0);
  const gross = filtered.filter(row => asNumber(row.amount) > 0).reduce((sum, row) => sum + asNumber(row.amount), 0);
  const refunds = filtered.filter(row => asNumber(row.amount) < 0).reduce((sum, row) => sum + Math.abs(asNumber(row.amount)), 0);

  if (!filtered.length) {
    return {
      intent: 'spend',
      answer: `No data found for ${relative?.label ?? 'that period'}.`,
      tablesRead: ['transactions'],
      toolName: 'researchFinance',
      inputSummary: { question, range, categories, merchantText, includeTransfers, includeRefunds },
    };
  }

  if (/biggest expense|single biggest expense|largest expense|top expense/i.test(question)) {
    const biggest = [...filtered].sort((a, b) => asNumber(b.amount) - asNumber(a.amount))[0];
    return {
      intent: 'biggest_expense',
      answer: `Your single biggest expense was ${money(asNumber(biggest.amount))} at ${biggest.merchant_raw} on ${biggest.txn_date}.`,
      tablesRead: ['transactions'],
      toolName: 'researchFinance',
      inputSummary: { question, range, categories, merchantText, includeTransfers, includeRefunds },
    };
  }

  if (/top\s+\d+/i.test(question)) {
    const topN = Number(question.match(/top\s+(\d+)/i)?.[1] ?? 5);
    const grouped = new Map<string, number>();
    for (const row of filtered) {
      grouped.set(row.merchant_key, (grouped.get(row.merchant_key) ?? 0) + asNumber(row.amount));
    }
    const top = [...grouped.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, topN);
    const lines = top.map(([key, amount]) => `${key}: ${money(amount)}`);
    return {
      intent: 'top_merchants',
      answer: `Top ${topN} merchants by net spend from ${formatDate(range.start)} to ${formatDate(range.end)}:\n${lines.join('\n')}`,
      tablesRead: ['transactions'],
      toolName: 'researchFinance',
      inputSummary: { question, range, categories, merchantText, includeTransfers, includeRefunds },
    };
  }

  if (/compare|grew faster|month by month/i.test(question)) {
    const groups = categories.length >= 2 ? categories.slice(0, 2) : ['food', 'travel'];
    const monthly = new Map<string, Record<string, number>>();
    for (const row of filtered) {
      const month = row.txn_date.slice(0, 7);
      const bucket = monthly.get(month) ?? {};
      bucket[row.category] = (bucket[row.category] ?? 0) + asNumber(row.amount);
      monthly.set(month, bucket);
    }
    const lines = [...monthly.entries()].sort().map(([month, bucket]) => `${month}: ${groups.map(group => `${group} ${money(bucket[group] ?? 0)}`).join(', ')}`);
    return {
      intent: 'category_comparison',
      answer: `Month-by-month category comparison for ${groups.join(' vs ')}:\n${lines.join('\n')}`,
      tablesRead: ['transactions'],
      toolName: 'researchFinance',
      inputSummary: { question, range, categories: groups, merchantText, includeTransfers, includeRefunds },
    };
  }

  const merchantLines = filtered.slice(0, 10).map(formatTransactionLine);
  const scope = merchantText
    ? `for merchant ${merchantText}`
    : categories.length === 1
      ? `for category ${categories[0]}`
      : 'for the requested period';
  return {
    intent: 'spend',
    answer: `Total spend ${scope} (${relative?.label ?? 'all available data'}) was ${money(total)}. Gross spend was ${money(gross)} and refunds totalled ${money(refunds)}.\n\nSample matching transactions:\n${merchantLines.join('\n')}`,
    tablesRead: ['transactions'],
    toolName: 'researchFinance',
    inputSummary: { question, range, categories, merchantText, includeTransfers, includeRefunds },
  };
}

async function recurringSubscriptions(question: string): Promise<ToolAnswer> {
  const rows = await query<TransactionRow>(
    `SELECT id, txn_date::text, merchant_raw, merchant_key, category, amount::text, currency, memo, is_transfer, is_refund
     FROM transactions
     WHERE NOT is_transfer AND amount > 0
     ORDER BY merchant_key, txn_date`,
  );

  const byMerchant = new Map<string, TransactionRow[]>();
  for (const row of rows) {
    const bucket = byMerchant.get(row.merchant_key) ?? [];
    bucket.push(row);
    byMerchant.set(row.merchant_key, bucket);
  }

  const recurring = [...byMerchant.entries()]
    .filter(([, merchantRows]) => merchantRows.length >= 3)
    .map(([key, merchantRows]) => {
      const amounts = merchantRows.map(row => Math.abs(asNumber(row.amount)));
      const avg = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
      const variance = amounts.reduce((sum, value) => sum + Math.abs(value - avg), 0) / amounts.length;
      return { key, merchantRows, avg, variance };
    })
    .filter(item => item.variance / Math.max(item.avg, 1) < 0.2)
    .sort((a, b) => b.merchantRows.length - a.merchantRows.length)
    .slice(0, 10);

  if (!recurring.length) {
    return {
      intent: 'recurring',
      answer: 'I did not find clear recurring subscriptions in the current data.',
      tablesRead: ['transactions'],
      toolName: 'researchFinance',
      inputSummary: { question },
    };
  }

  const lines = recurring.map(item => `${item.key}: ${item.merchantRows.length} charges, average ${money(item.avg)}`);
  return {
    intent: 'recurring',
    answer: `Likely recurring subscriptions:\n${lines.join('\n')}`,
    tablesRead: ['transactions'],
    toolName: 'researchFinance',
    inputSummary: { question },
  };
}

async function fundPeriodReturn(question: string): Promise<ToolAnswer> {
  const match = question.match(/what was\s+(.+?)\s+return\s+from/i);
  const altMatch = question.match(/return\s+of\s+(.+?)\s+from/i);
  const fundName = match?.[1]?.trim() ?? altMatch?.[1]?.trim() ?? question.replace(/.*return(?: of| for)?\s+/i, '').trim();
  const dates = question.match(/(20\d{2}-\d{2}-\d{2})/g) ?? [];
  const start = dates[0];
  const end = dates[1];

  if (/rank all funds/i.test(question)) {
    const rankings = await query<{ id: string; name: string; start_nav: string | null; end_nav: string | null }>(
      `WITH bounds AS (
         SELECT id, name
         FROM funds
       ), start_nav AS (
         SELECT DISTINCT ON (f.id) f.id, fn.nav AS start_nav
         FROM funds f
         LEFT JOIN fund_nav fn ON fn.fund_id = f.id AND fn.nav_date <= $1::date
         ORDER BY f.id, fn.nav_date DESC
       ), end_nav AS (
         SELECT DISTINCT ON (f.id) f.id, fn.nav AS end_nav
         FROM funds f
         LEFT JOIN fund_nav fn ON fn.fund_id = f.id AND fn.nav_date <= $2::date
         ORDER BY f.id, fn.nav_date DESC
       )
       SELECT f.id, f.name, start_nav.start_nav::text, end_nav.end_nav::text
       FROM funds f
       LEFT JOIN start_nav ON start_nav.id = f.id
       LEFT JOIN end_nav ON end_nav.id = f.id`,
      [start, end],
    );

    const scored = rankings
      .map(row => {
        const startNav = asNumber(row.start_nav);
        const endNav = asNumber(row.end_nav);
        const returnPct = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;
        return { name: row.name, returnPct, spread: endNav - startNav };
      })
      .sort((a, b) => b.returnPct - a.returnPct);
    const best = scored[0];
    const worst = scored[scored.length - 1];
    return {
      intent: 'fund_rank',
      answer: `Fund return ranking from ${start} to ${end}:\n${scored.map(item => `${item.name}: ${percent(item.returnPct)}`).join('\n')}\n\nSpread between best and worst: ${percent(best.returnPct - worst.returnPct)}`,
      tablesRead: ['funds', 'fund_nav'],
      toolName: 'researchFinance',
      inputSummary: { question, fundName, start, end },
    };
  }

  const rows = await query<{ id: string; name: string }>(
    `SELECT id, name FROM funds WHERE name ILIKE '%' || $1 || '%' OR id ILIKE '%' || $1 || '%' LIMIT 1`,
    [fundName],
  );
  const fund = rows[0];
  if (!fund || !start || !end) {
    return {
      intent: 'fund_return',
      answer: `I couldn't find enough fund information for that question.`,
      tablesRead: ['funds', 'fund_nav'],
      toolName: 'researchFinance',
      inputSummary: { question, fundName, start, end },
    };
  }

  const [startRow] = await query<FundNavRow>(
    `SELECT fund_id, nav_date::text, nav::text FROM fund_nav WHERE fund_id = $1 AND nav_date <= $2::date ORDER BY nav_date DESC LIMIT 1`,
    [fund.id, start],
  );
  const [endRow] = await query<FundNavRow>(
    `SELECT fund_id, nav_date::text, nav::text FROM fund_nav WHERE fund_id = $1 AND nav_date <= $2::date ORDER BY nav_date DESC LIMIT 1`,
    [fund.id, end],
  );
  const startNav = asNumber(startRow?.nav);
  const endNav = asNumber(endRow?.nav);
  const returnPct = startNav > 0 ? ((endNav - startNav) / startNav) * 100 : 0;

  return {
    intent: 'fund_return',
    answer: `${fund.name} returned ${percent(returnPct)} between ${startRow?.nav_date ?? start} and ${endRow?.nav_date ?? end} based on NAV moving from ${startNav.toFixed(4)} to ${endNav.toFixed(4)}.`,
    tablesRead: ['funds', 'fund_nav'],
    toolName: 'researchFinance',
    inputSummary: { question, fundName, start, end },
  };
}

async function holdingReturn(question: string): Promise<ToolAnswer> {
  const rows = await query<{ fund_id: string; fund_name: string; units: string; purchase_date: string; purchase_nav: string }>(
    `SELECT fund_id, fund_name, units::text, purchase_date::text, purchase_nav::text FROM holdings ORDER BY fund_name`,
  );
  if (!rows.length) {
    return {
      intent: 'holding_return',
      answer: 'No holdings were found in the database.',
      tablesRead: ['holdings'],
      toolName: 'researchFinance',
      inputSummary: { question },
    };
  }

  const latestNav = await query<{ fund_id: string; nav: string; nav_date: string }>(
    `SELECT DISTINCT ON (fund_id) fund_id, nav::text, nav_date::text
     FROM fund_nav
     ORDER BY fund_id, nav_date DESC`,
  );
  const latestNavByFund = new Map(latestNav.map(row => [row.fund_id, row]));

  const enriched = rows.map(row => {
    const nav = latestNavByFund.get(row.fund_id);
    const units = asNumber(row.units);
    const purchaseNav = asNumber(row.purchase_nav);
    const currentNav = asNumber(nav?.nav);
    const cost = units * purchaseNav;
    const value = units * currentNav;
    return {
      ...row,
      latestNavDate: nav?.nav_date ?? row.purchase_date,
      currentNav,
      cost,
      value,
      absoluteReturn: value - cost,
      returnPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    };
  });

  const totalCost = enriched.reduce((sum, row) => sum + row.cost, 0);
  const totalValue = enriched.reduce((sum, row) => sum + row.value, 0);
  const absoluteReturn = totalValue - totalCost;
  const returnPct = totalCost > 0 ? (absoluteReturn / totalCost) * 100 : 0;

  if (/which|compare|better returns/i.test(question) && /since i bought|since i purchased|given when i bought/i.test(question)) {
    const ranked = [...enriched].sort((left, right) => right.returnPct - left.returnPct);
    return {
      intent: 'holding_return',
      answer: `Realised return ranking for the holdings you own:\n${ranked
        .map(row => `${row.fund_name}: ${percent(row.returnPct)} (${money(row.absoluteReturn)})`)
        .join('\n')}`,
      tablesRead: ['holdings', 'fund_nav'],
      toolName: 'researchFinance',
      inputSummary: { question },
    };
  }

  if (/portfolio worth today/i.test(question) || /how much have i made/i.test(question)) {
    return {
      intent: 'portfolio',
      answer: `Your portfolio is worth ${money(totalValue)} today. Your total realised gain is ${money(absoluteReturn)} (${percent(returnPct)}).`,
      tablesRead: ['holdings', 'fund_nav'],
      toolName: 'researchFinance',
      inputSummary: { question },
    };
  }

  const targetRaw = question.toLowerCase().match(/(?:on|for)\s+(?:my\s+)?([a-z0-9 '&-]+fund[a-z0-9 '&-]*)/i)?.[1];
  const target = targetRaw?.replace(/\bholding.*$/i, '').trim();
  const selected = target
    ? enriched.find(row => normalizeText(row.fund_name).includes(normalizeText(target)) || normalizeText(row.fund_id).includes(normalizeText(target)))
    : enriched[0];

  if (!selected) {
    return {
      intent: 'holding_return',
      answer: 'I could not identify the holding mentioned in the question.',
      tablesRead: ['holdings', 'fund_nav'],
      toolName: 'researchFinance',
      inputSummary: { question },
    };
  }

  return {
    intent: 'holding_return',
    answer: `${selected.fund_name} is worth ${money(selected.value)} today against a purchase cost of ${money(selected.cost)}, for a realised return of ${money(selected.absoluteReturn)} (${percent(selected.returnPct)}).`,
    tablesRead: ['holdings', 'fund_nav'],
    toolName: 'researchFinance',
    inputSummary: { question, fund: selected.fund_name },
  };
}

export async function researchFinance(question: string): Promise<ToolAnswer> {
  const text = question.toLowerCase();
  if (/recurr|subscription|repeat/i.test(text)) {
    return recurringSubscriptions(question);
  }
  if (/portfolio worth|how much have i made|absolute inr/.test(text)) {
    return holdingReturn(question);
  }
  if (/\b(fund|nav|return|yield|rank)\b/i.test(text) && /holding|portfolio|made on it|worth today|realised|since i bought|since i purchased|given when i bought|better returns/i.test(text)) {
    return holdingReturn(question);
  }
  if (/\b(fund|nav|return|yield|rank)\b/i.test(text)) {
    return fundPeriodReturn(question);
  }
  return spendByFilters(question);
}
