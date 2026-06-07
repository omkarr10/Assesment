const GENERIC_TOKENS = new Set([
  'upi',
  'neft',
  'imps',
  'rtgs',
  'netbanking',
  'debit',
  'credit',
  'card',
  'txn',
  'tx',
  'payment',
  'transfer',
  'reversal',
  'refund',
  'cash',
  'online',
  'order',
  'orders',
  'india',
  'ind',
  'bangalore',
  'bengaluru',
  'mumbai',
  'delhi',
  'chennai',
  'hyderabad',
  'pune',
  'kolkata',
]);

const DIGITS = /^[0-9]+$/;

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[*_/|,:;()[\]{}'"`~!?\\.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function merchantKey(rawMerchant: string, memo?: string | null): string {
  const primary = normalizeText(rawMerchant);
  const fallback = normalizeText(memo ?? '');
  const candidates = `${primary} ${fallback}`.trim().split(' ').filter(Boolean);

  const meaningful = candidates.filter(token => !GENERIC_TOKENS.has(token) && !DIGITS.test(token));
  if (meaningful.length === 0) {
    return primary || fallback || 'unknown';
  }

  return meaningful[0];
}

export function looksLikeTransfer(category: string, merchant: string, memo?: string | null): boolean {
  const text = `${category} ${merchant} ${memo ?? ''}`.toLowerCase();
  return /\btransfer\b|\bself\s*transfer\b|\bwallet\b|\bsweep\b/.test(text);
}

export function looksLikeRefund(amount: number): boolean {
  return amount < 0;
}

export function dedupeSorted(values: string[]): string[] {
  return [...new Set(values.map(normalizeText).filter(Boolean))].sort();
}
