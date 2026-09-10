ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS model_no text,
  ADD COLUMN IF NOT EXISTS is_new_model boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS embroidery_model text;