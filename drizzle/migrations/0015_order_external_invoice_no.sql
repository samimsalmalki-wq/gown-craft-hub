alter table public.orders add column if not exists external_invoice_no text;

create unique index if not exists orders_external_invoice_no_key
  on public.orders (external_invoice_no)
  where external_invoice_no is not null;