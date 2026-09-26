/**
 * يجلب كل الصفوف على دفعات: Supabase يرجّع 1000 صف كحد أقصى في الطلب الواحد،
 * فبدون هذا تنقص المجاميع بصمت عند كثرة البيانات.
 * الاستعلام يجب أن يكون مرتّبًا ترتيبًا ثابتًا (أضف .order("id") كترتيب أخير).
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
