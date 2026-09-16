CREATE TABLE public.material_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.material_categories TO authenticated;
GRANT ALL ON public.material_categories TO service_role;

ALTER TABLE public.material_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team reads material categories" ON public.material_categories
  FOR SELECT USING (private.is_team(auth.uid()));

CREATE POLICY "managers add material categories" ON public.material_categories
  FOR INSERT WITH CHECK (private.is_manager_or_supervisor(auth.uid()));

CREATE POLICY "managers update material categories" ON public.material_categories
  FOR UPDATE USING (private.is_manager_or_supervisor(auth.uid()));

INSERT INTO public.material_categories (key, label, position) VALUES
  ('fabric', 'قماش', 1),
  ('lace', 'دانتيل', 2),
  ('embroidery', 'قطع تطريز', 3),
  ('trim', 'خرز وترتر', 4),
  ('thread', 'خيوط', 5),
  ('notion', 'مستلزمات خياطة', 6),
  ('accessory', 'إكسسوار', 7),
  ('packaging', 'تغليف', 8),
  ('other', 'أخرى', 9)
ON CONFLICT (key) DO NOTHING;

-- أي تصنيف مستخدم في الخامات ولم يُسجَّل بعد
INSERT INTO public.material_categories (key, label, position)
SELECT DISTINCT m.category, m.category, 50
FROM public.materials m
WHERE m.category IS NOT NULL AND m.category <> ''
ON CONFLICT (key) DO NOTHING;