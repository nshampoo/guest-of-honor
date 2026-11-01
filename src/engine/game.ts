import { type Board, CATEGORY_COUNT, VALUES } from "./board";
import { isMatch } from "./match";

export type Team = { id: string; name: string };
export type Result = { answers: Record<string, string>; correct: Record<string, boolean> };
export type Phase =
  | "lobby"
  | "board"
  | "clue"
  | "reveal"
  | "scores"
  | "finalWager"
  | "finalClue"
  | "finalReveal"
  | "done";

export type GameState = {
  board: Board;
  phase: Phase;
  teams: Team[];
  timerMs: number;
  finalTimerMs: number;
  current: string | null; // clue key "cat-row" while a clue is open or revealed
  endsAt: number | null; // null when no clue is open, or once the host stops the timer
  results: Record<string, Result>;
  wagers: Record<string, number>;
  final: Result | null;
  adjustments: Record<string, number>;
};

export type Action =
  | { type: "addTeam"; id: string; name: string }
  | { type: "renameTeam"; id: string; name: string }
  | { type: "removeTeam"; id: string }
  | { type: "setTimer"; ms: number }
  | { type: "start" }
  | { type: "openClue"; cat: number; row: number }
  | { type: "submit"; teamId: string; text: string }
  | { type: "tick" }
  | { type: "stopTimer" }
  | { type: "endRound" }
  | { type: "judge"; teamId: string; correct: boolean }
  | { type: "next" }
  | { type: "goToFinal" }
  | { type: "wager"; teamId: string; amount: number }
  | { type: "adjust"; teamId: string; delta: number };

export const clueKey = (cat: number, row: number) => `${cat}-${row}`;

export function clueAt(board: Board, key: string) {
  const [cat, row] = key.split("-").map(Number);
  return { category: board.categories[cat].title, ...board.categories[cat].clues[row] };
}

export function newGame(board: Board): GameState {
  return {
    board,
    phase: "lobby",
    teams: [],
    timerMs: 60_000,
    finalTimerMs: 120_000,
    current: null,
    endsAt: null,
    results: {},
    wagers: {},
    final: null,
    adjustments: {},
  };
}

export function scores(state: GameState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const team of state.teams) {
    let total = state.adjustments[team.id] ?? 0;
    for (const [key, result] of Object.entries(state.results)) {
      if (result.correct[team.id]) total += clueAt(state.board, key).value;
    }
    if (state.final && (state.phase === "finalReveal" || state.phase === "done")) {
      const wager = state.wagers[team.id] ?? 0;
      total += state.final.correct[team.id] ? wager : -wager;
    }
    totals[team.id] = total;
  }
  return totals;
}

export const maxWager = (state: GameState, teamId: string) => Math.max(scores(state)[teamId] ?? 0, 0);

const timeUp = (state: GameState, now: number) => state.endsAt !== null && now >= state.endsAt;

const allCluesUsed =(state: GameState) => Object.keys(state.results).length === CATEGORY_COUNT * VALUES.length;

function reveal(state: GameState): GameState {
  const isFinal = state.phase === "finalClue";
  const result = isFinal ? state.final! : state.results[state.current!];
  const target = isFinal ? state.board.final : clueAt(state.board, state.current!);
  const correct: Record<string, boolean> = {};
  for (const team of state.teams) {
    const given = result.answers[team.id];
    correct[team.id] = given !== undefined && isMatch(given, target.answer, target.accept);
  }
  const judged = { ...result, correct };
  return isFinal
    ? { ...state, phase: "finalReveal", endsAt: null, final: judged }
    : { ...state, phase: "reveal", endsAt: null, results: { ...state.results, [state.current!]: judged } };
}

function openFinal(state: GameState, now: number): GameState {
  return { ...state, phase: "finalClue", current: null, endsAt: now + state.finalTimerMs, final: { answers: {}, correct: {} } };
}

