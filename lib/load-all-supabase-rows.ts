type SupabasePageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type SupabasePageLoader<T> = (
  from: number,
  to: number
) => PromiseLike<SupabasePageResult<T>>;

export async function loadAllSupabaseRows<T>(
  label: string,
  loadPage: SupabasePageLoader<T>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);

    if (error) {
      throw new Error(`${label}: ${error.message}`);
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}
