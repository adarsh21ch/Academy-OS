-- Fix: public academy website was dead for every tenant.
--
-- get_public_academy_bundle() selected m.venue and m.format from mc_matches.
-- Neither column exists — the real columns are ground_name and match_format.
-- Because the function is plpgsql, Postgres prepares the whole statement
-- before running it, so this threw 42703 ("column m.venue does not exist")
-- on EVERY call, even for an academy with zero matches. Visitors to
-- /academy/<slug> saw "Loading academy…" and then "Academy not found."
--
-- The emitted JSON keys stay 'venue' and 'format' so the website widgets
-- (components/website/widgets/WidgetRenderer.tsx reads m.format) keep
-- working unchanged. Only the source columns are corrected.

CREATE OR REPLACE FUNCTION public.get_public_academy_bundle(_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_config public.mc_website_config%ROWTYPE;
  result JSONB;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants
    WHERE slug = _slug OR custom_domain = _slug
    LIMIT 1;

  IF v_tenant.id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_config FROM public.mc_website_config WHERE tenant_id = v_tenant.id;

  result := jsonb_build_object(
    'academy', jsonb_build_object(
      'id', v_tenant.id, 'slug', v_tenant.slug,
      'name', v_tenant.name, 'custom_domain', v_tenant.custom_domain
    ),
    'config', COALESCE(to_jsonb(v_config), jsonb_build_object(
      'theme','modern','is_published',true,
      'widgets','[]'::jsonb,'hero','{}'::jsonb,'seo','{}'::jsonb
    )),
    'upcoming_matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'scheduled_date', m.scheduled_date,
        'team_a_id', m.team_a_id, 'team_b_id', m.team_b_id,
        'venue', m.ground_name, 'format', m.match_format
      ) ORDER BY m.scheduled_date ASC)
      FROM public.mc_matches m
      WHERE m.tenant_id = v_tenant.id
        AND m.status IN ('scheduled','live')
        AND (m.scheduled_date IS NULL OR m.scheduled_date >= now() - interval '1 day')
      LIMIT 10
    ), '[]'::jsonb),
    'recent_results', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'scheduled_date', m.scheduled_date,
        'team_a_id', m.team_a_id, 'team_b_id', m.team_b_id,
        'result', m.result, 'winner_team', m.winner_team
      ) ORDER BY m.scheduled_date DESC)
      FROM public.mc_matches m
      WHERE m.tenant_id = v_tenant.id AND m.status = 'finalized'
      LIMIT 10
    ), '[]'::jsonb),
    'academy_records', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.record_type)
      FROM public.mc_academy_records r WHERE r.tenant_id = v_tenant.id LIMIT 50
    ), '[]'::jsonb),
    'hall_of_fame', COALESCE((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC)
      FROM public.mc_hall_of_fame h WHERE h.tenant_id = v_tenant.id LIMIT 20
    ), '[]'::jsonb),
    'recognitions', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
      FROM public.mc_recognitions r
      WHERE r.tenant_id = v_tenant.id AND r.status = 'published' LIMIT 20
    ), '[]'::jsonb),
    'policies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', p.kind, 'version', p.version, 'title', p.title,
        'body_md', p.body_md, 'published_at', p.published_at
      ) ORDER BY p.kind)
      FROM public.policy_documents p
      WHERE p.tenant_id = v_tenant.id
        AND p.is_published = true
        AND p.version = (
          SELECT MAX(p2.version) FROM public.policy_documents p2
          WHERE p2.tenant_id = p.tenant_id AND p2.kind = p.kind AND p2.is_published = true
        )
    ), '[]'::jsonb)
  );
  RETURN result;
END;
$function$;

-- Keep the anon grant that migration 20260715180744 whitelisted. The public
-- academy site is read by logged-out visitors, so anon must retain EXECUTE.
GRANT EXECUTE ON FUNCTION public.get_public_academy_bundle(text) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- Second, unrelated-but-identical schema-drift bug, fixed here so it is one
-- paste instead of two. Remove this block if you want it shipped separately.
--
-- my_post_login_route() checks `mc_parent_links WHERE user_id = uid`, but that
-- table's column is parent_user_id. Platform admins and staff RETURN before
-- reaching that line, which is why it was never noticed — it throws only for
-- students and parents, i.e. exactly the member-portal users. The client
-- currently swallows the error and defaults to /student, so this is a latent
-- fault rather than a visible one, but it errors on every member login.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_post_login_route()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN 'none'; END IF;

  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = uid) THEN
    RETURN 'platform_admin';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = uid
       AND role IN ('owner','admin','coach','head_coach','assistant_coach','staff')
  ) THEN
    RETURN 'staff';
  END IF;

  IF EXISTS (SELECT 1 FROM public.mc_parent_links WHERE parent_user_id = uid) THEN
    RETURN 'parent';
  END IF;

  IF EXISTS (SELECT 1 FROM public.students WHERE user_id = uid) THEN
    RETURN 'student';
  END IF;

  IF EXISTS (SELECT 1 FROM public.registrations WHERE applicant_user_id = uid) THEN
    RETURN 'student';
  END IF;

  RETURN 'none';
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_post_login_route() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.my_post_login_route() FROM anon;
