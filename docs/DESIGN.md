# Guest of Honor: Design

## 1. Goal

Build a party trivia board themed around one person. The categories come from their life (their school, their hobbies, their hometown), but the clues are real trivia anyone can answer. It's not a quiz about the person.

There are two halves:
- **Builder:** a creator chats with an agent about the honoree. The agent proposes categories and writes fact-checked clues, and the creator tweaks them.
- **Gameplay:** a host runs the game on a TV while teams answer from their phones.

The halves only share one thing: **the board** (section 2). Each can be built and tested without the other.

Hosted at `shampoe.com/guest-of-honor/`. The first users are me and my friends.

## 2. The board

A board is JSON. The type and its validator live in `src/engine/board.ts`.

```ts
type Clue = { value: number; clue: string; answer: string; accept?: string[]; source?: string };
type Category = { title: string; clues: Clue[] };             // 5 clues, 200 to 1000
type FinalClue = { category: string; clue: string; answer: string; accept?: string[]; source?: string };
type Board = { title: string; honoree: string; categories: Category[]; final: FinalClue };  // 6 categories
```

- `accept` lists other answers that count (e.g. "Lincoln" for "Abraham Lincoln").
- `source` is the URL the builder used to check the fact.
- The builder's job is "produce a valid board." Gameplay's job is "play any valid board."

## 3. Builder

### Flow
1. **Interview.** The agent asks about the honoree and follows up on good threads.
2. **Categories.** The agent proposes 6 categories. The creator approves, swaps, or renames them.
3. **Clues.** The agent writes 5 clues per category plus a final clue, each with an answer and a source.
4. **Edit.** Every clue has a re-roll button (new clue from the agent) and a pencil (edit by hand).
5. **Save.** As **unlisted** (link only) or **gallery** (listed on the site). A quiet "download" option saves a single offline HTML file that plays in single-screen mode.

### Agent design

This is the main thing I'm here to learn.

| Step | Pattern | Details |
|---|---|---|
| Interview | Conversational agent | System prompt gives it a goal (find 6 rich, specific themes) and a sense of when it's done. When ready, it calls a `propose_categories` tool, and the UI renders those as editable cards. |
| Clues | Workflow, one call per category, run in parallel | Each call gets the category, the honoree context, and the crowd (difficulty, tone). Default to hard clues that reward a team talking it through, not instant recall. It uses the `web_search` server tool to check facts and returns clues through a strict `write_clues` tool schema. |
| Re-roll | Single call | Same schema for one clue, told which clues already exist so it doesn't repeat. |
| Pencil | No LLM | Plain editing. |

