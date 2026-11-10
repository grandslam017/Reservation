-- STAGING only: optional phone/email consistent with original form.
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
 v_clean_phone text;
 v_clean_email text;
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
 v_clean_phone := nullif(regexp_replace(coalesce(p_phone,''),'[[:space:]()-]','','g'),'');
 v_clean_email := nullif(btrim(coalesce(p_email,'')),'');
 if p_name is null or length(btrim(p_name)) < 2 or length(p_name)>100
    or (v_clean_phone is not null and v_clean_phone !~ '^[0-9]{9,15}$')
    or (v_clean_email is not null and
        (length(v_clean_email)>254 or v_clean_email !~ '^[^ @]+@[^ @]+[.][^ @]+$'))
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
       phone=v_clean_phone,email=v_clean_email,fee=v_fee,invoice_no=v_invoice,receipt_no=v_receipt
      where id=v_row.id;
    -- Financial income is recorded ONLY after admin-verified payment, not on booking.
    v_ids := array_append(v_ids,v_row.id);
 end loop;
 v_result := jsonb_build_object('success',true,'booking_ids',to_jsonb(v_ids),
                                'invoice_no',v_invoice,'receipt_no',null,'payment_verified',false);
 update booking_internal.hold_groups set state='confirmed',
   confirm_request_id=p_request_id,result=v_result where id=v_group.id;
 return v_result;
end; $function$;
