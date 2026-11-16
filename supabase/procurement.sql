-- Area separata: non estendere la tabella records esposta dalle API commerciali.
create table if not exists public.procurement_catalog (
 id text primary key check (id = 'main'),
 data jsonb not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.procurement_jobs (
 id text primary key,
 practice_id text not null unique references public.records(id),
 data jsonb not null,
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.procurement_catalog enable row level security;
alter table public.procurement_jobs enable row level security;
revoke all on public.procurement_catalog from anon, authenticated;
revoke all on public.procurement_jobs from anon, authenticated;
grant all on public.procurement_catalog to service_role;
grant all on public.procurement_jobs to service_role;
drop trigger if exists procurement_jobs_touch on public.procurement_jobs;
create trigger procurement_jobs_touch before update on public.procurement_jobs
 for each row execute function public.touch_records_updated_at();
