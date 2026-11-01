# Guest of Honor: Design

## 1. Goal

Build a party trivia board themed around one person. The categories come from their life (their school, their hobbies, their hometown), but the clues are real trivia anyone can answer. It's not a quiz about the person.

A creator chats with an agent about the honoree. The agent proposes categories, writes fact-checked clues, and the creator tweaks them. Then the host runs the game on a TV while players answer from their phones.

Hosted at `shampoe.com/guest-of-honor/`. The first users are me and my friends.

## 2. How a game works

**Making one**
1. **Interview.** The agent asks about the honoree and follows up on good threads.
2. **Categories.** The agent proposes 6 categories. The creator approves, swaps, or renames them.
3. **Clues.** The agent writes 5 clues per category (200 to 1000) plus a final clue, each with an answer and a source link.
4. **Edit.** Every clue has a re-roll button (new clue from the agent) and a pencil (edit the text by hand).
5. **Save.** The game is saved as **unlisted** (link only) or **gallery** (listed on the site). There's also a quiet "download" option for a single offline HTML file that plays in single-screen mode.

**Playing one**
1. The host opens the game on a TV or laptop and starts a room. The screen shows a room code and a QR code.
2. Each team joins on one phone and types a team name. One device is one team.
3. The host picks a tile. The clue shows on the TV and on phones, and a timer starts (30 seconds by default).
4. Each team talks it over and submits one answer. This is not a race. Nobody buzzes in first. The round ends when the timer runs out, when every team has answered, or when the host ends it early.
5. The TV reveals every team's answer next to the correct one. The engine suggests which answers match, and the host taps to confirm. Every correct team scores. Wrong answers cost nothing.
6. The TV shows the running scoreboard, then goes back to the board.
7. Final round: teams wager, then answer.

Without a room, the host can still run the game on one screen and judge answers out loud.

## 3. Architecture

```
shampoe.com (personal-website repo)
  ├─ /guest-of-honor/        story page
  ├─ /guest-of-honor/open/   site header + iframe of the app
  └─ /guest-of-honor/app/* ──proxy──▶ this repo's CloudFront
                                          ├─ /*      ▶ S3 (React app build)
                                          └─ /api/*  ▶ Lambda function URL (api)

Phones and host screen ──wss──▶ API Gateway WebSocket API ▶ Lambda (rooms)

api Lambda ──▶ Claude API (interview, clues, fact-check)
           ──▶ DynamoDB (games, interview sessions, rooms)
           ──▶ SNS topic ──▶ email to me when a game is created
```

- **TypeScript everywhere.** The pure engine in `src/engine/` is shared by the app and both Lambdas.
- **Lambda function URL for the API, not API Gateway HTTP API.** Writing a full board with web searches can take over a minute. API Gateway HTTP APIs cut requests off at 30 seconds. Function URLs allow up to 15 minutes and can stream responses, so the chat can show text as it's written. CloudFront fronts the URL with origin access control so it isn't public.
- **WebSocket API for rooms.** The server has to push to every phone at once ("clue open", "time's up", "answers revealed"). API Gateway WebSocket APIs hold the connections, and a Lambda handles each message. Phones connect straight to the `wss://` URL.
- **Secrets in SSM Parameter Store** as SecureStrings, created by hand: `/guest-of-honor/anthropic-api-key` and `/guest-of-honor/password`.
- **Owner email for SNS** is passed at deploy time (`-c notifyEmail=...`) so it never lands in the public repo.

## 4. Data (one DynamoDB table, on-demand)

| pk | sk | What | Public? |
|---|---|---|---|
| `GAME#<id>` | `META` | Title, honoree first name, visibility, created time, board (categories, clues, answers, sources) | Board only, through its link or the gallery |
| `SESSION#<id>` | `CHAT` | Interview transcript | Never. Expires after 30 days. |
| `ROOM#<code>` | `STATE` | Game id, current clue, timer end, scores, host connection | Expires after 1 day |
| `ROOM#<code>` | `TEAM#<teamId>` | Team name, current connection, answer for the open clue | Expires after 1 day |

- A team is keyed by a random id the phone keeps in local storage, not by its connection. If a phone locks or drops wifi, it reconnects as the same team.

- Game ids are long and random, so unlisted links can't be guessed.
- A GSI on created time powers the gallery and my "what's been made" view.
- I can see every game, including unlisted ones. The create screen says so in plain words.

## 5. Agent design

This is the main thing I'm here to learn.

