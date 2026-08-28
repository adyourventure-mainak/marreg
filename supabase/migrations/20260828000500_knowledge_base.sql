-- Knowledge base for the citizen assistant.
--
-- The assistant is a retrieval layer over records this database already holds.
-- It has no independent knowledge and is not allowed to acquire any:
--
--   * knowledge_sources / knowledge_chunks hold text extracted from the Act
--     PDFs supplied by the department. Extraction is mechanical, so a source
--     lands as PENDING_REVIEW and is invisible to the public until a member of
--     registry staff verifies it -- the same gate the officer directory uses.
--   * offices are retrieved through the existing search_offices(), which is
--     SECURITY INVOKER, so an unverified office stays invisible here too.
--
-- Nothing in this file lets a model write, decide, or publish. It only lets one
-- read what a human has already approved, and records every question asked.

-- ------------------------------------------------------------------ sources
do $$ begin
  create type knowledge_kind as enum ('ACT', 'PROCEDURE', 'NOTICE');
exception when duplicate_object then null; end $$;

create table if not exists knowledge_sources (
  id                  uuid primary key default gen_random_uuid(),
  kind                knowledge_kind not null,
  -- The Act codes this document is authority for, so an answer can be scoped
  -- to the Act the citizen is actually applying under. An array because one
  -- document can govern several: the Special Marriage Act, 1954 is the source
  -- for both SMA_13 and SMA_16. Empty means "applies generally".
  acts                act_code[] not null default '{}',
  title               text not null,
  -- How the source should be cited to a citizen, e.g.
  -- 'The Hindu Marriage Act, 1955'. Shown verbatim under every answer.
  citation            text not null,
  source_document     text,
  source_url          text,
  published_on        date,
  verification_status verification_status not null default 'PENDING_REVIEW',
  verified_by         uuid references auth.users(id),
  verified_at         timestamptz,
  review_note         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint knowledge_sources_act_kind
    check (kind <> 'ACT' or cardinality(acts) > 0)
);

create unique index if not exists knowledge_sources_document_idx
  on knowledge_sources (source_document) where source_document is not null;

comment on table knowledge_sources is
  'One approved document the citizen assistant may quote from. PENDING_REVIEW until staff confirm the extracted text against the published PDF.';

-- ------------------------------------------------------------------- chunks
create table if not exists knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references knowledge_sources(id) on delete cascade,
  seq         int  not null,
  -- The section number/heading as printed, e.g. 'Section 8'. This is what the
  -- answer cites; it must come from the document, never from the model.
  heading     text,
  body        text not null,
  page        int check (page > 0),
  created_at  timestamptz not null default now(),
  unique (source_id, seq)
);

-- Plain Postgres full-text search, deliberately.
--
-- An embedding index would put an opaque, non-reproducible step between the
-- citizen's question and the statute they are shown. Full-text ranking is
-- deterministic and inspectable: a reviewer can run the same tsquery and see
-- exactly why a section was retrieved. For a statutory corpus of a few hundred
-- sections that is both sufficient and defensible.
alter table knowledge_chunks
  add column if not exists tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(heading, '')), 'A') ||
    setweight(to_tsvector('english', body), 'B')
  ) stored;

create index if not exists knowledge_chunks_tsv_idx    on knowledge_chunks using gin (tsv);
create index if not exists knowledge_chunks_source_idx on knowledge_chunks (source_id);

-- ---------------------------------------------------------------------- rls
alter table knowledge_sources enable row level security;
alter table knowledge_chunks  enable row level security;

drop policy if exists knowledge_sources_read on knowledge_sources;
create policy knowledge_sources_read on knowledge_sources for select
  using (verification_status = 'VERIFIED' or is_staff());

drop policy if exists knowledge_chunks_read on knowledge_chunks;
create policy knowledge_chunks_read on knowledge_chunks for select
  using (exists (select 1 from knowledge_sources s
                  where s.id = source_id
                    and (s.verification_status = 'VERIFIED' or is_staff())));

-- Ingestion runs with the service role, which bypasses RLS. No client role may
-- write to the corpus the assistant quotes from -- not even staff, who review
-- through review_knowledge_source() so that the decision is audited.
revoke insert, update, delete on knowledge_sources from anon, authenticated;
revoke insert, update, delete on knowledge_chunks  from anon, authenticated;
grant select on knowledge_sources to anon, authenticated;
grant select on knowledge_chunks  to anon, authenticated;

