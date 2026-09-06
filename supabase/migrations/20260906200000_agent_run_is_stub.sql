-- The company profile page shows a fixed notice on every company with
-- research: "produced by the Milestone 2 vertical-slice pipeline using a
-- hardcoded stub payload." It is a static string, not a read of anything - so
-- it happens to be true today only because the sole researched company
-- (getquin) really is that stub, and it will keep calling a real pipeline run
-- fake the moment one exists.
--
-- `ExtractionPayload.provenance` (`stub` | `pipeline`) already exists and
-- already reaches `agent_runs.purpose` as a human-readable string
-- ("milestone_2_vertical_slice_stub" vs "milestone_2_vertical_slice") - but a
-- UI cannot honestly branch on parsing a free-text purpose. `agent_runs` is
-- already this database's provenance record for every runtime write, so
-- provenance gets a real, structured column here instead.
alter table agent_runs add column if not exists is_stub boolean not null default false;

comment on column agent_runs.is_stub is
  'True only for a deliberately synthetic run (e.g. the Milestone 2 vertical-slice stub payload). Never true for output produced from real retrieved evidence.';
