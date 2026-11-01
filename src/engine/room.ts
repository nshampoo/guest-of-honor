import type { Board } from "./board";
import { type Action, type GameState, type Result, clueKey, newGame, reduce } from "./game";

export type Role = "tv" | "host" | "team";
export type Connection = { role: Role; id: string };
export type Room = { code: string; game: GameState; hostId: string | null; connections: Record<string, Connection> };

export type ClientMsg =
  | { t: "create"; board: Board }
  | { t: "join"; code: string; role: Role; id: string }
  | { t: "name"; name: string }
  | { t: "act"; action: Action }
  | { t: "leave" };

export type View = {
  code: string;
  role: Role;
  you: string;
  hostClaimed: boolean;
  connected: string[]; // team ids with a live connection
  ready: string[]; // team ids that have answered the open clue, or wagered in the final
  serverNow: number;
  game: GameState; // redacted for everyone but the host
};

export type ServerMsg = { t: "view"; view: View } | { t: "error"; message: string };

const HOST_ACTIONS = new Set<Action["type"]>([
  "setTimer", "start", "removeTeam", "renameTeam", "openClue", "endRound",
  "tick", "judge", "next", "goToFinal", "adjust", "wager",
]);

export function createRoom(code: string, board: Board): Room {
  return { code, game: newGame(board), hostId: null, connections: {} };
}

const act = (room: Room, action: Action, now: number) => ({ room: { ...room, game: reduce(room.game, action, now) } });

export function handle(room: Room, connId: string, msg: ClientMsg, now: number): { room: Room; error?: string } {
  const conn = room.connections[connId];
  const fail = (error: string) => ({ room, error });
  const attach = (c: Connection, extra: Partial<Room> = {}) => ({
    room: { ...room, ...extra, connections: { ...room.connections, [connId]: c } },
  });

  switch (msg.t) {
    case "join":
      if (msg.role === "host") {
        if (room.hostId && room.hostId !== msg.id) return fail("Someone is already hosting this game.");
        return attach({ role: "host", id: msg.id }, { hostId: msg.id });
      }
      if (msg.role === "team") {
        if (msg.id === room.hostId) return fail("This phone is the host.");
        if (room.game.phase !== "lobby" && !room.game.teams.some((t) => t.id === msg.id)) {
          return fail("This game has already started.");
        }
      }
      return attach({ role: msg.role, id: msg.id });
    case "name": {
      if (conn?.role !== "team") return fail("Only teams have names.");
      const exists = room.game.teams.some((t) => t.id === conn.id);
      return act(room, { type: exists ? "renameTeam" : "addTeam", id: conn.id, name: msg.name }, now);
    }
    case "act":
      if (conn?.role === "host" && HOST_ACTIONS.has(msg.action.type)) return act(room, msg.action, now);
      if (conn?.role === "team" && (msg.action.type === "submit" || msg.action.type === "wager")) {
        return act(room, { ...msg.action, teamId: conn.id }, now);
      }
      return fail("You can't do that.");
    case "leave": {
      const { [connId]: _, ...rest } = room.connections;
      return { room: { ...room, connections: rest } };
    }
    case "create":
      return fail("Rooms are created by the server.");
  }
}

function hide<T extends { answer: string; accept?: string[]; source?: string }>(c: T): T {
  return { ...c, answer: "", accept: undefined, source: undefined };
}

// Everything a TV or team may see: no answers before the reveal, no other team's answer or wager.
function redact(g: GameState, teamId: string | null): GameState {
  const own = (r: Result): Result => ({
    answers: teamId && r.answers[teamId] !== undefined ? { [teamId]: r.answers[teamId] } : {},
    correct: {},
  });
  const finalShown = g.phase === "finalReveal" || g.phase === "done";
  const categories = g.board.categories.map((cat, c) => ({
    ...cat,
    clues: cat.clues.map((clue, r) => {
      const key = clueKey(c, r);
      const revealed = g.results[key] && !(g.phase === "clue" && g.current === key);
      return revealed ? clue : hide(clue);
    }),
  }));
  const final = finalShown ? g.board.final : g.phase === "finalClue" ? hide(g.board.final) : { ...hide(g.board.final), clue: "" };
  return {
    ...g,
    board: { ...g.board, categories, final },
    results: g.phase === "clue" ? { ...g.results, [g.current!]: own(g.results[g.current!]) } : g.results,
    final: g.final && g.phase === "finalClue" ? own(g.final) : g.final,
    wagers: finalShown ? g.wagers : teamId && g.wagers[teamId] !== undefined ? { [teamId]: g.wagers[teamId] } : {},
  };
}

export function viewFor(room: Room, connId: string, now: number): View | null {
  const conn = room.connections[connId];
  if (!conn) return null;
  const g = room.game;
  const open = g.phase === "clue" ? g.results[g.current!] : g.phase === "finalClue" ? g.final : null;
  const teamConns = Object.values(room.connections).filter((c) => c.role === "team");
  return {
    code: room.code,
    role: conn.role,
    you: conn.id,
    hostClaimed: room.hostId !== null,
    connected: [...new Set(teamConns.map((c) => c.id))],
    ready: open ? Object.keys(open.answers) : g.phase === "finalWager" ? Object.keys(g.wagers) : [],
    serverNow: now,
    game: conn.role === "host" ? g : redact(g, conn.role === "team" ? conn.id : null),
  };
}