-- --------------------------------------------------------------- retrieval
-- SECURITY INVOKER on purpose: the read policies above are the access control.
-- A retrieval function that ran as owner would happily hand a citizen the text
-- of a document no human has checked yet.
create or replace function search_knowledge(
  p_query text,
  p_act   act_code default null,
  p_limit int      default 6)
returns table (
  chunk_id  uuid,
  source_id uuid,
  title     text,
  citation  text,
  acts      act_code[],
  heading   text,
  body      text,
  page      int,
  rank      real)
language sql stable security invoker set search_path = public as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(p_query, '')) as tsq
  )
  select c.id, s.id, s.title, s.citation, s.acts, c.heading, c.body, c.page,
         ts_rank(c.tsv, q.tsq) as rank
    from knowledge_chunks c
    join knowledge_sources s on s.id = c.source_id
   cross join q
   where q.tsq is not null
     and c.tsv @@ q.tsq
     and (p_act is null or cardinality(s.acts) = 0 or p_act = any(s.acts))
   order by rank desc, s.title, c.seq
   limit greatest(1, least(coalesce(p_limit, 6), 20))
$$;

comment on function search_knowledge(text, act_code, int) is
  'Ranked full-text search over approved source text. SECURITY INVOKER, so unverified sources are unreachable.';

grant execute on function search_knowledge(text, act_code, int) to anon, authenticated;

-- ------------------------------------------------------------------ review
create or replace function review_knowledge_source(
  p_source uuid, p_status verification_status, p_note text default null)
returns knowledge_sources
language plpgsql security definer set search_path = public as $$
declare src knowledge_sources;
begin
  if auth.uid() is null then raise exception 'Sign in to review source documents'; end if;
  if not is_staff() then raise exception 'Only registry staff may verify source documents'; end if;
  if p_status = 'PENDING_REVIEW' then
    raise exception 'A review must record a decision: VERIFIED or REJECTED';
  end if;

  update knowledge_sources
     set verification_status = p_status,
         review_note = p_note,
         verified_by = auth.uid(),
         verified_at = now(),
         updated_at  = now()
   where id = p_source
  returning * into src;

  if not found then raise exception 'Source document not found'; end if;

  perform log_audit(null, 'knowledge_source', p_source::text, 'knowledge:' || p_status,
                    null, jsonb_build_object('status', p_status, 'note', p_note));
  return src;
end $$;

revoke execute on function review_knowledge_source(uuid, verification_status, text)
  from public, anon;
grant  execute on function review_knowledge_source(uuid, verification_status, text)
  to authenticated;

-- ------------------------------------------------------------- question log
-- Every question the assistant answers is recorded with the citations it was
-- given. This is what makes the assistant auditable after the fact: a reviewer
-- can ask what was said and on what basis, without the answer text being the
-- only evidence.
create table if not exists assistant_queries (
  id            bigserial primary key,
  asked_at      timestamptz not null default now(),
  locale        text not null default 'en',
  question      text not null,
  -- Citations returned to the citizen, and whether the assistant declined.
  citations     jsonb not null default '[]'::jsonb,
  answered      boolean not null default false,
  refusal_reason text,
  model         text,
  actor_id      uuid references auth.users(id)
);

create index if not exists assistant_queries_asked_idx on assistant_queries (asked_at desc);

alter table assistant_queries enable row level security;

-- Written only by the API route under the service role; read only by RGM
-- admins, since the log contains what members of the public typed.
drop policy if exists assistant_queries_admin_read on assistant_queries;
create policy assistant_queries_admin_read on assistant_queries for select
  using (current_user_role() = 'RGM_ADMIN');

revoke all on assistant_queries from public, anon, authenticated;
grant select on assistant_queries to authenticated;

-- --------------------------------------------------------------- assertions
-- Supabase grants execute on new functions to anon by default. Fail the
-- migration rather than report success on a database that is still open.
do $assert$
begin
  if has_function_privilege('anon',
       'review_knowledge_source(uuid, verification_status, text)', 'execute') then
    raise exception 'anon can still execute review_knowledge_source';
  end if;

  if has_table_privilege('anon', 'knowledge_chunks', 'insert')
     or has_table_privilege('authenticated', 'knowledge_chunks', 'insert')
     or has_table_privilege('authenticated', 'knowledge_sources', 'update') then
    raise exception 'the knowledge corpus must not be writable by a client role';
  end if;

  if has_table_privilege('anon', 'assistant_queries', 'select') then
    raise exception 'anon must not read the assistant question log';
  end if;
end $assert$;
