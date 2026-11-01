import { useEffect, useRef, useState } from "react";
import type { ClientMsg, ServerMsg, View } from "../engine/room";

function roomUrl() {
  if (import.meta.env.VITE_ROOM_URL) return import.meta.env.VITE_ROOM_URL as string;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/room`;
}

// Keeps a WebSocket open, sends `hello` on every (re)connect, and holds the latest view.
export function useRoom(hello: ClientMsg | null) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const offset = useRef(0);
  const key = JSON.stringify(hello);

  useEffect(() => {
    if (!hello) return;
    let stopped = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(roomUrl());
      socket.current = ws;
      ws.onopen = () => {
        retries = 0;
        setOnline(true);
        ws.send(JSON.stringify(hello));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as ServerMsg;
        if (msg.t === "view") {
          offset.current = msg.view.serverNow - Date.now();
          setView(msg.view);
          setError(null);
        } else {
          setError(msg.message);
        }
      };
      ws.onclose = () => {
        setOnline(false);
        if (!stopped) timer = setTimeout(connect, Math.min(500 * 2 ** retries++, 5000));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket.current?.close();
    };
  }, [key]);

  const send = (msg: ClientMsg) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
  };
  // Countdowns use the server's clock, since phone clocks can be off by seconds.
  const serverNow = () => Date.now() + offset.current;
  return { view, error, online, send, serverNow };
}

export function useTicker(active: boolean, clock: () => number) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(clock()), 200);
    return () => clearInterval(id);
  }, [active]);
  return active ? now : clock();
}
