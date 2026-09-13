CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read whatsapp templates"
  ON public.whatsapp_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "managers can insert whatsapp templates"
  ON public.whatsapp_templates FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "managers can update whatsapp templates"
  ON public.whatsapp_templates FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'supervisor'));

CREATE TRIGGER touch_whatsapp_templates
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.whatsapp_templates (key, label, body, position) VALUES
  ('booking_confirm', 'تأكيد الحجز', 'مرحبًا {client_name} 🌸
تم تأكيد حجز فستانك برقم الطلب {order_no}.
تاريخ الحجز: {booked_at}
موعد التسليم المتوقع: {due_date}
شكرًا لثقتك بنا.', 1),
  ('fitting1_reminder', 'تذكير البروفة الأولى', 'مرحبًا {client_name} 🌸
تذكير بموعد البروفة الأولى لطلبك {order_no}.
الموعد: {fitting1_date}
نتشرف بحضورك في الوقت المحدد.', 2),
  ('fitting2_reminder', 'تذكير البروفة الثانية', 'مرحبًا {client_name} 🌸
تذكير بموعد البروفة الثانية لطلبك {order_no}.
الموعد: {fitting2_date}
في انتظارك.', 3),
  ('ready_delivery', 'الجاهزية للتسليم', 'مرحبًا {client_name} 🌸
فستانك برقم الطلب {order_no} جاهز للتسليم.
يمكنك التكرم بالحضور لاستلامه.
المبلغ المتبقي: {remaining}', 4),
  ('payment_reminder', 'تذكير مبلغ متبقٍ', 'مرحبًا {client_name} 🌸
تذكير بشأن طلبك {order_no}.
إجمالي القيمة: {total_amount}
المدفوع: {deposit_amount}
المتبقي: {remaining}
شكرًا لك.', 5),
  ('rental_return', 'تذكير إرجاع فستان الإيجار', 'مرحبًا {client_name} 🌸
تذكير بموعد إرجاع الفستان {dress_code}.
موعد الإرجاع: {return_due_date}
شكرًا لتعاونك.', 6);