| Step | Pattern | Details |
|---|---|---|
| Interview | Conversational agent | System prompt gives it a goal (find 6 rich, specific themes) and a sense of when it's done. When ready, it calls a `propose_categories` tool, and the UI renders those as editable cards. |
| Clues | Workflow, one call per category, run in parallel | Each call gets the category, the honoree context, and the crowd (difficulty, tone). It uses the `web_search` server tool to check facts and returns clues through a strict `write_clues` tool schema: value, clue, answer, source URL. |
| Re-roll | Single call | Same schema for one clue, told which clues already exist so it doesn't repeat. |
| Pencil | No LLM | Plain editing. |
| Answer matching | Pure code | Normalized fuzzy match in the engine suggests right or wrong. The host decides. |

- **Model:** `claude-sonnet-5-5` with adaptive thinking. Effort `low` for the interview chat and `medium` for clue writing. Server-side refusal fallbacks on.
- **Tools come back as structured data.** That's how the app trusts the board shape without parsing prose.
- **Fact-checking is the main risk.** A wrong answer in front of a room ruins the moment. Every clue needs a source, and the editor shows it.

### Access and limits
- Anyone can browse the gallery and play any game they have a link to.
- Creating or re-rolling needs the shared password. The api Lambda checks it against SSM before calling Claude.
- A daily cap (a counter row in DynamoDB) limits how many games can be made, even with the password.

## 6. Cost

**Claude, per game (Sonnet 5.5: $2 input / $10 output per million tokens; web search $10 per 1,000):**

| Step | Tokens | Searches | Cost |
|---|---|---|---|
| Interview, about 10 turns | about 40K in, 5K out | 0 | about $0.13 (less with prompt caching) |
| Clues, 6 categories + final | about 10K in, 12K out (with thinking) | 0 | about $0.14 |
| Fact-check | about 150K to 250K in from search results | about 31 | $0.31 searches + $0.30 to $0.50 tokens |
| **Total** | | | **about $0.90 to $1.10 per game** |

Fact-checking is most of the cost. To cut it further, search only for clues the model flags as unsure. At 10 games a month that's about $10. The same game on Opus 5.5 would be about $1.50 to $2.00.

**AWS:** S3, CloudFront, Lambda, DynamoDB on-demand, SNS email, and SSM standard parameters should all stay at or near zero at this scale. API Gateway WebSocket charges per message and per connection-minute. A 10-person, 1-hour game is a few thousand messages, which is fractions of a cent.

## 7. Phases

1. **Engine and local play.** Board types, scoring, timer and round state machine, answer matching, all with tests. A single-screen host view that plays a hand-written sample board. No backend.
2. **Agent in the terminal.** A local script that runs the interview and writes a board JSON. Learn the Claude API and tool use before adding infra.
3. **Backend and editor.** CDK stack (S3, CloudFront, api Lambda, DynamoDB, SNS, SSM), password gate, the chat UI, the editor with re-roll and pencil, unlisted links, the email on create.
4. **Rooms.** WebSocket API, phone join with QR code and team names, timer with host end-early, reveal and judge, running scoreboard.
5. **Ship.** Gallery, quiet offline download, personal-website pages and workshop row.

## 8. Decided

- **2026-11-01** Name: Guest of Honor. Repo, folder, and site path are `guest-of-honor`.
- **2026-11-01** Themed around the person, with real trivia. Not a quiz about the person.
- **2026-11-01** Anyone can browse. Creating needs a shared password.
- **2026-11-01** Games are unlisted by default, gallery is opt-in, and offline download is a quiet option. Interview transcripts are never public.
- **2026-11-01** Multiplayer is a timed team answer, not a buzzer race.
- **2026-11-01** Email me through SNS every time a game is created.
- **2026-11-01** Creators can re-roll any clue or edit it by hand.
- **2026-11-01** One phone per team. Teams name themselves when they join.
- **2026-11-01** A round ends on the timer, when every team has answered, or when the host ends it early. A running scoreboard shows between clues.
- **2026-11-01** Sonnet 5.5 for every agent step, about $1 per game. Opus isn't needed for this.

## 9. Open decisions

- **Stack approval.** React + Vite + TypeScript app, Node Lambdas, CDK in TypeScript. New dependencies: `react`, `vite`, `@anthropic-ai/sdk`, CDK libraries, and `vitest` for tests.
- **My owner view.** A script that lists recent games from DynamoDB, or a password-protected admin page?
- **Twists.** Ideas: a hidden "Honor Roll" tile worth double that the honoree picks, a final round that *is* personal trivia, an end screen that reveals how each category tied back to them.
