import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Action } from "../engine/game";
import type { ClientMsg, Role, View } from "../engine/room";
import { currentBoard } from "./board";
import { deviceId, saveRole, savedRole } from "./ids";
import { GameScreen, TimerSelect } from "./screens";
import { TeamPhone } from "./team";
import { useRoom, useTicker } from "./useRoom";

export type RoomHandle = ReturnType<typeof useRoom>;

const isTimed = (view: View | null) => view?.game.phase === "clue" || view?.game.phase === "finalClue";

function JoinQr({ code }: { code: string }) {
  const url = `${location.origin}${location.pathname}?join=${code}`;
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#24152f", light: "#fbf3ea" } }).then(setSrc);
  }, [url]);
  return (
    <div className="qr">
      {src && <img src={src} alt={`QR code to join room ${code}`} />}
      <p>
        Scan to join, or enter code <strong>{code}</strong>
      </p>
    </div>
  );
}

function TvLobby({ view }: { view: View }) {
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  return (
    <main className="tv-lobby">
      <div>
        <p className="eyebrow">Guest of Honor</p>
        <h1>{view.game.board.title}</h1>
        <p className="muted">{view.hostClaimed ? "The host is here. Teams, join now!" : "Waiting for someone to tap \"Host this game\"."}</p>
        <ul className="teams">
          {view.game.teams.map((t) => (
            <li key={t.id}>
              {t.name}
              {!view.connected.includes(t.id) && <span className="muted">offline</span>}
            </li>
          ))}
        </ul>
        {local && <p className="banner">Phones can't reach "localhost". Open this page at the Network address Vite prints.</p>}
      </div>
      <JoinQr code={view.code} />
    </main>
  );
}

export function TvRoom({ code: initial }: { code: string | null }) {
  const [code, setCode] = useState(initial);
  const hello: ClientMsg = code ? { t: "join", code, role: "tv", id: "tv" } : { t: "create", board: currentBoard() };
  const room = useRoom(hello);
  const now = useTicker(isTimed(room.view), room.serverNow);

  useEffect(() => {
    if (room.view && room.view.code !== code) {
      setCode(room.view.code);
      history.replaceState(null, "", `?tv&room=${room.view.code}`);
    }
  }, [room.view]);

  if (room.error && !room.view) {
    return (
      <main className="clue">
        <h1>{room.error}</h1>
        <a className="primary" href="?tv">
          Start a new room
        </a>
      </main>
    );
  }
  if (!room.view) return <main className="clue">Starting a room…</main>;
  if (room.view.game.phase === "lobby") return <TvLobby view={room.view} />;
  return <GameScreen state={room.view.game} act={() => {}} now={now} mode="tv" ready={room.view.ready} />;
}

function HostRoom({ room }: { room: RoomHandle }) {
  const view = room.view!;
  const g = view.game;
  const timed = isTimed(view);
  const now = useTicker(timed, room.serverNow);
  const act = (action: Action) => room.send({ t: "act", action });

  // A Lambda only runs when a message arrives, so the host's phone tells the server time is up.
  const lastTick = useRef(0);
  useEffect(() => {
    if (timed && g.endsAt !== null && now >= g.endsAt && Date.now() - lastTick.current > 500) {
      lastTick.current = Date.now();
      act({ type: "tick" });
    }
  }, [now, timed]);

  if (g.phase !== "lobby") return <GameScreen state={g} act={act} now={now} mode="host" />;
  return (
    <main className="lobby">
      <p className="eyebrow">You're the host · Room {view.code}</p>
      <h1>{g.board.title}</h1>
      <ul className="teams">
        {g.teams.length === 0 && <li className="muted">No teams yet. Have them scan the QR code on the TV.</li>}
        {g.teams.map((t) => (
          <li key={t.id}>
            {t.name}
            <button className="link" onClick={() => act({ type: "removeTeam", id: t.id })}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <TimerSelect state={g} act={act} />
      <button className="primary" disabled={g.teams.length === 0} onClick={() => act({ type: "start" })}>
        Start game
      </button>
    </main>
  );
}

export function PhoneRoom({ code }: { code: string }) {
  const id = deviceId();
  const [role, setRole] = useState(() => savedRole(code) as Role | null);
  const [pickError, setPickError] = useState<string | null>(null);
  const room = useRoom(role ? { t: "join", code, role, id } : null);

  useEffect(() => {
    if (role && room.view) saveRole(code, role);
  }, [room.view, role]);
  useEffect(() => {
    if (room.error && !room.view) {
      setPickError(room.error);
      saveRole(code, null);
      setRole(null);
    }
  }, [room.error]);

  if (!role) {
    return (
      <main className="phone">
        <p className="eyebrow">Room {code}</p>
        <h1>How are you playing?</h1>
        {pickError && <p className="banner">{pickError}</p>}
        <button className="primary" onClick={() => (setPickError(null), setRole("team"))}>
          Join as a team
        </button>
        <button onClick={() => (setPickError(null), setRole("host"))}>Host this game</button>
        <p className="muted">One phone per team. The host runs the game and sees the answers, so the host doesn't play.</p>
      </main>
    );
  }
  if (!room.view) return <main className="phone">Joining room {code}…</main>;
  return (
    <>
      {!room.online && <p className="banner top">Reconnecting…</p>}
      {room.online && room.error && <p className="banner top">{room.error}</p>}
      {role === "host" ? <HostRoom room={room} /> : <TeamPhone room={room} />}
    </>
  );
}
