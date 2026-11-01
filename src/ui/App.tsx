import { useEffect, useState } from "react";
import type { Board } from "../engine/board";
import { type Action, newGame, reduce } from "../engine/game";
import sample from "../boards/sample.json";
import { BoardScreen, ClueScreen, DoneScreen, FinalWagerScreen, LobbyScreen, RevealScreen, ScoresScreen } from "./screens";

export function App() {
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

  const props = { state, act, now };
  switch (state.phase) {
    case "lobby":
      return <LobbyScreen {...props} />;
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
