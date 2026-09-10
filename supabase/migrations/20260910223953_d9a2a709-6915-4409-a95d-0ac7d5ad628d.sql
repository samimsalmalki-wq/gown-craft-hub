-- 1) status only becomes rented when the out date has arrived
CREATE OR REPLACE FUNCTION public.apply_rental_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.returned_at IS NULL AND NEW.out_date <= current_date THEN
      UPDATE public.rental_dresses SET status = 'rented' WHERE id = NEW.dress_id AND status = 'available';
    END IF;
  ELSIF NEW.returned_at IS NOT NULL AND OLD.returned_at IS NULL THEN
    UPDATE public.rental_dresses
       SET status = CASE
         WHEN NEW.return_condition = 'cleaning' THEN 'cleaning'::public.rental_dress_status
         WHEN NEW.return_condition = 'repair' THEN 'repair'::public.rental_dress_status
         ELSE 'available'::public.rental_dress_status END
     WHERE id = NEW.dress_id;
  ELSIF NEW.returned_at IS NULL AND NEW.out_date <= current_date THEN
    UPDATE public.rental_dresses SET status = 'rented' WHERE id = NEW.dress_id AND status = 'available';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.apply_rental_status() FROM PUBLIC, anon, authenticated;

-- 2) prevent overlapping bookings for the same dress
CREATE OR REPLACE FUNCTION public.check_rental_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_conflict record;
BEGIN
  IF NEW.returned_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.due_date < NEW.out_date THEN
    RAISE EXCEPTION 'تاريخ الإرجاع لا يمكن أن يكون قبل تاريخ الخروج';
  END IF;

  SELECT r.out_date, r.due_date, r.client_name INTO v_conflict
  FROM public.rental_records r
  WHERE r.dress_id = NEW.dress_id
    AND r.id <> NEW.id
    AND r.returned_at IS NULL
    AND r.out_date <= NEW.due_date
    AND r.due_date >= NEW.out_date
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'الفستان محجوز من % إلى % (%)', v_conflict.out_date, v_conflict.due_date, v_conflict.client_name;
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.check_rental_overlap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rental_overlap_ins ON public.rental_records;
CREATE TRIGGER rental_overlap_ins BEFORE INSERT ON public.rental_records
  FOR EACH ROW EXECUTE FUNCTION public.check_rental_overlap();

DROP TRIGGER IF EXISTS rental_overlap_upd ON public.rental_records;
CREATE TRIGGER rental_overlap_upd BEFORE UPDATE OF out_date, due_date, dress_id ON public.rental_records
  FOR EACH ROW EXECUTE FUNCTION public.check_rental_overlap();

-- 3) daily promotion of due bookings to rented
CREATE OR REPLACE FUNCTION private.promote_due_rentals()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.rental_dresses d
     SET status = 'rented'
   WHERE d.status = 'available'
     AND EXISTS (
       SELECT 1 FROM public.rental_records r
        WHERE r.dress_id = d.id
          AND r.returned_at IS NULL
          AND r.out_date <= current_date
     );
$function$;