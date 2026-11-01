import { describe, expect, it } from "vitest";
import type { Board } from "./board";
import { type ClientMsg, type Room, createRoom, handle, viewFor } from "./room";
import sample from "../boards/sample.json";

const board = sample as Board;

function run(steps: [string, ClientMsg][], room: Room = createRoom("ABCD", board), now = 0): Room {
  return steps.reduce((r, [conn, msg]) => handle(r, conn, msg, now).room, room);
}

const join = (role: "tv" | "host" | "team", id: string): ClientMsg => ({ t: "join", code: "ABCD", role, id });

const setup: [string, ClientMsg][] = [
  ["tv", join("tv", "tv")],
  ["h", join("host", "host-1")],
  ["a", join("team", "team-a")],
  ["a", { t: "name", name: "Aces" }],
  ["b", join("team", "team-b")],
  ["b", { t: "name", name: "Bees" }],
  ["h", { t: "act", action: { type: "start" } }],
];

describe("joining", () => {
  it("lets one phone claim host and reconnect", () => {
    let room = run([["h", join("host", "host-1")]]);
    expect(handle(room, "x", join("host", "someone-else"), 0).error).toBe("Someone is already hosting this game.");
    room = run([["h", { t: "leave" }], ["h2", join("host", "host-1")]], room);
    expect(room.connections.h2).toEqual({ role: "host", id: "host-1" });
  });

  it("adds a team when it names itself, and renames it later", () => {
    const room = run([["a", join("team", "team-a")], ["a", { t: "name", name: "Aces" }], ["a", { t: "name", name: "Ace Pilots" }]]);
    expect(room.game.teams).toEqual([{ id: "team-a", name: "Ace Pilots" }]);
  });

  it("rejects new teams after the game starts, but lets existing teams reconnect", () => {
    const room = run(setup);
    expect(handle(room, "c", join("team", "team-c"), 0).error).toBe("This game has already started.");
    expect(handle(room, "a2", join("team", "team-a"), 0).error).toBeUndefined();
  });

  it("won't let the host's phone join as a team", () => {
    const room = run([["h", join("host", "host-1")]]);
    expect(handle(room, "x", join("team", "host-1"), 0).error).toBe("This phone is the host.");
  });
});

describe("permissions", () => {
  it("only the host runs the game", () => {
    const room = run(setup);
    const open: ClientMsg = { t: "act", action: { type: "openClue", cat: 0, row: 0 } };
    expect(handle(room, "a", open, 0).error).toBe("You can't do that.");
    expect(handle(room, "tv", open, 0).error).toBe("You can't do that.");
    expect(handle(room, "h", open, 0).room.game.phase).toBe("clue");
  });

  it("only the host can end a round or call time", () => {
    const room = run([["h", { t: "act", action: { type: "openClue", cat: 0, row: 0 } }]], run(setup));
    expect(handle(room, "a", { t: "act", action: { type: "endRound" } }, 0).error).toBe("You can't do that.");
    expect(handle(room, "tv", { t: "act", action: { type: "tick" } }, 99_000).error).toBe("You can't do that.");
    expect(handle(room, "h", { t: "act", action: { type: "tick" } }, 99_000).room.game.phase).toBe("reveal");
  });

  it("a team can only answer for itself", () => {
    const room = run(
      [
        ["h", { t: "act", action: { type: "openClue", cat: 0, row: 0 } }],
        ["a", { t: "act", action: { type: "submit", teamId: "team-b", text: "26.2" } }],
      ],
      run(setup),
    );
    expect(room.game.results["0-0"].answers).toEqual({ "team-a": "26.2" });
  });
});

describe("what each device sees", () => {
  const during = run(
    [
      ["h", { t: "act", action: { type: "openClue", cat: 0, row: 0 } }],
      ["a", { t: "act", action: { type: "submit", teamId: "team-a", text: "26.2" } }],
    ],
    run(setup),
  );

  it("the host sees the answer and every submission", () => {
    const g = viewFor(during, "h", 0)!.game;
    expect(g.board.categories[0].clues[0].answer).toBe("26.2");
    expect(g.results["0-0"].answers).toEqual({ "team-a": "26.2" });
  });

  it("the TV sees no answers, only who has answered", () => {
    const v = viewFor(during, "tv", 0)!;
    expect(v.game.board.categories[0].clues[0].answer).toBe("");
    expect(v.game.board.categories[0].clues[0].clue).not.toBe("");
    expect(v.game.board.categories[3].clues[4].answer).toBe("");
    expect(v.game.board.final.clue).toBe("");
    expect(v.game.results["0-0"].answers).toEqual({});
    expect(v.ready).toEqual(["team-a"]);
  });

  it("a team sees only its own answer", () => {
    expect(viewFor(during, "a", 0)!.game.results["0-0"].answers).toEqual({ "team-a": "26.2" });
    expect(viewFor(during, "b", 0)!.game.results["0-0"].answers).toEqual({});
  });

  it("everyone sees the answer after the reveal", () => {
    const after = run([["h", { t: "act", action: { type: "endRound" } }]], during);
    const g = viewFor(after, "b", 0)!.game;
    expect(g.board.categories[0].clues[0].answer).toBe("26.2");
    expect(g.results["0-0"].answers).toEqual({ "team-a": "26.2" });
  });

  it("wagers stay private until the final reveal", () => {
    const room = run(
      [
        ["h", { t: "act", action: { type: "goToFinal" } }],
        ["h", { t: "act", action: { type: "adjust", teamId: "team-a", delta: 500 } }],
        ["h", { t: "act", action: { type: "adjust", teamId: "team-b", delta: 500 } }],
        ["a", { t: "act", action: { type: "wager", teamId: "team-a", amount: 300 } }],
        ["b", { t: "act", action: { type: "wager", teamId: "team-b", amount: 100 } }],
      ],
      run(setup),
    );
    expect(viewFor(room, "a", 0)!.game.wagers).toEqual({ "team-a": 300 });
    expect(viewFor(room, "tv", 0)!.game.wagers).toEqual({});
    expect(viewFor(room, "tv", 0)!.ready).toEqual(["team-a", "team-b"]);
    expect(viewFor(room, "a", 0)!.game.board.final.category).toBe("Running Firsts");
    expect(viewFor(room, "a", 0)!.game.board.final.clue).toBe("");
  });

  it("lists connected teams", () => {
    const room = run([["b", { t: "leave" }]], run(setup));
    expect(viewFor(room, "tv", 0)!.connected).toEqual(["team-a"]);
  });
});
