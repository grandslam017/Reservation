-- STAGING ONLY. Reservation confirmation and verified payment must be separate.
ALTER TABLE public.bookings
  ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid'
  CHECK(payment_status IN ('unpaid','paid','refunded'));
ALTER TABLE public.bookings
  ADD COLUMN payment_verified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_rental_income_per_booking
  ON public.transactions(booking_id)
  WHERE booking_id IS NOT NULL AND type='income' AND category='Court Rental';

CREATE OR REPLACE FUNCTION public.staging_confirm_hold_v2(p_owner uuid, p_token uuid, p_request_id uuid, p_name text, p_phone text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_group booking_internal.hold_groups%rowtype; v_row record;
 v_month text; v_number integer; v_invoice text; v_receipt text;
 v_result jsonb; v_ids uuid[] := '{}'::uuid[];
 v_fee numeric;
begin
 if p_owner is null then raise exception 'MISSING_OWNER'; end if;
 if p_token is null or p_request_id is null then raise exception 'MISSING_TOKEN_OR_IDEMPOTENCY_KEY'; end if;
 select * into v_group from booking_internal.hold_groups where token=p_token for update;
 if not found then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
 if v_group.owner_id IS DISTINCT FROM p_owner then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
 if v_group.state='confirmed' then
   if v_group.confirm_request_id=p_request_id then return v_group.result; end if;
   return jsonb_build_object('success',false,'error','ALREADY_CONFIRMED');
 end if;
 if v_group.state <> 'pending' then return jsonb_build_object('success',false,'error','HOLD_RELEASED'); end if;
 if v_group.expires_at <= now() then return jsonb_build_object('success',false,'error','HOLD_EXPIRED'); end if;
 if p_name is null or length(btrim(p_name)) < 2 or length(p_name)>100
    or p_phone is null or p_phone !~ '^[0-9]{9,15}$'
    or (p_email is not null and (length(p_email)>254 or p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$'))
 then return jsonb_build_object('success',false,'error','INVALID_CUSTOMER'); end if;

 select to_char(b.booking_date,'YYYYMM') into v_month
 from booking_internal.hold_slots hs join public.bookings b on b.id=hs.booking_id
 where hs.hold_id=v_group.id limit 1;
 if v_month is null then raise exception 'EMPTY_HOLD'; end if;
 insert into booking_internal.receipt_sequences(month_key,last_number)
   values(v_month,1) on conflict(month_key) do update
   set last_number=booking_internal.receipt_sequences.last_number + 1
   returning last_number into v_number;
 v_invoice := 'INV.'||v_month||lpad(v_number::text,3,'0');
 v_receipt := 'UNPAID.'||v_month||lpad(v_number::text,3,'0');

 for v_row in
    select b.* from booking_internal.hold_slots hs
    join public.bookings b on b.id=hs.booking_id
    where hs.hold_id=v_group.id order by b.time_slot for update of b
 loop
    if v_row.status <> 'pending_hold' then raise exception 'HOLD_INCONSISTENT'; end if;
    v_fee := booking_internal.slot_fee(v_row.booking_date,booking_internal.assert_slot(v_row.time_slot));
    update public.bookings set status='confirmed',customer_name=btrim(p_name),
       phone=p_phone,email=p_email,fee=v_fee,invoice_no=v_invoice,receipt_no=v_receipt
      where id=v_row.id;
    -- Financial income is recorded ONLY after admin-verified payment, not on booking.
    v_ids := array_append(v_ids,v_row.id);
 end loop;
 v_result := jsonb_build_object('success',true,'booking_ids',to_jsonb(v_ids),
                                'invoice_no',v_invoice,'receipt_no',null,'payment_verified',false);
 update booking_internal.hold_groups set state='confirmed',
   confirm_request_id=p_request_id,result=v_result where id=v_group.id;
 return v_result;
end; $function$
;

REVOKE ALL ON FUNCTION public.staging_confirm_hold_v2(uuid,uuid,uuid,text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_confirm_hold_v2(uuid,uuid,uuid,text,text,text) TO service_role;

-- This function is for server-validated admins only. Staging Edge must verify
-- a server-controlled admin role before invoking it.
CREATE OR REPLACE FUNCTION public.staging_verify_booking_payment(
 p_booking_id uuid, p_admin_id uuid, p_reference text default null
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v public.bookings%rowtype; v_receipt text; v_tx uuid;
BEGIN
 IF p_admin_id IS NULL OR p_booking_id IS NULL THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 SELECT * INTO v FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 IF v.status <> 'confirmed' THEN RETURN jsonb_build_object('success',false,'error','NOT_CONFIRMED'); END IF;
 IF v.payment_status='paid' THEN RETURN jsonb_build_object('success',true,'already_paid',true,'receipt_no',v.receipt_no); END IF;
 IF v.payment_status <> 'unpaid' THEN RETURN jsonb_build_object('success',false,'error','PAYMENT_STATE_INVALID'); END IF;
 IF p_reference IS NOT NULL AND length(p_reference)>100 THEN RAISE EXCEPTION 'INVALID_REFERENCE'; END IF;
 v_receipt := replace(v.invoice_no,'INV.','R.');
 UPDATE public.bookings
   SET payment_status='paid',payment_verified_at=now(),receipt_no=v_receipt
   WHERE id=p_booking_id;
 INSERT INTO public.transactions(transaction_date,type,category,amount,description,booking_id)
   VALUES(v.booking_date,'income','Court Rental',v.fee,
          'Verified payment by admin '||p_admin_id::text||' '||coalesce(p_reference,''),v.id)
   RETURNING id INTO v_tx;
 RETURN jsonb_build_object('success',true,'receipt_no',v_receipt,'transaction_id',v_tx,'amount',v.fee);
END; $$;
REVOKE ALL ON FUNCTION public.staging_verify_booking_payment(uuid,uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_verify_booking_payment(uuid,uuid,text) TO service_role;
