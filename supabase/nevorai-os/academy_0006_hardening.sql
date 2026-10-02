-- Academy OS · hardening round 1 (2026-10-02). Run in Nevorai OS. Safe to re-run.
-- 1) Online (gateway) payments could never reach the ledger: record_billing_payment only let a signed-in
--    owner / platform admin call it, so the payment webhook (service role) was always refused. The service
--    role is now allowed too. Nothing else about the function changes.
-- 2) The attendance clean-up functions could be run by ANY signed-out visitor (one even takes the date as input).
--    They are now service-role only, except process_daily_attendance_cleanup which the signed-in dashboard calls.
-- 3) A signed-out visitor held INSERT/UPDATE/DELETE on every Academy table (row rules were the only guard).
--    Now a signed-out visitor keeps ONLY what the public pages read (the tables that already have a public
--    row rule) plus submitting a registration.
begin;

CREATE OR REPLACE FUNCTION academy.record_billing_payment(_tenant_id uuid, _student_id uuid, _amount numeric, _method text, _allocations jsonb, _reference_number text DEFAULT NULL::text, _gateway text DEFAULT NULL::text, _gateway_reference text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text, _collected_at timestamp with time zone DEFAULT now(), _remarks text DEFAULT NULL::text, _status text DEFAULT 'succeeded'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'academy'
AS $function$
DECLARE
  existing_id uuid;
  new_payment_id uuid;
  alloc_sum numeric := 0;
  alloc jsonb;
  inv academy.billing_invoices%ROWTYPE;
  new_paid numeric;
  new_status text;
BEGIN
  IF NOT (coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          OR academy.is_tenant_owner(auth.uid(), _tenant_id)
          OR academy.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  -- Idempotency
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO existing_id FROM academy.billing_payments
     WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
    IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;
  END IF;

  -- Validate allocations
  IF _allocations IS NOT NULL THEN
    FOR alloc IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
      alloc_sum := alloc_sum + (alloc->>'amount')::numeric;
    END LOOP;
    IF alloc_sum > _amount + 0.005 THEN
      RAISE EXCEPTION 'Allocations (%) exceed payment amount (%)', alloc_sum, _amount;
    END IF;
  END IF;

  INSERT INTO academy.billing_payments
    (tenant_id, student_id, amount, method, reference_number,
     gateway, gateway_reference, idempotency_key, status,
     collected_by, collected_at, remarks, created_by)
  VALUES
    (_tenant_id, _student_id, _amount, _method, _reference_number,
     _gateway, _gateway_reference, _idempotency_key, _status,
     auth.uid(), _collected_at, _remarks, auth.uid())
  RETURNING id INTO new_payment_id;

  -- Only allocate if payment is succeeded
  IF _status = 'succeeded' AND _allocations IS NOT NULL THEN
    FOR alloc IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
      INSERT INTO academy.billing_payment_allocations
        (tenant_id, payment_id, invoice_id, amount, created_by)
      VALUES
        (_tenant_id, new_payment_id, (alloc->>'invoice_id')::uuid,
         (alloc->>'amount')::numeric, auth.uid());

      SELECT * INTO inv FROM academy.billing_invoices
        WHERE id = (alloc->>'invoice_id')::uuid AND tenant_id = _tenant_id
        FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not in tenant'; END IF;
      IF inv.status = 'void' THEN RAISE EXCEPTION 'Cannot allocate to void invoice'; END IF;

      new_paid := inv.amount_paid + (alloc->>'amount')::numeric;
      IF new_paid >= inv.total THEN new_status := 'paid';
      ELSIF new_paid > 0 THEN new_status := 'partially_paid';
      ELSE new_status := inv.status; END IF;

      UPDATE academy.billing_invoices
         SET amount_paid = new_paid,
             balance = GREATEST(total - new_paid, 0),
             status = new_status
       WHERE id = inv.id;
    END LOOP;
  END IF;

  INSERT INTO academy.billing_audit_log(tenant_id, entity_type, entity_id, action, actor_id, after_state)
  VALUES (_tenant_id, 'payment', new_payment_id, 'created', auth.uid(),
          jsonb_build_object('amount', _amount, 'method', _method, 'allocated', alloc_sum));

  RETURN new_payment_id;
END; $function$;

revoke all on function academy.auto_close_stale_attendance() from public, anon, authenticated;
grant execute on function academy.auto_close_stale_attendance() to service_role;
revoke all on function academy.auto_close_student_stale_attendance(uuid, date) from public, anon, authenticated;
grant execute on function academy.auto_close_student_stale_attendance(uuid, date) to service_role;
revoke all on function academy.process_daily_attendance_cleanup() from public, anon;
grant execute on function academy.process_daily_attendance_cleanup() to authenticated, service_role;

revoke all on all tables in schema academy from anon;
revoke all on all sequences in schema academy from anon;
grant select on
  academy.automation_rule_templates,
  academy.batches,
  academy.fee_plans,
  academy.mc_ball_events,
  academy.mc_innings,
  academy.mc_match_squads,
  academy.mc_matches,
  academy.mc_public_matches,
  academy.mc_public_settings,
  academy.mc_teams,
  academy.mc_tournament_groups,
  academy.mc_tournament_officials,
  academy.mc_tournament_rounds,
  academy.mc_tournament_teams,
  academy.mc_tournament_venues,
  academy.mc_tournaments,
  academy.platform_settings,
  academy.platform_sports,
  academy.policy_documents,
  academy.site_content,
  academy.tenants_public_directory,
  academy.mc_public_squad_players
to anon;
grant insert on academy.registrations to anon;

insert into platform.app_migrations (app_key, version) values ('academy', 'academy_0006_hardening') on conflict do nothing;

commit;

-- Proof (expect: gateway_can_record true; the three cleanup columns false; anon_write_tables 1 (registrations); anon_read_tables 22)
select
  position('service_role' in pg_get_functiondef('academy.record_billing_payment(uuid,uuid,numeric,text,jsonb,text,text,text,text,timestamptz,text,text)'::regprocedure)) > 0 as gateway_can_record,
  has_function_privilege('anon', 'academy.auto_close_stale_attendance()', 'execute')                 as anon_cleanup_all,
  has_function_privilege('anon', 'academy.auto_close_student_stale_attendance(uuid,date)', 'execute') as anon_cleanup_one,
  has_function_privilege('anon', 'academy.process_daily_attendance_cleanup()', 'execute')            as anon_cleanup_daily,
  (select count(*) from information_schema.role_table_grants
     where table_schema = 'academy' and grantee = 'anon' and privilege_type in ('INSERT','UPDATE','DELETE')) as anon_write_tables,
  (select count(distinct table_name) from information_schema.role_table_grants
     where table_schema = 'academy' and grantee = 'anon' and privilege_type = 'SELECT') as anon_read_tables;
