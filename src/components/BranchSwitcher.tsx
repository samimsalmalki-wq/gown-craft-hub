import { ALL_BRANCHES, useBranchScope, useBranches } from "@/lib/branches";

/** مُبدّل الفرع: يظهر لمن له صلاحية كل الفروع فقط */
export function BranchSwitcher() {
  const { canAll, branchId, setBranch } = useBranchScope();
  const { data: branches = [] } = useBranches();

  if (!canAll) return null;

  return (
    <select
      aria-label="الفرع"
      value={branchId}
      onChange={(e) => setBranch(e.target.value)}
      className="field w-40"
    >
      <option value={ALL_BRANCHES}>كل الفروع</option>
      {branches
        .filter((b) => b.is_active)
        .map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
    </select>
  );
}
