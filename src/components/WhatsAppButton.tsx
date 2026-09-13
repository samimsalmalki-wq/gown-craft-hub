import { MessageCircle } from "lucide-react";
import { useState } from "react";

import type { Order } from "@/lib/atelier";
import type { RentalDress, RentalRecord } from "@/lib/inventory";
import {
  RENTAL_TEMPLATE_KEYS,
  fillTemplate,
  normalizePhone,
  orderVars,
  rentalVars,
  waLink,
} from "@/lib/whatsapp";
import { useLogWhatsapp, useWhatsappTemplates } from "@/lib/whatsapp-data";
import { cn } from "@/lib/utils";

type Props = {
  order?: Order;
  rental?: { record: RentalRecord; dress?: RentalDress | null };
  size?: "sm" | "md";
  className?: string;
};

export function WhatsAppButton({ order, rental, size = "md", className }: Props) {
  const { data: templates = [] } = useWhatsappTemplates();
  const log = useLogWhatsapp();
  const [open, setOpen] = useState(false);

  const rawPhone = order ? order.client_phone : (rental?.record.client_phone ?? null);
  const phone = normalizePhone(rawPhone);
  const vars = order
    ? orderVars(order)
    : rental
      ? rentalVars(rental.record, rental.dress)
      : {};

  const list = templates.filter(
    (t) => t.is_active && (order ? !RENTAL_TEMPLATE_KEYS.includes(t.key) : RENTAL_TEMPLATE_KEYS.includes(t.key)),
  );

  const base = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-paper font-medium transition-colors hover:bg-ivory disabled:opacity-50",
    size === "sm" ? "min-h-9 px-2.5 text-[12px]" : "min-h-11 px-4 text-sm",
    className,
  );

  if (!phone) {
    return (
      <button type="button" disabled title="لا يوجد رقم جوال" className={base}>
        <MessageCircle className="size-4" strokeWidth={1.75} />
        واتساب
      </button>
    );
  }

  function send(label: string, body: string) {
    const text = fillTemplate(body, vars);
    window.open(waLink(phone!, text), "_blank", "noopener");
    log.mutate({ orderId: order?.id ?? null, label, to: rawPhone ?? phone! });
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(base, "text-ok")}
      >
        <MessageCircle className="size-4" strokeWidth={1.75} />
        واتساب
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="إغلاق"
            className="fixed inset-0 z-30 cursor-default"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="absolute top-full left-0 z-40 mt-1 w-60 overflow-hidden rounded-xl border border-line bg-paper shadow-lg">
            {list.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                لا توجد رسائل مفعّلة.
              </p>
            ) : (
              list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    send(t.label, t.body);
                  }}
                  className="block w-full border-b border-line px-3 py-2.5 text-right text-[13px] last:border-0 hover:bg-ivory"
                >
                  {t.label}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
