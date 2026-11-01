# Guest of Honor

A party trivia board themed around one person. An agent interviews you about them, then writes real trivia in categories from their life. Friends play from their phones.

Planned for [shampoe.com/guest-of-honor](https://shampoe.com/guest-of-honor/). See [docs/DESIGN.md](docs/DESIGN.md) for the plan.

## Develop

```
npm install
npm run dev     # app plus a local rooms server, on your network
npm test        # engine tests
npm run build   # type-check and build to dist/
```

To play with phones: open the **Network** address `npm run dev` prints (like `http://192.168.1.20:5173`) on the laptop, click "Start a room on this screen", and scan the QR code with phones on the same wifi. One phone taps "Host this game"; the rest join as teams.

## Deploy

Not deployed yet.

| Path | What |
| --- | --- |
| `src/engine/` | Pure logic with tests: board format, game reducer, answer matching, rooms (permissions and what each device sees) |
| `src/ui/` | React app: home, single-screen play, TV, host phone, team phone |
| `src/boards/sample.json` | Hand-written sample board |
| `dev/rooms-plugin.ts` | Local WebSocket rooms server inside the Vite dev server. Stands in for API Gateway and the rooms Lambda. |
| `docs/DESIGN.md` | Goal, board format, builder and gameplay design, cost, phases, decisions |
