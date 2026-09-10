-- ============ enums ============
DO $$ BEGIN
  CREATE TYPE public.material_movement_kind AS ENUM ('in','out','reserve','release');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.rental_dress_status AS ENUM ('available','rented','cleaning','repair','retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ helper: supervisor-or-admin ============
CREATE OR REPLACE FUNCTION private.is_manager_or_supervisor(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role IN ('admin','supervisor')
  )
$$;
REVOKE ALL ON FUNCTION private.is_manager_or_supervisor(uuid) FROM public;
GRANT EXECUTE ON FUNCTION private.is_manager_or_supervisor(uuid) TO authenticated;

-- ============ materials ============
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'fabric',
  unit text NOT NULL DEFAULT 'متر',
  qty_on_hand numeric NOT NULL DEFAULT 0,
  qty_reserved numeric NOT NULL DEFAULT 0,
  min_qty numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  supplier text,
  image_path text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials readable by team" ON public.materials
  FOR SELECT TO authenticated USING (private.is_team(auth.uid()));
CREATE POLICY "materials insert by managers" ON public.materials
  FOR INSERT TO authenticated WITH CHECK (private.is_manager_or_supervisor(auth.uid()));
CREATE POLICY "materials update by managers" ON public.materials
  FOR UPDATE TO authenticated
  USING (private.is_manager_or_supervisor(auth.uid()))
  WITH CHECK (private.is_manager_or_supervisor(auth.uid()));
CREATE POLICY "materials delete by admin" ON public.materials
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER materials_touch BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ material_movements ============
CREATE TABLE IF NOT EXISTS public.material_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  kind public.material_movement_kind NOT NULL,
  qty numeric NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS material_movements_material_idx ON public.material_movements(material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS material_movements_order_idx ON public.material_movements(order_id);
GRANT SELECT, INSERT ON public.material_movements TO authenticated;
GRANT ALL ON public.material_movements TO service_role;
ALTER TABLE public.material_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements readable by team" ON public.material_movements
  FOR SELECT TO authenticated USING (private.is_team(auth.uid()));
CREATE POLICY "movements insert by managers" ON public.material_movements
  FOR INSERT TO authenticated
  WITH CHECK (private.is_manager_or_supervisor(auth.uid()) AND created_by = auth.uid());

-- apply movement to material quantities
CREATE OR REPLACE FUNCTION public.apply_material_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  SELECT name INTO v_name FROM public.materials WHERE id = NEW.material_id;
  IF NEW.kind = 'in' THEN
    UPDATE public.materials SET qty_on_hand = qty_on_hand + NEW.qty WHERE id = NEW.material_id;
  ELSIF NEW.kind = 'out' THEN
    UPDATE public.materials
       SET qty_on_hand = qty_on_hand - NEW.qty,
           qty_reserved = GREATEST(0, qty_reserved - NEW.qty)
     WHERE id = NEW.material_id;
  ELSIF NEW.kind = 'reserve' THEN
    UPDATE public.materials SET qty_reserved = qty_reserved + NEW.qty WHERE id = NEW.material_id;
  ELSIF NEW.kind = 'release' THEN
    UPDATE public.materials SET qty_reserved = GREATEST(0, qty_reserved - NEW.qty) WHERE id = NEW.material_id;
  END IF;

  IF NEW.order_id IS NOT NULL THEN
    PERFORM private.log_activity(NEW.order_id, NULL, 'material_' || NEW.kind::text,
      coalesce(v_name,'مادة') || ' — ' || NEW.qty::text);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER movements_apply AFTER INSERT ON public.material_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_material_movement();

-- ============ order_materials ============
CREATE TABLE IF NOT EXISTS public.order_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  qty_reserved numeric NOT NULL DEFAULT 0,
  qty_issued numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, material_id)
);
GRANT SELECT, INSERT, UPDATE ON public.order_materials TO authenticated;
GRANT ALL ON public.order_materials TO service_role;
ALTER TABLE public.order_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order materials readable by team" ON public.order_materials
  FOR SELECT TO authenticated USING (private.is_team(auth.uid()));
