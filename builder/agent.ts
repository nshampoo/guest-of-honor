import type Anthropic from "@anthropic-ai/sdk";
import { type Board, type Category, type Clue, type FinalClue, CATEGORY_COUNT, VALUES, validateBoard } from "../src/engine/board";
import { normalize } from "../src/engine/match";

export const MODEL = "claude-sonnet-5-5";

export type Brief = { honoree: string; occasion: string; crowd: string };
export type CategoryPlan = { title: string; theme: string; angle: string };
export type Plan = { profile: string; categories: CategoryPlan[]; final: CategoryPlan };
export type Usage = { input: number; cacheRead: number; cacheWrite: number; output: number; searches: number };
type ClueInput = { clue: string; answer: string; accept: string[]; source: string };

export const newUsage = (): Usage => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, searches: 0 });

function addUsage(u: Usage, m: Anthropic.Message) {
  u.input += m.usage.input_tokens;
  u.cacheRead += m.usage.cache_read_input_tokens ?? 0;
  u.cacheWrite += m.usage.cache_creation_input_tokens ?? 0;
  u.output += m.usage.output_tokens;
  u.searches += m.usage.server_tool_use?.web_search_requests ?? 0;
}

// Sonnet 5.5 list prices per million tokens, and $10 per 1,000 searches.
export const cost = (u: Usage) =>
  (u.input * 2 + u.cacheRead * 0.2 + u.cacheWrite * 2.5 + u.output * 10) / 1_000_000 + u.searches * 0.01;

const CATEGORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "theme", "angle"],
  properties: {
    title: { type: "string", description: "Short, fun category name shown on the board." },
    theme: { type: "string", description: "Which part of their life it comes from." },
    angle: {
      type: "string",
      description: "The subject the trivia covers, specific enough to guide the clue writer. Real trivia anyone could know, not facts about the guest of honor.",
    },
  },
};

const PROPOSE: Anthropic.Tool = {
  name: "propose_categories",
  description: "Propose the board's 6 categories and the final category once you know enough. The creator approves them or asks for changes.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["profile", "categories", "final"],
    properties: {
      profile: { type: "string", description: "What the clue writers should know about the guest of honor: the specifics behind each theme." },
      categories: { type: "array", description: `Exactly ${CATEGORY_COUNT} categories.`, items: CATEGORY_SCHEMA },
      final: CATEGORY_SCHEMA,
    },
  },
};

const CLUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["clue", "answer", "accept", "source"],
  properties: {
    clue: { type: "string", description: "Read aloud to the room. A statement, not a question. Never contains the answer." },
    answer: { type: "string", description: "Short and unambiguous." },
    accept: { type: "array", items: { type: "string" }, description: "Other answers that should count, like a last name alone. Can be empty." },
    source: { type: "string", description: "URL of the page that confirms the fact." },
  },
};

const WRITE_CLUES: Anthropic.Tool = {
  name: "write_clues",
  description: "Submit the category's 5 finished clues, easiest first. Call this once, after checking every fact.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["clues"],
    properties: { clues: { type: "array", description: "Exactly 5 clues, easiest (200) to hardest (1000).", items: CLUE_SCHEMA } },
  },
};

const WRITE_FINAL: Anthropic.Tool = {
  name: "write_final",
  description: "Submit the final-round clue. Call this once, after checking the fact.",
  strict: true,
  input_schema: CLUE_SCHEMA as Anthropic.Tool["input_schema"],
};

const SEARCH: Anthropic.WebSearchTool20260209 = { type: "web_search_20260209", name: "web_search", max_uses: 12 };

const today = () => new Date().toISOString().slice(0, 10);

