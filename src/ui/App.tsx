import { useEffect, useState } from "react";
import type { Board } from "../engine/board";
import { type Action, newGame, reduce } from "../engine/game";
import sample from "../boards/sample.json";
import { PhoneRoom, TvRoom } from "./rooms";
import { GameScreen } from "./screens";

function LocalGame() {
  const [state, setState] = useState(() => newGame(sample as Board));
  const [now, setNow] = useState(() => Date.now());
  const act = (action: Action) => setState((s) => reduce(s, action, Date.now()));

  const timed = state.phase === "clue" || state.phase === "finalClue";
  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => {
      setNow(Date.now());
      act({ type: "tick" });
    }, 200);
    return () => clearInterval(id);
  }, [timed]);

  return <GameScreen state={state} act={act} now={now} mode="local" />;
}

function Home() {
  const [code, setCode] = useState("");
  return (
    <main className="lobby">
      <p className="eyebrow">Guest of Honor</p>
      <h1>{sample.title}</h1>
      <p>Put the board on a TV and play from your phones, or run everything on one screen.</p>
      <a className="primary" href="?tv">
        Start a room on this screen
      </a>
      <a href="?local">Play on one screen</a>
      <form onSubmit={(e) => (e.preventDefault(), (location.search = `?join=${code.trim().toUpperCase()}`))}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Room code" maxLength={4} />
        <button disabled={code.trim().length !== 4}>Join a room</button>
      </form>
    </main>
  );
}

export function App() {
  const params = new URLSearchParams(location.search);
  if (params.has("join")) return <PhoneRoom code={params.get("join")!.toUpperCase()} />;
  if (params.has("tv")) return <TvRoom code={params.get("room")} />;
  if (params.has("local")) return <LocalGame />;
  return <Home />;
}
