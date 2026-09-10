ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fitting1_date date,
  ADD COLUMN IF NOT EXISTS fitting2_date date,
  ADD COLUMN IF NOT EXISTS event_date date;