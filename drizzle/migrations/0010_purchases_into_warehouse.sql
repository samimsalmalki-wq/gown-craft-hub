create or replace function public.post_expense()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_branch uuid;
begin
  if new.cash_account_id is not null then
    insert into public.cash_transactions
      (account_id, direction, amount, occurred_at, source, source_id, description, created_by)
    values (new.cash_account_id, 'out', new.amount, new.occurred_at, 'expense', new.id,
            new.expense_no || ' — ' || new.description, new.created_by);
  end if;

  if new.material_id is not null and coalesce(new.material_qty, 0) > 0 then
    -- مشتريات الخامات تدخل المخزن الرئيسي افتراضيًا
    select id into v_branch from public.branches where is_warehouse and is_active limit 1;
    v_branch := coalesce(v_branch, new.branch_id,
                         (select id from public.branches where is_main limit 1));

    insert into public.material_movements (material_id, branch_id, kind, qty, notes, created_by)
    values (new.material_id, v_branch, 'in', new.material_qty,
            'شراء بمستند ' || new.expense_no, new.created_by);
  end if;
  return new;
end $$;