import { describe, expect, it } from "vitest";
import { type Plan, cost, newUsage, planProblem, toClues } from "./agent";

const cat = (title: string) => ({ title, theme: "running", angle: "marathon history" });
const plan = (n: number): Plan => ({ profile: "Runs a lot.", categories: Array.from({ length: n }, (_, i) => cat(`Cat ${i}`)), final: cat("Final") });
const clue = (answer: string, extra = {}) => ({ clue: `This is about ${answer.length} letters.`, answer, accept: [], source: "https://example.com", ...extra });

describe("planProblem", () => {
  it("accepts six distinct categories", () => {
    expect(planProblem(plan(6))).toBeNull();
  });

  it("wants exactly six", () => {
    expect(planProblem(plan(5))).toBe("Propose exactly 6 categories, not 5.");
  });

  it("rejects duplicate titles", () => {
    const p = plan(6);
    p.categories[1].title = "the cat 0";
    expect(planProblem(p)).toBe("Two categories have the same title.");
  });
});

describe("toClues", () => {
  const five = ["Boston", "Kipchoge", "Switzer", "Pheidippides", "Bannister"].map((a) => clue(a));

  it("assigns values in order and drops empty extras", () => {
    const clues = toClues({ clues: five });
    expect(Array.isArray(clues) && clues.map((c) => c.value)).toEqual([200, 400, 600, 800, 1000]);
    expect(Array.isArray(clues) && "accept" in clues[0]).toBe(false);
  });

  it("wants exactly five", () => {
    expect(toClues({ clues: five.slice(0, 4) })).toBe("Send exactly 5 clues, not 4.");
  });

  it("rejects a clue that gives away its answer", () => {
    const leaky = [...five.slice(0, 4), clue("Bannister", { clue: "Roger Bannister ran the first sub-four mile." })];
    expect(toClues({ clues: leaky })).toBe('The clue for "Bannister" gives away the answer.');
  });

  it("needs a source URL", () => {
    const unsourced = [...five.slice(0, 4), clue("Bannister", { source: "" })];
    expect(toClues({ clues: unsourced })).toBe('The clue for "Bannister" needs the URL that confirms it.');
  });
});

describe("cost", () => {
  it("prices tokens and searches", () => {
    expect(cost({ ...newUsage(), input: 1_000_000, output: 100_000, searches: 30 })).toBeCloseTo(2 + 1 + 0.3);
  });
});
