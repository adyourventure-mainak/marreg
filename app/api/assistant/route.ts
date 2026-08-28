import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "../../../lib/supabase/server";
import { createServiceClient } from "../../../lib/supabase/service";
import { retrieve } from "../../../lib/assistant/retrieve";
import { compose, liveProvider, NOT_CONFIGURED, NO_SOURCE } from "../../../lib/assistant/answer";
import { aiConfigured } from "../../../lib/extraction/provider";
import { ACT_CODES } from "../../../lib/acts";

/**
 * The citizen assistant.
 *
 * Open to the public, because the people who most need it are the ones who
 * have not signed up yet. Two things follow from that and are handled here:
 * the request is retrieved through the caller's own Supabase session (so RLS,
 * not this file, decides what may be read), and every question is logged so a
 * reviewer can audit what the service told the public.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  question: z.string().trim().min(4).max(500),
  act: z.enum(ACT_CODES).nullish(),
  locale: z.enum(["en", "bn"]).default("en"),
});

/**
 * Per-instance rate limit.
 *
 * Deliberately simple: it bounds the cost of one serverless instance being
 * hammered, and nothing more. It is not a security control — instances are not
 * shared, so a determined caller can spread load across them. A production
 * deployment should put this in Postgres or an edge KV.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const seen = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (seen.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  seen.set(key, hits);
  if (seen.size > 5000) seen.clear();
  return hits.length > MAX_PER_WINDOW;
}

/** Record the question and its citations. Never let logging fail the answer. */
async function log(entry: {
  question: string;
  locale: string;
  citations: unknown;
  answered: boolean;
  refusal?: string;
  model?: string;
  actorId: string | null;
}) {
  try {
    await createServiceClient().from("assistant_queries").insert({
      question: entry.question,
      locale: entry.locale,
      citations: entry.citations,
      answered: entry.answered,
      refusal_reason: entry.refusal ?? null,
      model: entry.model ?? null,
      actor_id: entry.actorId,
    });
  } catch (error) {
    console.error("assistant log failed", error);
  }
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ask a question between 4 and 500 characters." }, { status: 400 });
  }
  const { question, act, locale } = parsed.data;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many questions at once. Wait a moment." }, { status: 429 });
  }

  if (!aiConfigured) {
    return NextResponse.json({ answered: false, refusal: NOT_CONFIGURED, passages: [] });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const passages = await retrieve(supabase, question, act ?? null, locale);
    const answer = await compose(question, passages, liveProvider);

    await log({
      question,
      locale,
      // The citations, not the prose: this is the record of what the answer
      // was allowed to rest on.
      citations: answer.passages.map((p) => ({
        index: p.index, kind: p.kind, citation: p.citation, heading: p.heading,
      })),
      answered: answer.answered,
      refusal: answer.refusal,
      model: answer.model,
      actorId: user?.id ?? null,
    });

    return NextResponse.json(answer);
  } catch (error) {
    console.error("assistant failed", error);
    await log({
      question, locale, citations: [], answered: false,
      refusal: "provider or retrieval error", actorId: user?.id ?? null,
    });
    // Never surface an internal message to the public.
    return NextResponse.json({ answered: false, refusal: NO_SOURCE, passages: [] });
  }
}
