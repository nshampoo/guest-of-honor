import { describe, expect, it } from "vitest";
import type { Board } from "./board";
import { type Action, type GameState, maxWager, newGame, reduce, scores } from "./game";
import sample from "../boards/sample.json";

const board = sample as Board;

function play(actions: Action[], start: GameState = newGame(board), now = 0): GameState {
  return actions.reduce((s, a) => reduce(s, a, now), start);
}

const twoTeams: Action[] = [
  { type: "addTeam", id: "a", name: "Aces" },
  { type: "addTeam", id: "b", name: "Bees" },
  { type: "start" },
];

describe("lobby", () => {
  it("adds teams with trimmed names and ignores blanks and duplicates", () => {
    const s = play([
      { type: "addTeam", id: "a", name: "  Aces " },
      { type: "addTeam", id: "a", name: "Again" },
      { type: "addTeam", id: "c", name: "  " },
    ]);
    expect(s.teams).toEqual([{ id: "a", name: "Aces" }]);
  });

  it("can't start without a team", () => {
    const s = newGame(board);
    expect(reduce(s, { type: "start" }, 0)).toBe(s);
  });
});

describe("a round", () => {
  it("opens a clue with a timer", () => {
    const s = reduce(play(twoTeams), { type: "openClue", cat: 0, row: 0 }, 1_000);
    expect(s.phase).toBe("clue");
    expect(s.current).toBe("0-0");
    expect(s.endsAt).toBe(31_000);
  });

  it("won't reopen a used clue", () => {
    const s = play([...twoTeams, { type: "openClue", cat: 0, row: 0 }, { type: "endRound" }, { type: "next" }, { type: "next" }]);
    expect(s.phase).toBe("board");
    expect(reduce(s, { type: "openClue", cat: 0, row: 0 }, 0)).toBe(s);
  });

  it("ends when every team has answered, and suggests matches", () => {
    const s = play([
      ...twoTeams,
      { type: "openClue", cat: 0, row: 0 },
      { type: "submit", teamId: "a", text: "26.2" },
    ]);
    expect(s.phase).toBe("clue");
    const done = reduce(s, { type: "submit", teamId: "b", text: "13.1" }, 0);
    expect(done.phase).toBe("reveal");
    expect(done.results["0-0"].correct).toEqual({ a: true, b: false });
  });

  it("lets a team change its answer before time is up", () => {
    const s = play([
      ...twoTeams,
      { type: "openClue", cat: 0, row: 0 },
      { type: "submit", teamId: "a", text: "13.1" },
      { type: "submit", teamId: "a", text: "26.2" },
    ]);
    expect(s.results["0-0"].answers.a).toBe("26.2");
  });

  it("ends when the timer runs out, and ignores late answers", () => {
    const open = play([...twoTeams, { type: "openClue", cat: 0, row: 0 }]);
    expect(reduce(open, { type: "tick" }, 29_999)).toBe(open);
    expect(reduce(open, { type: "submit", teamId: "a", text: "26.2" }, 30_000)).toBe(open);
    expect(reduce(open, { type: "tick" }, 30_000).phase).toBe("reveal");
  });

  it("ends early when the host says so", () => {
    const s = play([...twoTeams, { type: "openClue", cat: 0, row: 0 }, { type: "endRound" }]);
    expect(s.phase).toBe("reveal");
  });

  it("scores every correct team, with no penalty for wrong answers", () => {
    const s = play([
      ...twoTeams,
      { type: "openClue", cat: 0, row: 1 },
      { type: "endRound" },
      { type: "judge", teamId: "a", correct: true },
      { type: "judge", teamId: "b", correct: true },
      { type: "judge", teamId: "b", correct: false },
      { type: "next" },
    ]);
    expect(s.phase).toBe("scores");
    expect(scores(s)).toEqual({ a: 400, b: 0 });
  });

  it("applies host adjustments", () => {
    const s = play([...twoTeams, { type: "adjust", teamId: "b", delta: 200 }]);
    expect(scores(s)).toEqual({ a: 0, b: 200 });
  });
});

describe("final round", () => {
  function atFinal(): GameState {
    return play([
      ...twoTeams,
      { type: "openClue", cat: 0, row: 4 },
      { type: "endRound" },
      { type: "judge", teamId: "a", correct: true },
      { type: "next" },
      { type: "next" },
      { type: "goToFinal" },
    ]);
  }

  it("goes to the final after the last clue", () => {
    let s = play(twoTeams);
    for (let cat = 0; cat < 6; cat++) {
      for (let row = 0; row < 5; row++) {
        s = play([{ type: "openClue", cat, row }, { type: "endRound" }, { type: "next" }, { type: "next" }], s);
      }
    }
    expect(s.phase).toBe("finalWager");
  });

  it("caps wagers at the team's score", () => {
    const s = play([
      { type: "wager", teamId: "a", amount: 5_000 },
      { type: "wager", teamId: "b", amount: 100 },
    ], atFinal());
    expect(maxWager(s, "a")).toBe(1_000);
    expect(s.wagers).toEqual({ a: 1_000, b: 0 });
  });

  it("adds right wagers and subtracts wrong ones", () => {
    const s = play([
      { type: "adjust", teamId: "b", delta: 600 },
      { type: "wager", teamId: "a", amount: 300 },
      { type: "wager", teamId: "b", amount: 600 },
      { type: "endRound" },
      { type: "submit", teamId: "a", text: "Bannister" },
      { type: "submit", teamId: "b", text: "Coe" },
    ], atFinal());
    expect(s.phase).toBe("finalReveal");
    expect(scores(s)).toEqual({ a: 1_300, b: 0 });
    expect(reduce(s, { type: "next" }, 0).phase).toBe("done");
  });

  it("doesn't count wagers before the reveal", () => {
    const s = play([{ type: "wager", teamId: "a", amount: 500 }], atFinal());
    expect(scores(s).a).toBe(1_000);
  });
});
