create table if not exists public.records (id text primary key, kind text not null check (kind in ('practice','invoice','contact')), data jsonb not null, version integer not null default 1, updated_at timestamptz not null default now());
create index if not exists records_kind_idx on public.records(kind);
create table if not exists public.events (id text primary key, source text not null, summary text not null, created_at timestamptz not null default now());
create table if not exists public.settings (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table public.records enable row level security; alter table public.events enable row level security; alter table public.settings enable row level security;
create or replace function public.touch_records_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists records_touch_updated_at on public.records;
create trigger records_touch_updated_at before update on public.records for each row execute function public.touch_records_updated_at();
