# Who Saw Me? — v1

A browser-based 3D multiplayer hide-and-seek game (original implementation,
mechanically inspired by the "paint yourself to blend in" genre — no code,
assets, or content copied from any existing game).

## What's in v1

- Lobby: create/join room by 5-character code
- Roles: Hiders and Seekers, auto-assigned (~1 seeker per 4 players)
- Prep phase (60s): Hiders paint their character (brush/fill/eyedropper),
  adjust metalness/roughness to match nearby props
- Hunt phase (3 min): Seekers move around and tag Hiders within range
- Movement: walk, sprint, jump, crouch
- Server-authoritative phase timing + tag validation; client-authoritative
  movement with reconciliation broadcast
- Placeholder map: ground plane + scattered boxes as camouflage targets

**Deferred to v2:** wall-climbing/ceiling-cling, scaling, pose-locking,
voice chat, X-ray/free-cam spectator mode, auto-taunt, Infection mode,
community map sharing.

**No database in v1.** All game state (rooms, players, roles, timers) lives
in server memory for the duration of a match — that's all v1 needs. Add
MongoDB Atlas later only if you want things to survive a server restart:
persistent profiles, saved camo presets, match history, leaderboards. It's
a bolt-on, not a rework — nothing in the current architecture blocks it.

## Architecture

```
client/  (deploy: Vercel, static)
  core/     — Game.js (state machine + main loop), NetworkClient, MessageSchema
  render/   — SceneManager (Three.js scene/camera/lights/map), PlayerMesh (paintable humanoid)
  movement/ — PlayerController (input, velocity, basic AABB collision)
  paint/    — PaintSystem (brush/fill/eyedropper), MaterialControls (sliders)
  ui/       — HUD (lobby, timer, role, paint toolbar)

server/  (deploy: Render, Node)
  index.js        — ws bootstrap, routes messages to rooms
  GameRoom.js     — authoritative phase/timer/tag logic per room
  RoomManager.js  — room code generation, join/create
  MessageSchema.js— wire format (kept in sync manually with client copy)
```

No bundler is used (per mobile-only / no-npm-locally workflow), so
`MessageSchema.js` is intentionally duplicated between client and server —
if you add a message type, add it in both places.

## Deploy — mobile-only workflow (GitHub web UI + Vercel + Render dashboards)

You don't need npm, git CLI, or a laptop for any of this. Everything below
is done through mobile browser tabs.

### 1. Get the code into one GitHub repo

1. On GitHub (mobile browser), create a new repo — e.g. `who-saw-me`.
2. Unzip this project locally on your phone (any file manager / zip app
   that extracts to a folder works — e.g. Files app on iOS, or a zip
   extractor app on Android).
3. In the GitHub repo, use **Add file → Upload files**. Upload the
   contents of the `server/` folder first — GitHub's uploader accepts
   multi-file selection, and it preserves subfolder structure if your
   file picker lets you select a whole folder. If your phone's file
   picker only allows individual file selection (common on iOS Safari),
   upload files one by one into a `server/` path by typing the path
   before the filename in the commit box, or create the folder structure
   by uploading one file first with the full path typed in
   (e.g. `server/index.js`) — GitHub creates the folder automatically.
4. Repeat for `client/` and `README.md`.
5. Commit directly to `main`.

If this gets fiddly with your phone's file picker, an easier alternative:
GitHub Mobile app (not just browser) has a slightly better multi-file
upload flow than mobile Safari/Chrome hitting github.com directly.

### 2. Server → Render

1. On Render (mobile browser), **New → Web Service**.
2. Connect your GitHub account, pick the `who-saw-me` repo.
3. **Root Directory**: `server`
4. **Build command**: `npm install`
5. **Start command**: `npm start`
6. **Instance type**: Free is fine for testing with friends.
7. Deploy. Render gives you a URL like `who-saw-me.onrender.com` —
   note it down. `index.js` already reads `process.env.PORT`, which
   Render sets automatically, so no env var setup needed.
8. Render auto-redeploys every time you commit to `main` — this matters
   a lot for you since you'll be editing directly in GitHub's web editor
   going forward, not pushing from a local machine.

**Free tier heads up:** Render's free web services spin down after 15
minutes of inactivity and take ~30-60s to wake on the next connection.
First player to open the game after idle time will see a delayed
WebSocket connection — not a bug, just cold start. Fine for playtesting
with friends; if it bugs you, Render's paid tier keeps it warm.

### 3. Client → Vercel

1. On Vercel (mobile browser), **New Project**, import the same
   `who-saw-me` GitHub repo.
2. **Root Directory**: `client`
3. **Framework preset**: Other / None — no build command needed, it's
   static ES modules loading Three.js from a CDN via import map.
4. Deploy. Vercel gives you a URL like `who-saw-me.vercel.app`.
5. Vercel also auto-redeploys on every commit to `main`.

### 4. Wire client to server (one required edit)

Before the game actually works end-to-end, point the client at your
live Render server:

1. In GitHub's web UI, open `client/index.html`.
2. Tap the pencil/edit icon.
3. Find this line near the bottom:
   ```html
   window.WHOSAWME_SERVER_URL = 'ws://localhost:8080';
   ```
4. Replace it with your Render URL, using `wss://` (not `ws://`) since
   Render serves over TLS:
   ```html
   window.WHOSAWME_SERVER_URL = 'wss://who-saw-me.onrender.com';
   ```
5. Commit directly to `main` from the GitHub web editor. Vercel picks up
   the change and redeploys automatically — no local build step, ever.

That's the whole loop for every future change too: edit file in GitHub
web UI → commit → Vercel/Render auto-redeploy. No local dev environment
required at any point.

## Known v1 limitations (by design, not oversight)

- Movement is client-authoritative with only bounds clamping server-side —
  fine for a friendly playtest, not cheat-proof. Add server-side movement
  validation before any public release.
- Paint strokes are relayed peer-to-peer-via-server but not persisted —
  a player who joins mid-prep-phase won't see previously painted strokes
  from others until they paint again. Fix: cache last N strokes per player
  in `GameRoom` and replay on join.
- Collision is AABB-vs-point on props only; no player-vs-player collision,
  no wall collision beyond the map boundary (there is none yet).
- One hardcoded placeholder map. Map loading system is not built yet.
- No database — restarting the Render service wipes all active rooms.
  Fine for now; revisit if you add persistence features.
