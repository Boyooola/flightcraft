export async function fetchAllRows<T>(
  query: any,
  pageSize = 1000,
): Promise<T[]> {
  let from = 0;
  let done = false;
  const results: T[] = [];

  while (!done) {
    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) throw error;

    if (data?.length) {
      results.push(...data);
    }

    if (!data || data.length < pageSize) {
      done = true;
    } else {
      from += pageSize;
    }
  }

  return results;
}