const interviewSystem = (b: Brief) => `You're helping someone make a trivia game for a party. The guest of honor is ${b.honoree}, and the occasion is ${b.occasion}. The players: ${b.crowd}.

The board is themed around ${b.honoree}'s life, but the clues are real trivia, not questions about them. If they went to Michigan and love trail running, categories might be "Big House History" or "Ultra Legends", with clues anyone at the party could answer. Nobody should need to know ${b.honoree} to play.

Right now you're interviewing the person making the game. Ask about ${b.honoree}: where they're from, school, work, hobbies, places they love, music, food, obsessions. Ask one or two short questions at a time. Follow promising threads toward specifics with rich trivia behind them: not "running" but which races, not "music" but which bands or era. Let go of threads with no trivia behind them.

When you have enough for ${CATEGORY_COUNT} strong, varied categories plus a final category (usually after 5 to 10 exchanges), call propose_categories. No two categories should overlap. If the creator asks for changes, adjust and call it again.

Keep messages short and friendly. No markdown headings.`;

const writerSystem = (b: Brief, plan: Plan) => `You write clues for a party trivia board. The guest of honor is ${b.honoree} (${b.occasion}). The categories are themed around their life, but every clue is real trivia anyone could know, never a question about ${b.honoree}.

About ${b.honoree}: ${plan.profile}

Players: ${b.crowd}. Unless that says otherwise, make it hard. Clues should reward a team talking it through, not instant recall. Even the 200 clue shouldn't be a gimme, and the 1000 should stump most teams.

Rules for every clue:
- Check every fact with web_search before using it, and give the URL that confirms it. If you can't confirm a fact, don't use it.
- Today is ${today()}. Your training data ends before today, so records, current title holders, and anything "latest" may have changed. Search for those, or avoid them.
- The clue is a statement read aloud, pointing at the answer with "this" or "these". One or two sentences.
- One clear, short answer. List fair alternates in accept.
- Don't overlap with the other categories on the board.
- Vary the clues: people, places, numbers, dates, quotes.`;

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function planProblem(plan: Plan): string | null {
  if (plan.categories.length !== CATEGORY_COUNT) return `Propose exactly ${CATEGORY_COUNT} categories, not ${plan.categories.length}.`;
  const titles = plan.categories.map((c) => normalize(c.title));
  if (new Set(titles).size !== titles.length) return "Two categories have the same title.";
  if ([...plan.categories, plan.final].some((c) => !c.title.trim() || !c.angle.trim())) return "Every category needs a title and an angle.";
  return null;
}

function toClue(c: ClueInput, value: number): Clue {
  const accept = c.accept.map((a) => a.trim()).filter(Boolean);
  return {
    value,
    clue: c.clue.trim(),
    answer: c.answer.trim(),
    ...(accept.length ? { accept } : {}),
    ...(c.source.trim() ? { source: c.source.trim() } : {}),
  };
}

export function clueProblem(c: ClueInput): string | null {
  if (!c.clue.trim() || !c.answer.trim()) return "Every clue needs a clue and an answer.";
  const answer = normalize(c.answer);
  if (answer.length > 3 && normalize(c.clue).includes(answer)) return `The clue for "${c.answer}" gives away the answer.`;
  if (!/^https?:\/\//.test(c.source.trim())) return `The clue for "${c.answer}" needs the URL that confirms it.`;
  return null;
}

export function toClues(input: { clues: ClueInput[] }): Clue[] | string {
  if (input.clues.length !== VALUES.length) return `Send exactly ${VALUES.length} clues, not ${input.clues.length}.`;
  for (const c of input.clues) {
    const problem = clueProblem(c);
    if (problem) return problem;
  }
  return input.clues.map((c, i) => toClue(c, VALUES[i]));
}

export type InterviewStep = { text: string } & ({ kind: "say" } | { kind: "propose"; plan: Plan; toolUseId: string });

// One interviewer turn. Appends to `messages`; the caller appends the creator's reply.
export async function interviewStep(client: Anthropic, brief: Brief, messages: Anthropic.MessageParam[], usage: Usage): Promise<InterviewStep> {
  for (;;) {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: interviewSystem(brief),
      tools: [PROPOSE],
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
    });
    addUsage(usage, message);
    if (message.stop_reason === "refusal") throw new Error("Claude declined to continue this interview.");
    messages.push({ role: "assistant", content: message.content });
    const text = textOf(message);
    const tool = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!tool) return { kind: "say", text };
    const plan = tool.input as Plan;
    const problem = planProblem(plan);
    if (!problem) return { kind: "propose", text, plan, toolUseId: tool.id };
    messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: tool.id, is_error: true, content: problem }] });
  }
}

