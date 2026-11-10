-- STAGING ONLY. Do NOT apply on the existing live Supabase project.
-- Replicates the initial baseline used in project kssxxizhpoxxlbsehymk.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  booking_date date not null,
  time_slot text not null,
  customer_name text not null,
  phone text,
  email text,
  line_id_input text,
  line_user_id text,
  slip_url text,
  invoice_no text not null,
  receipt_no text not null,
  court text not null default 'Main Court',
  require_coach boolean not null default false,
  fee numeric not null check (fee >= 0),
  status text not null default 'confirmed'
    check (status in ('confirmed','cancelled','pending_hold')),
  admin_notes text,
  calendar_event_id text,
  customer_notes text default ''
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  transaction_date date not null,
  type text not null check (type in ('income','expense')),
  category text not null,
  amount numeric not null check (amount >= 0),
  description text,
  booking_id uuid references public.bookings(id) on delete set null
);
create unique index unique_booking_slot
  on public.bookings(booking_date,time_slot,court)
  where status <> 'cancelled';
create index idx_transactions_booking_id on public.transactions(booking_id);
alter table public.bookings enable row level security;
alter table public.transactions enable row level security;
revoke all on table public.bookings from public,anon,authenticated;
revoke all on table public.transactions from public,anon,authenticated;
