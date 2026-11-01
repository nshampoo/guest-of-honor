import { useState } from "react";
import { type Action, type GameState, clueAt, maxWager, scores } from "../engine/game";
import { randomId } from "./ids";

// local: one screen does everything. tv: display only. host: controls and answers.
export type Mode = "local" | "tv" | "host";
type Props = { state: GameState; act: (a: Action) => void; now: number; mode: Mode; ready?: string[] };

export function Scoreboard({ state, big = false }: { state: GameState; big?: boolean }) {
  const totals = scores(state);
  const teams = big ? [...state.teams].sort((a, b) => totals[b.id] - totals[a.id]) : state.teams;
  return (
    <ol className={big ? "scores big" : "scores"}>
      {teams.map((t) => (
        <li key={t.id}>
          <span>{t.name}</span>
          <strong>{totals[t.id]}</strong>
        </li>
      ))}
    </ol>
  );
}

export function TimerSelect({ state, act }: Pick<Props, "state" | "act">) {
  return (
    <label>
      Seconds per clue{" "}
      <select value={state.timerMs / 1000} onChange={(e) => act({ type: "setTimer", ms: Number(e.target.value) * 1000 })}>
        {[15, 30, 45, 60].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}

export function LocalLobby({ state, act }: Props) {
  const [name, setName] = useState("");
  const add = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    act({ type: "addTeam", id: randomId(), name });
    setName("");
  };
  return (
    <main className="lobby">
      <p className="eyebrow">Guest of Honor</p>
      <h1>{state.board.title}</h1>
      <form onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" maxLength={24} />
        <button disabled={!name.trim()}>Add team</button>
      </form>
      <ul className="teams">
        {state.teams.map((t) => (
          <li key={t.id}>
            {t.name}
            <button className="link" onClick={() => act({ type: "removeTeam", id: t.id })}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <TimerSelect state={state} act={act} />
      <button className="primary" disabled={state.teams.length === 0} onClick={() => act({ type: "start" })}>
        Start game
      </button>
    </main>
  );
}

export function BoardScreen({ state, act, mode }: Props) {
  return (
    <main>
      <div className="grid">
        {state.board.categories.map((cat, c) => (
          <div key={c} className="column">
            <h2>{cat.title}</h2>
            {cat.clues.map((clue, r) => {
              const used = state.results[`${c}-${r}`] !== undefined;
              return (
                <button
                  key={r}
                  className="tile"
                  disabled={used || mode === "tv"}
                  onClick={() => act({ type: "openClue", cat: c, row: r })}
                >
                  {used ? "" : clue.value}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <Scoreboard state={state} />
      {mode === "tv" ? (
        <p className="muted">The host picks the next clue.</p>
      ) : (
        <button className="link" onClick={() => act({ type: "goToFinal" })}>
          Skip to final round
        </button>
      )}
    </main>
  );
}

export function ClueScreen({ state, act, now, mode, ready = [] }: Props) {
  const isFinal = state.phase === "finalClue";
  const clue = isFinal ? state.board.final : clueAt(state.board, state.current!);
  const result = isFinal ? state.final! : state.results[state.current!];
  const seconds = Math.max(0, Math.ceil((state.endsAt! - now) / 1000));
  return (
    <main className="clue">
      <p className="eyebrow">
        {clue.category}
        {"value" in clue ? ` · ${clue.value}` : " · Final round"}
      </p>
      <h1>{clue.clue}</h1>
      <p className="timer">{seconds}</p>
      {mode === "tv" && (
        <p className="muted">
          {ready.length} of {state.teams.length} teams have answered
        </p>
      )}
      {mode === "host" && (
        <>
          <p className="answer">Answer: {clue.answer}</p>
          <ul className="judging">
            {state.teams.map((t) => (
              <li key={t.id}>
                <span>{t.name}</span>
                <em>{result.answers[t.id] ?? "…"}</em>
              </li>
            ))}
          </ul>
        </>
      )}
      {mode !== "tv" && (
        <button className="primary" onClick={() => act({ type: "endRound" })}>
          End round
        </button>
      )}
    </main>
  );
}

export function RevealScreen({ state, act, mode }: Props) {
  const isFinal = state.phase === "finalReveal";
  const clue = isFinal ? state.board.final : clueAt(state.board, state.current!);
  const result = isFinal ? state.final! : state.results[state.current!];
  return (
    <main className="clue">
      <p className="eyebrow">{clue.clue}</p>
      <h1>{clue.answer}</h1>
      {clue.source && (
        <a href={clue.source} target="_blank" rel="noreferrer">
          Source
        </a>
      )}
      <ul className="judging">
        {state.teams.map((t) => {
          const right = result.correct[t.id];
          return (
            <li key={t.id}>
              <span>
                {t.name}
                {result.answers[t.id] && <em> "{result.answers[t.id]}"</em>}
                {isFinal && <small> wagered {state.wagers[t.id] ?? 0}</small>}
              </span>
              {mode === "tv" ? (
                <span className={`badge ${right ? "right" : "wrong"}`}>{right ? "Right" : "Wrong"}</span>
              ) : (
                <button className={right ? "right" : "wrong"} onClick={() => act({ type: "judge", teamId: t.id, correct: !right })}>
                  {right ? "Right" : "Wrong"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {mode !== "tv" && (
        <button className="primary" onClick={() => act({ type: "next" })}>
          {isFinal ? "Final scores" : "Scores"}
        </button>
      )}
    </main>
  );
}

export function ScoresScreen({ state, act, mode }: Props) {
  return (
    <main className="clue">
      <h1>Scoreboard</h1>
      <Scoreboard state={state} big />
      {mode !== "tv" && (
        <>
          <details>
            <summary>Adjust scores</summary>
            {state.teams.map((t) => (
              <p key={t.id}>
                {t.name} <button onClick={() => act({ type: "adjust", teamId: t.id, delta: -100 })}>−100</button>{" "}
                <button onClick={() => act({ type: "adjust", teamId: t.id, delta: 100 })}>+100</button>
              </p>
            ))}
          </details>
          <button className="primary" onClick={() => act({ type: "next" })}>
            Back to the board
          </button>
        </>
      )}
    </main>
  );
}

export function FinalWagerScreen({ state, act, mode, ready = [] }: Props) {
  return (
    <main className="clue">
      <p className="eyebrow">Final round</p>
      <h1>{state.board.final.category}</h1>
      <p>Each team wagers up to its score.</p>
      <ul className="judging">
        {state.teams.map((t) => (
          <li key={t.id}>
            <span>
              {t.name} <small>(up to {maxWager(state, t.id)})</small>
            </span>
            {mode === "local" ? (
              <input
                type="number"
                min={0}
                max={maxWager(state, t.id)}
                step={100}
                value={state.wagers[t.id] ?? 0}
                onChange={(e) => act({ type: "wager", teamId: t.id, amount: Number(e.target.value) })}
              />
            ) : (
              <span className="muted">
                {mode === "host" && state.wagers[t.id] !== undefined ? state.wagers[t.id] : ready.includes(t.id) ? "Locked in" : "Thinking…"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {mode !== "tv" && (
        <button className="primary" onClick={() => act({ type: "endRound" })}>
          Show the final clue
        </button>
      )}
    </main>
  );
}

export function DoneScreen({ state }: Props) {
  const totals = scores(state);
  const top = Math.max(...state.teams.map((t) => totals[t.id]));
  const winners = state.teams.filter((t) => totals[t.id] === top).map((t) => t.name);
  return (
    <main className="clue">
      <p className="eyebrow">Here's to {state.board.honoree}</p>
      <h1>{winners.join(" and ")} won!</h1>
      <Scoreboard state={state} big />
    </main>
  );
}

export function GameScreen(props: Props) {
  switch (props.state.phase) {
    case "lobby":
      return <LocalLobby {...props} />;
    case "board":
      return <BoardScreen {...props} />;
    case "clue":
    case "finalClue":
      return <ClueScreen {...props} />;
    case "reveal":
    case "finalReveal":
      return <RevealScreen {...props} />;
    case "scores":
      return <ScoresScreen {...props} />;
    case "finalWager":
      return <FinalWagerScreen {...props} />;
    case "done":
      return <DoneScreen {...props} />;
  }
}