// Runs one writer until it submits through `tool` and `accept` takes the input.
async function runWriter<T>(
  client: Anthropic,
  system: string,
  prompt: string,
  tool: Anthropic.Tool,
  usage: Usage,
  accept: (input: unknown) => T | string,
): Promise<T> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  for (let turn = 0; turn < 12; turn++) {
    const message = await client.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        system,
        tools: [SEARCH, tool],
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
      })
      .finalMessage();
    addUsage(usage, message);
    if (message.stop_reason === "refusal") throw new Error(`Claude declined to write "${tool.name}".`);
    if (message.stop_reason === "max_tokens") throw new Error("The clue writer ran out of room.");
    messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason === "pause_turn") continue; // a long search turn; resend to let it continue

    const use = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === tool.name);
    if (!use) {
      messages.push({ role: "user", content: `Call ${tool.name} with your finished, fact-checked work.` });
      continue;
    }
    const result = accept(use.input);
    if (typeof result !== "string") return result;
    messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: use.id, is_error: true, content: result }] });
  }
  throw new Error(`The clue writer didn't finish "${tool.name}".`);
}

export async function writeCategory(client: Anthropic, brief: Brief, plan: Plan, index: number, usage: Usage): Promise<Category> {
  const cat = plan.categories[index];
  const others = plan.categories.filter((_, i) => i !== index).map((c) => c.title).join(", ");
  const prompt = `Category: ${cat.title}\nTheme: ${cat.theme}\nWhat to cover: ${cat.angle}\nOther categories on the board: ${others}, and the final, ${plan.final.title}.\n\nWrite 5 clues, easiest to hardest, then call write_clues.`;
  const clues = await runWriter(client, writerSystem(brief, plan), prompt, WRITE_CLUES, usage, (input) => toClues(input as { clues: ClueInput[] }));
  return { title: cat.title, clues };
}

export async function writeFinal(client: Anthropic, brief: Brief, plan: Plan, usage: Usage): Promise<FinalClue> {
  const f = plan.final;
  const prompt = `Final round category: ${f.title}\nTheme: ${f.theme}\nWhat to cover: ${f.angle}\n\nWrite one final-round clue, harder than any 1000 clue, that a team can still reason its way to. Then call write_final.`;
  const clue = await runWriter(client, writerSystem(brief, plan), prompt, WRITE_FINAL, usage, (input) => {
    const c = input as ClueInput;
    return clueProblem(c) ?? toClue(c, 0);
  });
  const { value: _, ...rest } = clue;
  return { category: f.title, ...rest };
}

// Writes every category and the final in parallel, then checks the result.
export async function writeBoard(client: Anthropic, brief: Brief, plan: Plan, usage: Usage, onDone: (label: string) => void): Promise<Board> {
  const tell = <T>(label: string, p: Promise<T>) => p.then((v) => (onDone(label), v));
  const [categories, final] = await Promise.all([
    Promise.all(plan.categories.map((c, i) => tell(c.title, writeCategory(client, brief, plan, i, usage)))),
    tell(`Final: ${plan.final.title}`, writeFinal(client, brief, plan, usage)),
  ]);
  const board: Board = { title: `${brief.honoree}'s ${brief.occasion}`, honoree: brief.honoree, categories, final };
  const errors = validateBoard(board);
  if (errors.length) throw new Error(`The board didn't validate: ${errors.join("; ")}`);
  return board;
}
