import { useState } from "react";
import { type GameState, type Team, clueAt, maxWager, scores } from "../engine/game";
import type { ClientMsg } from "../engine/room";
import type { RoomHandle } from "./rooms";
import { Countdown, Scoreboard } from "./screens";
import { useTicker } from "./useRoom";

type Send = (msg: ClientMsg) => void;

function NameForm({ send, current }: { send: Send; current?: string }) {
  const [name, setName] = useState(current ?? "");
  const submit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    send({ t: "name", name });
  };
  return (
    <form onSubmit={submit} className="stack">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" maxLength={24} autoFocus />
      <button className="primary" disabled={!name.trim() || name.trim() === current}>
        {current ? "Rename team" : "Join"}
      </button>
    </form>
  );
}

function AnswerBox({ g, me, now, send }: { g: GameState; me: Team; now: number; send: Send }) {
  const isFinal = g.phase === "finalClue";
  const clue = isFinal ? g.board.final : clueAt(g.board, g.current!);
  const locked = (isFinal ? g.final! : g.results[g.current!]).answers[me.id];
  const [text, setText] = useState("");
  const open = g.endsAt === null || now < g.endsAt;
  const submit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    send({ t: "act", action: { type: "submit", teamId: me.id, text: text.trim() } });
    setText("");
  };
  return (
    <>
      <p className="eyebrow">
        {clue.category}
        {"value" in clue ? ` · ${clue.value}` : " · Final round"}
      </p>
      <h2>{clue.clue}</h2>
      <Countdown endsAt={g.endsAt} now={now} small />
      {g.endsAt === null && <p className="muted">The host will end the round. Keep talking it over.</p>}
      {open ? (
        <form onSubmit={submit} className="stack">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" maxLength={80} />
          <button className="primary" disabled={!text.trim()}>
            {locked ? "Change answer" : "Lock it in"}
          </button>
        </form>
      ) : (
        <p>Time's up.</p>
      )}
      {locked && (
        <p className="muted">
          Locked in: <strong>{locked}</strong>
        </p>
      )}
    </>
  );
}

function WagerBox({ g, me, send }: { g: GameState; me: Team; send: Send }) {
  const max = maxWager(g, me.id);
  const [amount, setAmount] = useState("");
  const locked = g.wagers[me.id];
  const submit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    send({ t: "act", action: { type: "wager", teamId: me.id, amount: Number(amount) } });
  };
  return (
    <>
      <p className="eyebrow">Final round</p>
      <h2>{g.board.final.category}</h2>
      <p>Wager up to {max}. Get it right and you win your wager. Get it wrong and you lose it.</p>
      <form onSubmit={submit} className="stack">
        <input type="number" inputMode="numeric" min={0} max={max} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Wager" />
        <button className="primary" disabled={amount === ""}>
          {locked !== undefined ? "Change wager" : "Lock in wager"}
        </button>
      </form>
      {locked !== undefined && (
        <p className="muted">
          Locked in: <strong>{locked}</strong>
        </p>
      )}
    </>
  );
}

function RevealBox({ g, me }: { g: GameState; me: Team }) {
  const isFinal = g.phase === "finalReveal";
  const clue = isFinal ? g.board.final : clueAt(g.board, g.current!);
  const result = isFinal ? g.final! : g.results[g.current!];
  const right = result.correct[me.id];
  const mine = result.answers[me.id];
  const points = isFinal ? g.wagers[me.id] ?? 0 : "value" in clue ? clue.value : 0;
  return (
    <>
      <p className="eyebrow">The answer</p>
      <h1>{clue.answer}</h1>
      <p className={`badge ${right ? "right" : "wrong"}`}>
        {right ? `Right! +${points}` : isFinal && points ? `Not quite. −${points}` : mine ? "Not quite" : "No answer"}
      </p>
      {mine && <p className="muted">You said: {mine}</p>}
    </>
  );
}

export function TeamPhone({ room }: { room: RoomHandle }) {
  const view = room.view!;
  const g = view.game;
  const now = useTicker(g.phase === "clue" || g.phase === "finalClue", room.serverNow);
  const me = g.teams.find((t) => t.id === view.you);

  if (!me) {
    return (
      <main className="phone">
        <p className="eyebrow">Room {view.code}</p>
        {g.phase === "lobby" ? (
          <>
            <h1>Name your team</h1>
            <NameForm send={room.send} />
          </>
        ) : (
          <h1>This game started without you.</h1>
        )}
      </main>
    );
  }

  const body = () => {
    switch (g.phase) {
      case "lobby":
        return (
          <>
            <h1>You're in!</h1>
            <p className="muted">Waiting for the host to start.</p>
            <details>
              <summary>Change team name</summary>
              <NameForm send={room.send} current={me.name} />
            </details>
          </>
        );
      case "board":
        return <h1>Eyes on the TV. The host is picking a clue.</h1>;
      case "clue":
      case "finalClue":
        return <AnswerBox key={g.current ?? "final"} g={g} me={me} now={now} send={room.send} />;
      case "reveal":
      case "finalReveal":
        return <RevealBox g={g} me={me} />;
      case "scores":
      case "done":
        return (
          <>
            <h1>{g.phase === "done" ? "Final scores" : "Scoreboard"}</h1>
            <Scoreboard state={g} big />
          </>
        );
      case "finalWager":
        return <WagerBox g={g} me={me} send={room.send} />;
    }
  };

  return (
    <main className="phone">
      <header className="phone-head">
        <strong>{me.name}</strong>
        <span>{scores(g)[me.id]}</span>
      </header>
      {body()}
    </main>
  );
}
