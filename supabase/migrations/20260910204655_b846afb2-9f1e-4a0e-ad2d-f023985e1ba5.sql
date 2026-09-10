CREATE OR REPLACE FUNCTION private.log_activity(_order_id uuid, _stage_id uuid, _action text, _details text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  insert into public.activity_log (order_id, stage_id, actor_id, action, details)
  values (_order_id, _stage_id, auth.uid(), _action, _details);
end $$;
REVOKE ALL ON FUNCTION private.log_activity(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if TG_OP = 'INSERT' then
    perform private.log_activity(new.id, null, 'order_created', 'إنشاء الطلب ' || new.order_no);
    return new;
  end if;
  if new.current_stage is distinct from old.current_stage then
    perform private.log_activity(new.id, null, 'stage_changed', 'انتقال إلى مرحلة: ' || new.current_stage::text);
  end if;
  if new.due_date is distinct from old.due_date then
    perform private.log_activity(new.id, null, 'due_date_changed', 'موعد التسليم: ' || coalesce(new.due_date::text,'—'));
  end if;
  if new.payment_status is distinct from old.payment_status then
    perform private.log_activity(new.id, null, 'payment_changed', 'حالة الدفع: ' || new.payment_status::text);
  end if;
  if new.state is distinct from old.state then
    perform private.log_activity(new.id, null, 'state_changed', 'حالة الطلب: ' || new.state::text);
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.audit_stages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_no text; v_label text; m record;
begin
  select order_no into v_no from public.orders where id = new.order_id;
  select label into v_label from public.stage_templates where stage = new.stage;
  v_label := coalesce(v_label, new.stage::text);

  if new.assignee_id is distinct from old.assignee_id then
    perform private.log_activity(new.order_id, new.id, 'assigned',
      'إسناد مرحلة ' || v_label || ' إلى ' || coalesce(new.assignee_name, '—'));
    perform private.notify(new.assignee_id, new.order_id, new.id, 'task_assigned',
      'لديك مهمة جديدة: ' || v_label || ' — طلب ' || coalesce(v_no,''));
  end if;

  if new.status is distinct from old.status then
    perform private.log_activity(new.order_id, new.id, 'stage_status', v_label || ' → ' || new.status::text);
    if new.status = 'in_progress' and old.status <> 'in_progress' then
      perform private.log_activity(new.order_id, new.id, 'work_started', 'بدء العمل في ' || v_label);
    elsif new.status = 'blocked' then
      perform private.log_activity(new.order_id, new.id, 'work_paused',
        'إيقاف العمل في ' || v_label || coalesce(' — ' || new.delay_reason, ''));
    elsif new.status = 'review' then
      perform private.log_activity(new.order_id, new.id, 'work_finished', 'إنهاء العمل بانتظار المراجعة: ' || v_label);
      for m in select ur.user_id from public.user_roles ur where ur.role in ('admin','supervisor') loop
        perform private.notify(m.user_id, new.order_id, new.id, 'review_needed',
          'مرحلة ' || v_label || ' في طلب ' || coalesce(v_no,'') || ' تحتاج مراجعة');
      end loop;
    elsif new.status = 'done' then
      perform private.log_activity(new.order_id, new.id, 'work_finished', 'إكمال مرحلة ' || v_label);
    end if;
  end if;

  if new.review_status is distinct from old.review_status and new.review_status is not null then
    perform private.log_activity(new.order_id, new.id,
      case new.review_status when 'approved' then 'stage_approved' else 'stage_rejected' end,
      v_label || coalesce(' — ' || new.review_notes, ''));
    perform private.notify(new.assignee_id, new.order_id, new.id,
      case new.review_status when 'approved' then 'approved' else 'rejected' end,
      case new.review_status
        when 'approved' then 'تم اعتماد العمل في ' || v_label
        else 'تم رفض مرحلة ' || v_label || ' وتحتاج تعديلًا' || coalesce(': ' || new.review_notes, '')
      end);
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.audit_alterations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if TG_OP = 'INSERT' then
    perform private.log_activity(new.order_id, new.stage_id, 'alteration_added',
      'تعديل رقم ' || new.number || ': ' || new.description);
    perform private.notify(new.assignee_id, new.order_id, new.stage_id, 'task_assigned',
      'تعديل جديد مسند إليك: ' || new.description);
  elsif new.status is distinct from old.status then
    perform private.log_activity(new.order_id, new.stage_id, 'alteration_status',
      'تعديل رقم ' || new.number || ' → ' || new.status::text);
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.audit_files()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  perform private.log_activity(new.order_id, new.stage_id, 'file_added', 'إضافة مرفق');
  return new;
end $$;

DROP FUNCTION IF EXISTS public.log_activity(uuid, uuid, text, text);

REVOKE ALL ON FUNCTION public.audit_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_stages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_alterations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_files() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_default_stages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stage_duration() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_alteration_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;