import { mkdir, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type Anthropic from "@anthropic-ai/sdk";
import AnthropicAws from "@anthropic-ai/aws-sdk";
import { type Brief, type Plan, type Usage, cost, interviewStep, newUsage, writeBoard, writeCategory } from "./agent";

const workspaceId = process.env.ANTHROPIC_AWS_WORKSPACE_ID;
if (!workspaceId) {
  console.error("Set ANTHROPIC_AWS_WORKSPACE_ID to your Claude Platform on AWS workspace id (wrkspc_...).");
  process.exit(1);
}
// Signs requests with the AWS profile from `aws login`; there is no API key.
const client = new AnthropicAws({ awsRegion: "us-east-1", awsProfile: process.env.AWS_PROFILE ?? "personal", workspaceId });

const rl = createInterface({ input: stdin, output: stdout });
const lines = rl[Symbol.asyncIterator]();
const ask = async (question: string, fallback = "") => {
  stdout.write(question);
  const line = await lines.next();
  if (line.done) throw new Error("Input ended.");
  return line.value.trim() || fallback;
};

const summary = (u: Usage) =>
  `${u.input + u.cacheRead + u.cacheWrite} input tokens, ${u.output} output tokens, ${u.searches} searches, about $${cost(u).toFixed(2)}`;

function printPlan(plan: Plan) {
  console.log("\nProposed board:");
  plan.categories.forEach((c, i) => console.log(`  ${i + 1}. ${c.title}: ${c.angle}`));
  console.log(`  Final. ${plan.final.title}: ${plan.final.angle}`);
}

async function brief(): Promise<Brief> {
  const honoree = await ask("Who's the guest of honor? ");
  const occasion = await ask("What's the occasion? (birthday) ", "birthday");
  const crowd = await ask("Who's playing? (friends who like hard trivia) ", "friends in their 20s and 30s who like hard trivia");
  return { honoree, occasion, crowd };
}

// `--one`: write a single category, to test prompts for about $0.15 instead of a whole board.
async function one(usage: Usage) {
  const b = await brief();
  const category = { title: await ask("Category title: "), theme: await ask("Theme: "), angle: await ask("What should it cover? ") };
  const plan: Plan = { profile: await ask(`Anything the writer should know about ${b.honoree}? `), categories: [category], final: category };
  console.log("\nWriting and fact-checking...");
  console.log(JSON.stringify(await writeCategory(client, b, plan, 0, usage), null, 2));
}

async function full(usage: Usage) {
  const b = await brief();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `I'm making a board for ${b.honoree}. Let's start.` }];
  let plan: Plan;
  for (;;) {
    const step = await interviewStep(client, b, messages, usage);
    if (step.text) console.log(`\n${step.text}`);
    if (step.kind === "say") {
      messages.push({ role: "user", content: (await ask("\nyou> ")) || "(no answer)" });
      continue;
    }
    printPlan(step.plan);
    const feedback = await ask("\nPress enter to write the clues, or say what to change: ");
    if (!feedback) {
      plan = step.plan;
      break;
    }
    messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: step.toolUseId, content: `Changes requested: ${feedback}` }] });
  }

  console.log("\nWriting clues and checking facts. This takes a few minutes.");
  const board = await writeBoard(client, b, plan, usage, (label) => console.log(`  done: ${label}`));
  await mkdir("boards", { recursive: true });
  const file = `boards/${board.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.json`;
  await writeFile(file, JSON.stringify(board, null, 2) + "\n");
  console.log(`\nSaved ${file}. Load it from the home page, or open it in the board editor.`);
}

const usage = newUsage();
try {
  await (process.argv.includes("--one") ? one(usage) : full(usage));
} catch (e) {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  console.error("If this is an auth error, run: aws login --profile personal");
  process.exitCode = 1;
} finally {
  console.log(`\nUsage: ${summary(usage)}`);
  rl.close();
}
