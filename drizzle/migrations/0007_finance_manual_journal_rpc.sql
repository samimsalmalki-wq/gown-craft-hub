create or replace function public.add_journal_entry(
  _entry_date date,
  _memo text,
  _lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not private.can(auth.uid(), 'finance.accounts') then
    raise exception 'غير مصرح';
  end if;
  if coalesce(btrim(_memo), '') = '' then
    raise exception 'اكتب بيان القيد';
  end if;

  v_id := private.post_entry(coalesce(_entry_date, current_date), btrim(_memo),
                             'manual', null, _lines, auth.uid());
  if v_id is null then
    raise exception 'القيد فارغ';
  end if;
  return v_id;
end $$;

grant execute on function public.add_journal_entry(date, text, jsonb) to authenticated;