- **Model:** `claude-sonnet-5-5` with adaptive thinking. Effort `low` for the interview and `medium` for clue writing.
- **Claude Platform on AWS**, not an Anthropic API key and not Bedrock. Anthropic runs it, so it has web search (Bedrock doesn't). Calls are signed with AWS credentials, access is an IAM grant in CDK, and it bills through AWS Marketplace. No API key exists anywhere. The client is `@anthropic-ai/aws-sdk`, configured with `AWS_REGION` and a workspace id (not secret).
- **Tools come back as structured data.** That's how the app trusts the board shape without parsing prose.
- **Fact-checking is the main risk.** A wrong answer in front of a room ruins the moment. Every clue needs a source, and the editor shows it.

### Access and limits
- Anyone can browse the gallery and play any game they have a link to.
- Creating or re-rolling needs the shared password. The api Lambda checks it against SSM before calling Claude.
- A daily cap (a counter row in DynamoDB) limits how many games can be made, even with the password.
- I get an SNS email every time a game is created (title, categories, link, not the chat). I can see every game, including unlisted ones, and the create screen says so.

### Cost per game

Sonnet 5.5: $2 input / $10 output per million tokens. Web search: $10 per 1,000. Billed through AWS Marketplace, so it shows up in AWS Billing with everything else.

| Step | Tokens | Searches | Cost |
|---|---|---|---|
| Interview, about 10 turns | about 40K in, 5K out | 0 | about $0.13 (less with prompt caching) |
| Clues, 6 categories + final | about 10K in, 12K out (with thinking) | 0 | about $0.14 |
| Fact-check | about 150K to 250K in from search results | about 31 | $0.31 searches + $0.30 to $0.50 tokens |
| **Total** | | | **about $0.90 to $1.10** |

At 10 games a month that's about $10. The same game on Opus 5.5 would be about $1.50 to $2.00. To cut cost further, search only for clues the model flags as unsure.

## 4. Gameplay

### Devices in a room

| Device | Shows | Can do |
|---|---|---|
| **TV** (laptop on a TV) | Board, clue, timer, revealed answers, scoreboard. Never the answer before the reveal. | Nothing. Display only. |
| **Host phone** | Everything the TV shows, plus the answer and each team's submission | Pick tiles, end a round early, mark right or wrong, adjust scores |
| **Team phones** | The open clue, the timer, their answer box, their score | Name the team, submit an answer, wager in the final |

The host runs the game and doesn't play, since they can see the answers.

### Starting a game
1. The TV opens the game and creates a room. It shows a big **QR code** and a room code, plus the list of teams as they join.
2. The first phone to scan can claim **host**. Every other phone joins as a team: one phone is one team, and the team types its name.
3. The host taps start.

### A round
1. The host picks a tile. The clue shows on the TV and team phones, and a timer starts (60 seconds by default; 30, 90, or 120 can be picked in the lobby). The final clue gets 2 minutes.
2. Teams talk it over and submit one answer, which they can change. This is not a race.
3. The round ends when the timer runs out, every team has answered, or the host ends it early.
4. The host can **stop the timer**. Then there's no time limit, and only the host ends the round, even if every team has answered, so teams can keep debating.
5. The TV reveals every team's answer next to the correct one. The engine suggests which answers match, and the host confirms. Every correct team scores the clue's value. Wrong answers cost nothing.
6. The TV shows the running scoreboard, then the board.
7. After the last tile: final round. Teams wager up to their score, then answer the final clue. Right adds the wager, wrong subtracts it.

### Single-screen mode
No phones. The laptop is both TV and host. Teams answer out loud, and the host marks who got it right. This is what Phase 1 builds, and what the offline download plays.

### Engine (`src/engine/`)
- `game.ts`: a pure reducer, `reduce(state, action, now)`. Phases: lobby, board, clue, reveal, scores, final wager, final clue, final reveal, done. The timer is stored as an `endsAt` time, and actions pass in `now`, so tests control the clock.
- Scores are derived from the judged results, not stored. Changing a judgment later just changes the total.
- `match.ts`: normalizes answers (case, punctuation, "what is", "the") and allows a small typo distance. It only suggests. The host decides.

### Rooms (Phase 4)
- API Gateway WebSocket API with a Lambda per message. The room's game state lives in DynamoDB, and the Lambda runs the same engine reducer, then pushes the new state to every device.
- A team is keyed by a random id the phone keeps in local storage, not by its WebSocket connection. If a phone locks or switches networks, it reconnects as the same team.
- Each device gets only what it's allowed to see. The TV and teams never receive an answer before the reveal.
- Only the host's phone can end a round: by tapping "End round", or automatically when its countdown hits zero. A Lambda only runs when a message arrives, so the host's phone is what tells the server time is up. The server checks the time itself and rejects answers after the end time, even if the host's "time's up" is late.

## 5. Architecture

```
shampoe.com (personal-website repo)
  ├─ /guest-of-honor/        story page
  ├─ /guest-of-honor/open/   site header + iframe of the app
  └─ /guest-of-honor/app/* ──proxy──▶ this repo's CloudFront
                                          ├─ /*      ▶ S3 (React app build)
                                          └─ /api/*  ▶ Lambda function URL (api)

TV, host, and team phones ──wss──▶ API Gateway WebSocket API ▶ Lambda (rooms)

api Lambda ──▶ Claude API (interview, clues, fact-check)
           ──▶ DynamoDB (games, interview sessions, rooms)
           ──▶ SNS topic ──▶ email to me when a game is created
```

- **TypeScript everywhere.** React + Vite app, Node Lambdas, CDK in TypeScript. The engine is shared by the app and both Lambdas.
- **Lambda function URL for the API, not API Gateway HTTP API.** Writing a board with web searches can take over a minute. HTTP APIs cut requests off at 30 seconds. Function URLs allow up to 15 minutes and can stream responses. CloudFront fronts the URL with origin access control.
- **The one secret is the builder password**, an SSM SecureString created by hand: `/guest-of-honor/password`. Claude needs no key (IAM, see section 3).
- **Owner email for SNS** is passed at deploy time (`-c notifyEmail=...`) so it never lands in the public repo.
- **AWS cost** should stay at or near zero: S3, CloudFront, Lambda, DynamoDB on-demand, SNS email, and SSM standard parameters are all tiny at this scale. A 10-team, 1-hour game is a few thousand WebSocket messages, a fraction of a cent.

## 6. Data (one DynamoDB table, on-demand)

| pk | sk | What | Public? |
|---|---|---|---|
| `GAME#<id>` | `META` | Title, honoree, visibility, created time, board | Board only, through its link or the gallery |
| `SESSION#<id>` | `CHAT` | Interview transcript | Never. Expires after 30 days. |
| `ROOM#<code>` | `STATE` | The whole room: engine state (teams, scores, clues), host id, connections, and a version number | Expires after 1 day |
| `CONN#<connId>` | `ROOM` | Which room a connection is in | Expires after 1 day |

- Game ids are long and random, so unlisted links can't be guessed.
- A GSI on created time powers the gallery and my "what's been made" script.

## 7. Phases

1. **Board and engine, single-screen play.** *Done 2026-11-01.*
2. **Rooms, locally.** Room logic, local WebSocket dev server, TV, host, and team screens, QR code, longer timers, stop timer. *Built 2026-11-01 and verified with a scripted four-device game in headless Chrome. Not yet tried on real phones.*

### 3. Rooms on AWS
*Deployed 2026-11-01: stack `GuestOfHonor`, site at `d2jg6m7pcvok9m.cloudfront.net`.*
- [x] `infra/` CDK app (TypeScript), one stack, same shape as the other shampoe.com apps.
- [x] Site: private S3 bucket behind CloudFront (origin access control). `BucketDeployment` uploads `dist/` with `Cache-Control` set, since the shampoe.com proxy only caches files that have it.
- [x] `config.json` written by the deploy with the WebSocket URL, so the app build doesn't need to know it. Dev falls back to the local rooms server.
- [x] DynamoDB table: `pk`/`sk`, on-demand, TTL on `expiresAt`.
- [x] API Gateway WebSocket API with a `prod` stage. `$connect`, `$disconnect`, and `$default` all go to the rooms Lambda.
- [x] Rooms Lambda (Node, arm64), bundled with esbuild from `infra/lambda/rooms.ts`. For each message: load the room, run `handle()`, save it, push each device its `viewFor()` through the API Gateway Management API.
- [x] Save with a version number and a conditional write; retry on conflict. Two teams answering in the same instant must not overwrite each other.
- [x] `CONN#<connId>` items map a connection to its room, for `$disconnect`. Connections that are gone (410) get dropped from the room.
- [x] Least-privilege IAM: the Lambda can read and write only this table and post only to this API.
- [x] Verify: the four-device script passes against the CloudFront URL (43 checks, 2026-11-01). Still to do: a real game with phones on cellular.

### 4. Builder agent in the terminal
- [ ] Subscribe to Claude Platform on AWS in AWS Marketplace and create a workspace (by hand, in the console). Check first that it works on the AWS Free plan.
- [x] `@anthropic-ai/aws-sdk`. Locally it signs with the `personal` profile from `aws login`. *Request signing verified 2026-11-01; the service answers "not subscribed" until the sign-up works.*
- [x] `npm run build-board`: interview in the terminal, `propose_categories` tool, approve or edit categories. *Written, not yet run against Claude.*
- [x] One clue-writing call per category in parallel, with `web_search` for fact-checking and a strict `write_clues` tool. Then the final clue. *Written, not yet run.* `--one` writes a single category for cheap prompt testing.
- [x] `validateBoard`, save to `boards/<name>.json` (gitignored: boards describe real people).
- [x] Home page "load a board" so the TV can host any board file.
- [ ] Try it on a real friend. Log tokens and searches per run to check the cost math.

### 5. Builder on the web
- [ ] api Lambda function URL behind CloudFront at `/api/*`, streaming responses.
- [ ] Password in SSM, checked before any Claude call. Daily cap counter.
- [ ] `GAME#` and `SESSION#` items. Rooms start from a game id instead of the TV sending a board.
- [x] Board editor by hand (`?edit`): every field, sources, live validation, auto-saved draft, use or download. *Built 2026-11-01.*
- [ ] Chat UI, category cards, re-roll in the editor. Save unlisted or to the gallery.
- [ ] SNS topic with my email (passed at deploy), published on every save.
- [ ] `npm run recent` owner script.

### 6. Ship
- [ ] Gallery page and the quiet offline download.
- [ ] personal-website: `apps` entry in `infra/bin/infra.ts` (phones still connect to the WebSocket URL directly), story page at `site/guest-of-honor/`, `/open/` page, workshop row with `data-repo`, deploy.

## 8. Decided

- **2026-11-01** Name: Guest of Honor. Repo, folder, and site path are `guest-of-honor`.
- **2026-11-01** Themed around the person, with real trivia. Not a quiz about the person.
- **2026-11-01** Two halves, builder and gameplay, joined only by the board format.
- **2026-11-01** Anyone can browse. Creating needs a shared password.
- **2026-11-01** Games are unlisted by default, gallery is opt-in, and offline download is a quiet option. Interview transcripts are never public.
- **2026-11-01** Email me through SNS every time a game is created. Owner view starts as a script.
- **2026-11-01** Creators can re-roll any clue or edit it by hand.
- **2026-11-01** Sonnet 5.5 for every agent step, about $1 per game.
- **2026-11-01** Rooms have a display-only TV, one host phone with the answers and controls, and one phone per team. Teams name themselves. The start screen shows a QR code.
- **2026-11-01** Timed team answers, not a buzzer race. A round ends on the timer, when every team has answered, or when the host ends it. A running scoreboard shows between clues.
- **2026-11-01** Stack: React + Vite + TypeScript, vitest for the engine, Node Lambdas, CDK in TypeScript.
- **2026-11-01** Build the multiplayer game before the builder.
- **2026-11-01** Longer clocks: 60 seconds by default, 2 minutes for the final. The host can stop the timer, and then only the host ends the round.
- **2026-11-01** Hook up shampoe.com after the builder works, not before.
- **2026-11-01** All site costs are managed in the AWS console. Claude goes through Claude Platform on AWS (AWS Marketplace billing, IAM auth, web search included). Bedrock was ruled out because it has no web search.
- **2026-11-01** The builder writes hard clues by default. The game is about teams talking it through.

## 9. Open decisions

- **QR code library.** Phase 4 needs one to draw the code (e.g. the `qrcode` npm package). Ask before adding.
- **Twists.** Ideas: a hidden "Honor Roll" tile worth double that the honoree picks, a final round that *is* personal trivia, an end screen that reveals how each category tied back to them.
