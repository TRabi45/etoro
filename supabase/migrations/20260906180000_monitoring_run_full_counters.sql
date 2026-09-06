-- A reused monitoring run (same idempotency key) reported a fabricated fresh
-- "success" with every counter at zero, because two of the counters returned
-- to a caller - sources skipped and companies discovered - were never
-- persisted anywhere to read back. The other counters were already stored and
-- simply were not being re-read; this migration closes the part of the gap
-- that needed schema, so a reused run can report what the original run
-- actually did, not a guess dressed up as success.
alter table monitoring_runs add column if not exists sources_skipped integer not null default 0;
alter table monitoring_runs
  add column if not exists companies_discovered integer not null default 0;
