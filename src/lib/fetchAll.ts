/**
 * Read every row of a query, a page at a time.
 *
 * Supabase caps a single response at 1000 rows by default and does not report
 * that it truncated — the request simply succeeds with a short list. Several
 * screens aggregate over a whole table (stock movements to derive total stock,
 * completed sales to derive customer lifetime value and all-time revenue), so
 * once the shop crosses 1000 of those rows the totals would silently start
 * reading low, with nothing to indicate it.
 *
 * The caller supplies a function that applies a range to its own query, and must
 * order it — pagination without a stable sort can repeat or skip rows between
 * pages.
 */

const PAGE_SIZE = 1000;

/** Guard against an unbounded loop if a query ever returns a full page forever. */
const MAX_PAGES = 100;

export interface RangeResult<T> {
  data: T[] | null;
  error: { message?: string } | null;
}

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<RangeResult<T>>
): Promise<T[]> {
  const rows: T[] = [];

  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);

    // A short page means we have reached the end. An exactly-full page is
    // ambiguous, so it costs one more request to confirm.
    if (batch.length < PAGE_SIZE) return rows;
  }

  console.warn(`fetchAllRows stopped at the ${MAX_PAGES}-page limit (${rows.length} rows); the result may be incomplete.`);
  return rows;
}