CREATE POLICY "order materials insert by managers" ON public.order_materials
  FOR INSERT TO authenticated WITH CHECK (private.is_manager_or_supervisor(auth.uid()));
CREATE POLICY "order materials update by managers" ON public.order_materials
  FOR UPDATE TO authenticated
  USING (private.is_manager_or_supervisor(auth.uid()))
  WITH CHECK (private.is_manager_or_supervisor(auth.uid()));
CREATE TRIGGER order_materials_touch BEFORE UPDATE ON public.order_materials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ rental_dresses ============
CREATE TABLE IF NOT EXISTS public.rental_dresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  model_no text,
  size text,
  color text,
  rent_price numeric NOT NULL DEFAULT 0,
  deposit_amount numeric NOT NULL DEFAULT 0,
  status public.rental_dress_status NOT NULL DEFAULT 'available',
  image_path text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rental_dresses_code_idx ON public.rental_dresses(lower(code));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_dresses TO authenticated;
GRANT ALL ON public.rental_dresses TO service_role;
ALTER TABLE public.rental_dresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dresses readable by team" ON public.rental_dresses
  FOR SELECT TO authenticated USING (private.is_team(auth.uid()));
CREATE POLICY "dresses insert by managers" ON public.rental_dresses
  FOR INSERT TO authenticated WITH CHECK (private.is_manager_or_supervisor(auth.uid()));
CREATE POLICY "dresses update by managers" ON public.rental_dresses
  FOR UPDATE TO authenticated
  USING (private.is_manager_or_supervisor(auth.uid()))
  WITH CHECK (private.is_manager_or_supervisor(auth.uid()));
CREATE POLICY "dresses delete by admin" ON public.rental_dresses
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER rental_dresses_touch BEFORE UPDATE ON public.rental_dresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ rental_records ============
CREATE TABLE IF NOT EXISTS public.rental_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dress_id uuid NOT NULL REFERENCES public.rental_dresses(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_phone text,
  out_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  returned_at date,
  amount numeric NOT NULL DEFAULT 0,
  deposit_amount numeric NOT NULL DEFAULT 0,
  return_condition text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_records_dress_idx ON public.rental_records(dress_id, out_date DESC);
GRANT SELECT, INSERT, UPDATE ON public.rental_records TO authenticated;
GRANT ALL ON public.rental_records TO service_role;
ALTER TABLE public.rental_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rentals readable by team" ON public.rental_records
  FOR SELECT TO authenticated USING (private.is_team(auth.uid()));
CREATE POLICY "rentals insert by managers" ON public.rental_records
  FOR INSERT TO authenticated
  WITH CHECK (private.is_manager_or_supervisor(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "rentals update by managers" ON public.rental_records
  FOR UPDATE TO authenticated
  USING (private.is_manager_or_supervisor(auth.uid()))
  WITH CHECK (private.is_manager_or_supervisor(auth.uid()));
CREATE TRIGGER rental_records_touch BEFORE UPDATE ON public.rental_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- dress status follows rental lifecycle
CREATE OR REPLACE FUNCTION public.apply_rental_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.returned_at IS NULL THEN
      UPDATE public.rental_dresses SET status = 'rented' WHERE id = NEW.dress_id;
    END IF;
  ELSIF NEW.returned_at IS NOT NULL AND OLD.returned_at IS NULL THEN
    UPDATE public.rental_dresses
       SET status = CASE
         WHEN NEW.return_condition = 'cleaning' THEN 'cleaning'::public.rental_dress_status
         WHEN NEW.return_condition = 'repair' THEN 'repair'::public.rental_dress_status
         ELSE 'available'::public.rental_dress_status END
     WHERE id = NEW.dress_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rental_status_ins AFTER INSERT ON public.rental_records
  FOR EACH ROW EXECUTE FUNCTION public.apply_rental_status();
CREATE TRIGGER rental_status_upd AFTER UPDATE ON public.rental_records
  FOR EACH ROW EXECUTE FUNCTION public.apply_rental_status();