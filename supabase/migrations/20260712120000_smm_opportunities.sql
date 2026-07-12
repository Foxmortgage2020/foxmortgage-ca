-- Strategic Mortgage Monitoring uploads. Persist-first: every raw row lands in
-- smm_rows before any parsing can fail, so the raw upload is the guaranteed
-- capture and audit trail. Portal-side opportunity status lives here (Zoho has
-- no opportunity field). House pattern: RLS on, NO policies, table grants
-- revoked; the ONLY surface is the narrow security-definer functions granted
-- to anon. Nothing deletes; a new upload supersedes the prior batch's analysis.
-- Applied live to the foxmortgage-ca project (skfeivzhqvrefnkqjwtj) 2026-07-12.

create table if not exists public.smm_uploads (
  id uuid primary key default gen_random_uuid(),
  filename text,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  raw_row_count integer not null default 0,
  parsed_row_count integer,
  mortgage_count integer,
  collapsed_count integer,
  status text not null default 'uploading',
  notes jsonb not null default '{}'::jsonb,
  superseded boolean not null default false
);
create index if not exists smm_uploads_recent_idx on public.smm_uploads (uploaded_at desc);

create table if not exists public.smm_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.smm_uploads(id),
  row_index integer not null,
  raw jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists smm_rows_upload_idx on public.smm_rows (upload_id, row_index);

create table if not exists public.smm_opportunity_status (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  upload_id uuid,
  status text not null,
  acting_email text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists smm_opp_status_household_idx on public.smm_opportunity_status (household_id, created_at desc);

alter table public.smm_uploads enable row level security;
alter table public.smm_rows enable row level security;
alter table public.smm_opportunity_status enable row level security;
revoke all on public.smm_uploads from anon, authenticated, public;
revoke all on public.smm_rows from anon, authenticated, public;
revoke all on public.smm_opportunity_status from anon, authenticated, public;

create or replace function public.smm_upload_create(p_filename text, p_uploaded_by text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.smm_uploads set superseded = true where superseded = false;
  insert into public.smm_uploads (filename, uploaded_by, status)
  values (p_filename, p_uploaded_by, 'uploading') returning id into v_id;
  return v_id;
end; $$;

create or replace function public.smm_rows_insert(p_upload_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer := 0; v_row jsonb; v_i integer := 0;
begin
  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into public.smm_rows (upload_id, row_index, raw) values (p_upload_id, v_i, v_row);
    v_i := v_i + 1; v_count := v_count + 1;
  end loop;
  update public.smm_uploads set raw_row_count = v_count where id = p_upload_id;
  return v_count;
end; $$;

create or replace function public.smm_upload_finalize(
  p_upload_id uuid, p_parsed integer, p_mortgages integer, p_collapsed integer, p_notes jsonb
) returns void language sql security definer set search_path = public as $$
  update public.smm_uploads
  set parsed_row_count = p_parsed, mortgage_count = p_mortgages,
      collapsed_count = p_collapsed, notes = coalesce(p_notes, '{}'::jsonb), status = 'ready'
  where id = p_upload_id;
$$;

create or replace function public.smm_uploads_recent(p_limit integer default 24)
returns setof public.smm_uploads language sql security definer set search_path = public as $$
  select * from public.smm_uploads order by uploaded_at desc limit least(coalesce(p_limit, 24), 200);
$$;

create or replace function public.smm_rows_for_upload(p_upload_id uuid)
returns setof public.smm_rows language sql security definer set search_path = public as $$
  select * from public.smm_rows where upload_id = p_upload_id order by row_index asc;
$$;

create or replace function public.smm_opportunity_status_set(
  p_household text, p_upload uuid, p_status text, p_email text, p_note text
) returns uuid language sql security definer set search_path = public as $$
  insert into public.smm_opportunity_status (household_id, upload_id, status, acting_email, note)
  values (p_household, p_upload, p_status, p_email, p_note) returning id;
$$;

create or replace function public.smm_opportunity_status_latest()
returns table(household_id text, status text, acting_email text, note text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select distinct on (household_id) household_id, status, acting_email, note, created_at
  from public.smm_opportunity_status order by household_id, created_at desc;
$$;

revoke all on function public.smm_upload_create(text, text) from public;
grant execute on function public.smm_upload_create(text, text) to anon;
revoke all on function public.smm_rows_insert(uuid, jsonb) from public;
grant execute on function public.smm_rows_insert(uuid, jsonb) to anon;
revoke all on function public.smm_upload_finalize(uuid, integer, integer, integer, jsonb) from public;
grant execute on function public.smm_upload_finalize(uuid, integer, integer, integer, jsonb) to anon;
revoke all on function public.smm_uploads_recent(integer) from public;
grant execute on function public.smm_uploads_recent(integer) to anon;
revoke all on function public.smm_rows_for_upload(uuid) from public;
grant execute on function public.smm_rows_for_upload(uuid) to anon;
revoke all on function public.smm_opportunity_status_set(text, uuid, text, text, text) from public;
grant execute on function public.smm_opportunity_status_set(text, uuid, text, text, text) to anon;
revoke all on function public.smm_opportunity_status_latest() from public;
grant execute on function public.smm_opportunity_status_latest() to anon;
