ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cs';

ALTER TYPE public.stage_key ADD VALUE IF NOT EXISTS 'design_approval' AFTER 'design';
ALTER TYPE public.stage_key ADD VALUE IF NOT EXISTS 'embroidery' AFTER 'sewing';
ALTER TYPE public.stage_key ADD VALUE IF NOT EXISTS 'final_alterations' AFTER 'fitting2';

ALTER TYPE public.stage_status ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE public.stage_status ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE public.stage_status ADD VALUE IF NOT EXISTS 'late';

DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.alteration_status AS ENUM ('requested','in_progress','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;