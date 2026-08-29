import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActCode } from "../acts";
import { compose, liveProvider } from "./answer";
import { retrieve } from "./retrieve";
import type { AssistantAnswer, Passage } from "./types";

const AssistantState = Annotation.Root({
  question: Annotation<string>,
  act: Annotation<ActCode | null>,
  locale: Annotation<string>,
  supabase: Annotation<SupabaseClient>,
  passages: Annotation<Passage[]>({ reducer: (_, value) => value, default: () => [] }),
  answer: Annotation<AssistantAnswer | null>({ reducer: (_, value) => value, default: () => null }),
});

const graph = new StateGraph(AssistantState)
  .addNode("retrieve", async (state) => ({
    passages: await retrieve(state.supabase, state.question, state.act, state.locale),
  }))
  .addNode("compose", async (state) => ({
    answer: await compose(state.question, state.passages, liveProvider, state.locale),
  }))
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "compose")
  .addEdge("compose", END)
  .compile();

export async function runAssistantGraph(input: {
  question: string;
  act: ActCode | null;
  locale: string;
  supabase: SupabaseClient;
}): Promise<AssistantAnswer> {
  const state = await graph.invoke(input);
  if (!state.answer) throw new Error("Assistant graph completed without an answer");
  return state.answer;
}
