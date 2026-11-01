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

To build a board with the agent (needs Claude Platform on AWS; signs with your `aws login` session, no API key):

```
ANTHROPIC_AWS_WORKSPACE_ID=wrkspc_... npm run build-board          # interview, then writes boards/<name>.json
ANTHROPIC_AWS_WORKSPACE_ID=wrkspc_... npm run build-board -- --one # one category, for testing prompts
```

To play with phones: open the **Network** address `npm run dev` prints (like `http://192.168.1.20:5173`) on the laptop, click "Start a room on this screen", and scan the QR code with phones on the same wifi. One phone taps "Host this game"; the rest join as teams.

## Deploy

```
aws login --profile personal
(cd infra && npm install)
npm run diff     # build the app, show what would change
npm run deploy   # build the app, deploy the stack
```

The stack is `GuestOfHonor` in `us-east-1` (`cdk.json` pins the `personal` profile). It outputs `SiteUrl` (CloudFront) and `RoomUrl` (WebSocket API). The deploy writes `config.json` next to the app with `RoomUrl`, so phones know where to connect. shampoe.com serves `SiteUrl` at `/guest-of-honor/app/` (listed under `apps` in the personal-website repo's `infra/bin/infra.ts`).

| Path | What |
| --- | --- |
| `src/engine/` | Pure logic with tests: board format, game reducer, answer matching, rooms (permissions and what each device sees) |
| `src/ui/` | React app: home, board editor, single-screen play, TV, host phone, team phone |
| `src/boards/sample.json` | Hand-written sample board |
| `builder/agent.ts` | The builder agent: interview prompt, `propose_categories`, parallel fact-checked clue writers. No terminal code, so a Lambda can reuse it. |
| `builder/cli.ts` | Terminal front end for the builder |
| `dev/rooms-plugin.ts` | Local WebSocket rooms server inside the Vite dev server. Stands in for API Gateway and the rooms Lambda. |
| `infra/lib/` | CDK stack: S3 + CloudFront for the app, WebSocket API, rooms Lambda, DynamoDB |
| `infra/lambda/rooms.ts` | Rooms Lambda: loads a room, runs the engine's `handle()`, saves with a version check, pushes each device its view |
| `docs/DESIGN.md` | Goal, board format, builder and gameplay design, cost, phases, decisions |
