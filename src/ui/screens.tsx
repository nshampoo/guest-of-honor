import { useState } from "react";
import { type Action, type GameState, clueAt, maxWager, scores } from "../engine/game";

type Props = { state: GameState; act: (a: Action) => void; now: number };

function Scoreboard({ state, big = false }: { state: GameState; big?: boolean }) {
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

export function LobbyScreen({ state, act }: Props) {
  const [name, setName] = useState("");
  const add = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    act({ type: "addTeam", id: crypto.randomUUID(), name });
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
      <label>
        Seconds per clue{" "}
        <select value={state.timerMs / 1000} onChange={(e) => act({ type: "setTimer", ms: Number(e.target.value) * 1000 })}>
          {[15, 30, 45, 60].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <button className="primary" disabled={state.teams.length === 0} onClick={() => act({ type: "start" })}>
        Start game
      </button>
    </main>
  );
}

export function BoardScreen({ state, act }: Props) {
  return (
    <main>
      <div className="grid">
        {state.board.categories.map((cat, c) => (
          <div key={c} className="column">
            <h2>{cat.title}</h2>
            {cat.clues.map((clue, r) => {
              const used = state.results[`${c}-${r}`] !== undefined;
              return (
                <button key={r} className="tile" disabled={used} onClick={() => act({ type: "openClue", cat: c, row: r })}>
                  {used ? "" : clue.value}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <Scoreboard state={state} />
      <button className="link" onClick={() => act({ type: "goToFinal" })}>
        Skip to final round
      </button>
    </main>
  );
}

export function ClueScreen({ state, act, now }: Props) {
  const isFinal = state.phase === "finalClue";
  const clue = isFinal ? state.board.final : clueAt(state.board, state.current!);
  const seconds = Math.max(0, Math.ceil((state.endsAt! - now) / 1000));
  return (
    <main className="clue">
      <p className="eyebrow">
        {clue.category}
        {"value" in clue ? ` · ${clue.value}` : " · Final round"}
      </p>
      <h1>{clue.clue}</h1>
      <p className="timer">{seconds}</p>
      <button className="primary" onClick={() => act({ type: "endRound" })}>
        End round
      </button>
    </main>
  );
}

export function RevealScreen({ state, act }: Props) {
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
        {state.teams.map((t) => (
          <li key={t.id}>
            <span>
              {t.name}
              {result.answers[t.id] && <em> "{result.answers[t.id]}"</em>}
              {isFinal && <small> wagered {state.wagers[t.id] ?? 0}</small>}
            </span>
            <button
              className={result.correct[t.id] ? "right" : "wrong"}
              onClick={() => act({ type: "judge", teamId: t.id, correct: !result.correct[t.id] })}
            >
              {result.correct[t.id] ? "Right" : "Wrong"}
            </button>
          </li>
        ))}
      </ul>
      <button className="primary" onClick={() => act({ type: "next" })}>
        {isFinal ? "Final scores" : "Scores"}
      </button>
    </main>
  );
}

export function ScoresScreen({ state, act }: Props) {
  return (
    <main className="clue">
      <h1>Scoreboard</h1>
      <Scoreboard state={state} big />
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
    </main>
  );
}

export function FinalWagerScreen({ state, act }: Props) {
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
            <input
              type="number"
              min={0}
              max={maxWager(state, t.id)}
              step={100}
              value={state.wagers[t.id] ?? 0}
              onChange={(e) => act({ type: "wager", teamId: t.id, amount: Number(e.target.value) })}
            />
          </li>
        ))}
      </ul>
      <button className="primary" onClick={() => act({ type: "endRound" })}>
        Show the final clue
      </button>
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
