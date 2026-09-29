-- Stand-in for the Supabase pieces Academy OS needs, for testing on a throwaway local Postgres. NOT for real projects.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema extensions; create extension pgcrypto schema extensions;
create schema auth;
create table auth.users (
  instance_id uuid,
  id uuid,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at text,
  invited_at text,
  confirmation_token text,
  confirmation_sent_at text,
  recovery_token text,
  recovery_sent_at text,
  email_change_token_new text,
  email_change text,
  email_change_sent_at text,
  last_sign_in_at text,
  raw_app_meta_data text,
  raw_user_meta_data text,
  is_super_admin text,
  created_at text,
  updated_at text,
  phone text,
  phone_confirmed_at text,
  phone_change text,
  phone_change_token text,
  phone_change_sent_at text,
  email_change_token_current text,
  email_change_confirm_status text,
  banned_until text,
  reauthentication_token text,
  reauthentication_sent_at text,
  is_sso_user text,
  deleted_at text,
  is_anonymous text
);
alter table auth.users add primary key (id);
create table auth.identities (
  provider_id text,
  user_id uuid,
  identity_data text,
  provider text,
  last_sign_in_at text,
  created_at text,
  updated_at text,
  id uuid
);
alter table auth.identities add primary key (id);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$ declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts, 1) - 1]; end $$;
create publication supabase_realtime;
