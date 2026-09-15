import { ALL_BRANCHES, useBranchScope, useBranches } from "@/lib/branches";

/** مُبدّل الفرع: يظهر لمن له صلاحية كل الفروع فقط */
export function BranchSwitcher() {
  const { canAll, branchId, setBranch } = useBranchScope();
  const { data: branches = [] } = useBranches();

  if (!canAll) return null;

  const active = branches.filter((b) => b.is_active);
  const sales = active.filter((b) => !b.is_warehouse);
  const stores = active.filter((b) => b.is_warehouse);

  return (
    <select
      aria-label="الفرع"
      value={branchId}
      onChange={(e) => setBranch(e.target.value)}
      className="field w-40"
    >
      <option value={ALL_BRANCHES}>كل الفروع</option>
      {sales.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
      {stores.length > 0 && (
        <optgroup label="مواقع المخزون">
          {stores.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