// Invalid actions return the same state object unchanged.
export function reduce(state: GameState, action: Action, now: number): GameState {
  switch (action.type) {
    case "addTeam": {
      const name = action.name.trim();
      if (state.phase !== "lobby" || !name || state.teams.some((t) => t.id === action.id)) return state;
      return { ...state, teams: [...state.teams, { id: action.id, name }] };
    }
    case "renameTeam": {
      const name = action.name.trim();
      if (!name || !state.teams.some((t) => t.id === action.id)) return state;
      return { ...state, teams: state.teams.map((t) => (t.id === action.id ? { ...t, name } : t)) };
    }
    case "removeTeam":
      if (state.phase !== "lobby") return state;
      return { ...state, teams: state.teams.filter((t) => t.id !== action.id) };
    case "setTimer":
      if (state.phase !== "lobby" || action.ms < 5_000) return state;
      return { ...state, timerMs: action.ms };
    case "start":
      if (state.phase !== "lobby" || state.teams.length === 0) return state;
      return { ...state, phase: "board" };
    case "openClue": {
      const key = clueKey(action.cat, action.row);
      const exists = state.board.categories[action.cat]?.clues[action.row] !== undefined;
      if (state.phase !== "board" || !exists || state.results[key]) return state;
      return {
        ...state,
        phase: "clue",
        current: key,
        endsAt: now + state.timerMs,
        results: { ...state.results, [key]: { answers: {}, correct: {} } },
      };
    }
    case "submit": {
      const isFinal = state.phase === "finalClue";
      if ((state.phase !== "clue" && !isFinal) || timeUp(state, now) || !state.teams.some((t) => t.id === action.teamId)) {
        return state;
      }
      const result = isFinal ? state.final! : state.results[state.current!];
      const answers = { ...result.answers, [action.teamId]: action.text };
      const next = isFinal
        ? { ...state, final: { ...result, answers } }
        : { ...state, results: { ...state.results, [state.current!]: { ...result, answers } } };
      // With the timer stopped, only the host ends the round, so teams can keep changing answers.
      const allIn = state.endsAt !== null && state.teams.every((t) => answers[t.id] !== undefined);
      return allIn ? reveal(next) : next;
    }
    case "tick":
      if ((state.phase === "clue" || state.phase === "finalClue") && timeUp(state, now)) return reveal(state);
      return state;
    case "stopTimer":
      if ((state.phase !== "clue" && state.phase !== "finalClue") || state.endsAt === null || timeUp(state, now)) return state;
      return { ...state, endsAt: null };
    case "endRound":
      if (state.phase === "clue" || state.phase === "finalClue") return reveal(state);
      if (state.phase === "finalWager") return openFinal(state, now);
      return state;
    case "judge": {
      if (!state.teams.some((t) => t.id === action.teamId)) return state;
      if (state.phase === "reveal") {
        const result = state.results[state.current!];
        const judged = { ...result, correct: { ...result.correct, [action.teamId]: action.correct } };
        return { ...state, results: { ...state.results, [state.current!]: judged } };
      }
      if (state.phase === "finalReveal") {
        const judged = { ...state.final!, correct: { ...state.final!.correct, [action.teamId]: action.correct } };
        return { ...state, final: judged };
      }
      return state;
    }
    case "next":
      if (state.phase === "reveal") return { ...state, phase: "scores" };
      if (state.phase === "scores") {
        return { ...state, phase: allCluesUsed(state) ? "finalWager" : "board", current: null };
      }
      if (state.phase === "finalReveal") return { ...state, phase: "done" };
      return state;
    case "goToFinal":
      if (state.phase !== "board") return state;
      return { ...state, phase: "finalWager" };
    case "wager": {
      if (state.phase !== "finalWager" || !state.teams.some((t) => t.id === action.teamId)) return state;
      const amount = Math.min(Math.max(Math.round(action.amount) || 0, 0), maxWager(state, action.teamId));
      return { ...state, wagers: { ...state.wagers, [action.teamId]: amount } };
    }
    case "adjust":
      if (state.phase === "lobby" || !state.teams.some((t) => t.id === action.teamId)) return state;
      return {
        ...state,
        adjustments: { ...state.adjustments, [action.teamId]: (state.adjustments[action.teamId] ?? 0) + action.delta },
      };
  }
}
