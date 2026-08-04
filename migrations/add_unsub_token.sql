-- 每日情报 (mrqb.space) — long unsubscribe token.
-- Run in Supabase SQL editor (or via CLI) against the project's Postgres DB, AFTER
-- migrations/subscribers.sql.
--
-- Why: the original `ref_code` (substr(md5(random()::text),1,8) — 8 hex chars, 32 bits)
-- doubles as both the referral code and the unsubscribe token. 32 bits is guessable at
-- scale for something that lets a stranger unsubscribe someone else. This adds a
-- separate `unsub_token` with >=128 bits of randomness for the unsubscribe link, and
-- leaves `ref_code` alone (still fine for its referral-code purpose, and existing
-- unsubscribe links using it keep working — api/unsubscribe.js accepts both).
--
-- No data migration needed beyond running this file: the UPDATE below backfills every
-- existing subscriber with a unsub_token in the same statement that adds the column.
create extension if not exists pgcrypto;

alter table subscribers
  add column if not exists unsub_token text unique default encode(gen_random_bytes(16), 'hex');

update subscribers set unsub_token = encode(gen_random_bytes(16), 'hex') where unsub_token is null;
