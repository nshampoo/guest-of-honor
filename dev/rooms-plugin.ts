import type { Plugin } from "vite";
import { WebSocketServer, type WebSocket } from "ws";
import { validateBoard } from "../src/engine/board";
import { type ClientMsg, type Room, type ServerMsg, createRoom, handle, viewFor } from "../src/engine/room";

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

// Dev stand-in for API Gateway and the rooms Lambda: the same room logic, with rooms kept in memory.
export function roomsPlugin(): Plugin {
  return {
    name: "rooms",
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const rooms = new Map<string, Room>();
      const sockets = new Map<string, WebSocket>();
      const roomOf = new Map<string, string>();
      let nextId = 0;

      server.httpServer?.on("upgrade", (req, socket, head) => {
        if (req.url !== "/room") return;
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
      });

      const send = (connId: string, msg: ServerMsg) => sockets.get(connId)?.send(JSON.stringify(msg));

      const broadcast = (room: Room) => {
        const now = Date.now();
        for (const connId of Object.keys(room.connections)) {
          const view = viewFor(room, connId, now);
          if (view) send(connId, { t: "view", view });
        }
      };

      const newCode = () => {
        let code: string;
        do {
          code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
        } while (rooms.has(code));
        return code;
      };

      const receive = (connId: string, msg: ClientMsg) => {
        if (msg.t === "create") {
          const errors = validateBoard(msg.board);
          if (errors.length) return send(connId, { t: "error", message: errors[0] });
          const code = newCode();
          rooms.set(code, createRoom(code, msg.board));
          msg = { t: "join", code, role: "tv", id: "tv" };
        }
        const code = msg.t === "join" ? msg.code : roomOf.get(connId);
        const room = code ? rooms.get(code) : undefined;
        if (!room) return send(connId, { t: "error", message: "Room not found." });
        const result = handle(room, connId, msg, Date.now());
        if (result.error) return send(connId, { t: "error", message: result.error });
        if (msg.t === "join") roomOf.set(connId, room.code);
        rooms.set(room.code, result.room);
        broadcast(result.room);
      };

      wss.on("connection", (ws) => {
        const connId = String(nextId++);
        sockets.set(connId, ws);
        ws.on("message", (data) => {
          try {
            receive(connId, JSON.parse(String(data)));
          } catch {
            send(connId, { t: "error", message: "Bad message." });
          }
        });
        ws.on("close", () => {
          if (roomOf.has(connId)) receive(connId, { t: "leave" });
          sockets.delete(connId);
          roomOf.delete(connId);
        });
      });
    },
  };
}
