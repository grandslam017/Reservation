-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    booking_date DATE NOT NULL,
    time_slot TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    line_id_input TEXT,
    line_user_id TEXT,
    slip_url TEXT,
    invoice_no TEXT NOT NULL,
    receipt_no TEXT NOT NULL,
    court TEXT NOT NULL DEFAULT 'Main Court',
    require_coach BOOLEAN NOT NULL DEFAULT false,
    fee NUMERIC NOT NULL CHECK (fee >= 0),
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled'))
);

-- Create unique index to prevent double bookings on active (non-cancelled) bookings
CREATE UNIQUE INDEX IF NOT EXISTS unique_booking_slot 
ON public.bookings (booking_date, time_slot, court) 
WHERE (status != 'cancelled');

-- Create transactions table (financial ledger)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    transaction_date DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    description TEXT,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bookings
-- 1. Allow public (anonymous/authenticated) to read bookings (needed to display slots on calendar)
CREATE POLICY "Allow public read bookings" 
ON public.bookings 
FOR SELECT 
USING (true);

-- 2. Allow public to insert bookings (needed for customers to submit bookings)
CREATE POLICY "Allow public insert bookings" 
ON public.bookings 
FOR INSERT 
WITH CHECK (true);

-- 3. Only authenticated users (admins) can modify or delete bookings
CREATE POLICY "Allow admin update bookings" 
ON public.bookings 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow admin delete bookings" 
ON public.bookings 
FOR DELETE 
TO authenticated 
USING (true);

-- RLS Policies for transactions
-- Only authenticated users (admins) can access financial transactions
CREATE POLICY "Allow admin select transactions" 
ON public.transactions 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow admin insert transactions" 
ON public.transactions 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Allow admin update transactions" 
ON public.transactions 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow admin delete transactions" 
ON public.transactions 
FOR DELETE 
TO authenticated 
USING (true);

-- Set up Supabase Storage for Payment Slips
-- 1. Create slips bucket if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('slips', 'slips', true) 
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public to upload files to slips bucket
CREATE POLICY "Allow public upload slips" 
ON storage.objects 
FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'slips');

-- 3. Allow public to view slips
CREATE POLICY "Allow public read slips" 
ON storage.objects 
FOR SELECT 
TO public 
USING (bucket_id = 'slips');

-- 4. Only authenticated users (admins) can update or delete files
CREATE POLICY "Allow admin delete slips" 
ON storage.objects 
FOR DELETE 
TO authenticated 
USING (bucket_id = 'slips');

-- Automatically create a transaction when a booking is created
CREATE OR REPLACE FUNCTION public.after_booking_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.transactions (transaction_date, type, category, amount, description, booking_id)
  VALUES (
    NEW.booking_date,
    'income',
    'Court Rental',
    NEW.fee,
    'ค่าเช่าสนาม: คุณ ' || NEW.customer_name || ' (' || NEW.time_slot || ') [Receipt: ' || NEW.receipt_no || ']' || CASE WHEN NEW.require_coach THEN ' (+โค้ช)' ELSE '' END,
    NEW.id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_after_booking_insert
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.after_booking_insert();

-- Automatically delete the transaction when a booking is cancelled
CREATE OR REPLACE FUNCTION public.after_booking_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    DELETE FROM public.transactions WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_after_booking_update
AFTER UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.after_booking_update();

