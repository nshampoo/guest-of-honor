import { useEffect, useState } from "react";
import { validateBoard } from "../engine/board";
import { type Action, newGame, reduce } from "../engine/game";
import { currentBoard } from "./board";
import { clearDraft, saveBoard } from "./ids";
import { PhoneRoom, TvRoom } from "./rooms";
import { Editor } from "./editor";
import { GameScreen } from "./screens";

function LocalGame() {
  const [state, setState] = useState(() => newGame(currentBoard()));
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
  const [board, setBoard] = useState(currentBoard);
  const [errors, setErrors] = useState<string[]>([]);

  const load = async (file: File | undefined) => {
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return setErrors(["That file isn't valid JSON."]);
    }
    const problems = validateBoard(parsed);
    setErrors(problems);
    if (problems.length === 0) {
      saveBoard(parsed);
      clearDraft();
      setBoard(currentBoard());
    }
  };
  const useSample = () => {
    saveBoard(null);
    clearDraft();
    setBoard(currentBoard());
    setErrors([]);
  };

  return (
    <main className="lobby">
      <p className="eyebrow">Guest of Honor</p>
      <h1>{board.title}</h1>
      <p>Put the board on a TV and play from your phones, or run everything on one screen.</p>
      <a className="primary" href="?tv">
        Start a room on this screen
      </a>
      <a href="?local">Play on one screen</a>
      <form onSubmit={(e) => (e.preventDefault(), (location.search = `?join=${code.trim().toUpperCase()}`))}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Room code" maxLength={4} />
        <button disabled={code.trim().length !== 4}>Join a room</button>
      </form>
      <a href="?edit">Edit this board, or make your own</a>
      <details>
        <summary>Load a board</summary>
        <div className="stack">
          <input type="file" accept="application/json,.json" onChange={(e) => load(e.target.files?.[0])} />
          {errors.length > 0 && (
            <ul className="banner">
              {errors.slice(0, 5).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button className="link" onClick={useSample}>
            Use the sample board
          </button>
        </div>
      </details>
    </main>
  );
}

export function App() {
  const params = new URLSearchParams(location.search);
  if (params.has("join")) return <PhoneRoom code={params.get("join")!.toUpperCase()} />;
  if (params.has("tv")) return <TvRoom code={params.get("room")} />;
  if (params.has("local")) return <LocalGame />;
  if (params.has("edit")) return <Editor />;
  return <Home />;
}
