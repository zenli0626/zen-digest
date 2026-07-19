-- 每日情报 (mrqb.space) email subscribers.
-- Run in Supabase SQL editor (or via CLI) against the project's Postgres DB.
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  lang text not null default 'both' check (lang in ('zh','en','both')),
  status text not null default 'active' check (status in ('active','unsubscribed')),
  ref_code text unique default substr(md5(random()::text),1,8),
  referred_by text,
  created_at timestamptz not null default now()
);
alter table subscribers enable row level security;
-- No public policies: only the service_role key (server-side /api functions) reads/writes.
