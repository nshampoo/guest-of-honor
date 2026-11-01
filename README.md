# Guest of Honor

A party trivia board themed around one person. An agent interviews you about them, then writes real trivia in categories from their life. Friends play from their phones.

Planned for [shampoe.com/guest-of-honor](https://shampoe.com/guest-of-honor/). See [docs/DESIGN.md](docs/DESIGN.md) for the plan.

## Develop

```
npm install
npm run dev     # http://localhost:5173, plays the sample board on one screen
npm test        # engine tests
npm run build   # type-check and build to dist/
```

## Deploy

Not deployed yet.

| Path | What |
| --- | --- |
| `src/engine/` | Pure logic: board format and validator, game reducer, answer matching, with tests |
| `src/ui/` | React app. Single-screen play for now. |
| `src/boards/sample.json` | Hand-written sample board |
| `docs/DESIGN.md` | Goal, board format, builder and gameplay design, cost, phases, decisions |
