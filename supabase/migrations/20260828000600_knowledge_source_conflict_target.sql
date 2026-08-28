-- Make the source document key usable as an ON CONFLICT target.
--
-- The unique index added in 20260828000500 was partial (`where source_document
-- is not null`). Postgres will only infer a partial index for ON CONFLICT if
-- the statement repeats the predicate, which PostgREST cannot express, so
-- re-ingesting an Act failed with "no unique or exclusion constraint matching
-- the ON CONFLICT specification".
--
-- A plain unique index is the right shape and loses nothing: Postgres already
-- treats NULLs as distinct, so a source with no filename is still allowed, and
-- more than one of them is still allowed.
drop index if exists knowledge_sources_document_idx;

create unique index if not exists knowledge_sources_document_idx
  on knowledge_sources (source_document);
