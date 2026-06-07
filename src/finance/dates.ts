const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

export function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addMonths(value: Date, delta: number): Date {
  const result = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + delta, 1));
  return result;
}

export function startOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function endOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

export function parseIsoDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function datasetRelativeAnchor(latestTransactionDate: Date): Date {
  return startOfMonth(latestTransactionDate);
}

export function resolveRelativePhrase(question: string, latestTransactionDate: Date): { start: Date; end: Date; label: string } | null {
  const text = question.toLowerCase();
  const anchor = datasetRelativeAnchor(latestTransactionDate);

  const monthRangeMatch = text.match(
    /between\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*(20\d{2})?\s+and\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*(20\d{2})?/,
  );
  if (monthRangeMatch) {
    const startMonth = MONTHS[monthRangeMatch[1]];
    const endMonth = MONTHS[monthRangeMatch[3]];
    const startYear = Number(monthRangeMatch[2] ?? monthRangeMatch[4] ?? String(anchor.getUTCFullYear()));
    const endYear = Number(monthRangeMatch[4] ?? monthRangeMatch[2] ?? String(anchor.getUTCFullYear()));
    const start = new Date(Date.UTC(startYear, startMonth, 1));
    const end = endOfMonth(new Date(Date.UTC(endYear, endMonth, 1)));
    return { start, end, label: `${monthRangeMatch[1]} ${startYear} to ${monthRangeMatch[3]} ${endYear}` };
  }

  if (text.includes('last month')) {
    const month = addMonths(anchor, -1);
    return { start: startOfMonth(month), end: endOfMonth(month), label: 'last month' };
  }

  if (text.includes('this month')) {
    return { start: startOfMonth(anchor), end: endOfMonth(anchor), label: 'this month' };
  }

  if (text.includes('q1 2025')) {
    return { start: new Date(Date.UTC(2025, 0, 1)), end: new Date(Date.UTC(2025, 2, 31)), label: 'Q1 2025' };
  }

  if (text.includes('q4 2024')) {
    return { start: new Date(Date.UTC(2024, 9, 1)), end: new Date(Date.UTC(2024, 11, 31)), label: 'Q4 2024' };
  }

  const monthMatch = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/);
  if (monthMatch) {
    const monthIndex = MONTHS[monthMatch[1]];
    const year = Number(monthMatch[2]);
    const monthDate = new Date(Date.UTC(year, monthIndex, 1));
    return { start: startOfMonth(monthDate), end: endOfMonth(monthDate), label: `${monthMatch[1]} ${year}` };
  }

  const explicitRange = text.match(/between\s+(20\d{2}-\d{2}-\d{2})\s+and\s+(20\d{2}-\d{2}-\d{2})/);
  if (explicitRange) {
    const start = parseIsoDate(explicitRange[1]);
    const end = parseIsoDate(explicitRange[2]);
    if (start && end) {
      return { start, end, label: `${explicitRange[1]} to ${explicitRange[2]}` };
    }
  }

  return null;
}

export function monthRangeFromDateString(value: string): { start: Date; end: Date } | null {
  const parsed = parseIsoDate(value);
  if (!parsed) return null;
  return { start: startOfMonth(parsed), end: endOfMonth(parsed) };
}
