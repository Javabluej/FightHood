# College Hood

A browser fighting game built with TypeScript, Three.js, Vite and Web Audio. Rigged GLB characters fight on a fixed 60 Hz simulation plane. The menus, controls and political satire theme draw on the publicly visible FightKaro experience. This repository is an independent implementation; exact gameplay and visual parity have not been established.

## Run

Use Node.js 20.19+ and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For online rooms, also run:

```sh
npm run server
```

The room server defaults to port 8080. Both players must reach the same server. Deploy HTTPS clients with a reachable TLS WebSocket endpoint and set `VITE_MULTIPLAYER_URL=wss://your-server.example` at build time. `PORT` configures the server listening port. Static hosting alone does not provide multiplayer.

```sh
npm test
npm run build
npm run preview
npm run test:browser
HEADFUL=1 npm run test:preview
```

`npm test` runs assertion-based combat, animation, physics, AI and live WebSocket server regression tests. Browser tests start isolated Vite/room servers on ports 3173/18188 and headless Chrome on 9447; set `CHROME_PATH` when Chrome is installed elsewhere. The production preview test uses the built `dist/` and room port 8080. `HEADFUL=1` uses a visible browser; use it on macOS hosts whose headless compositor stalls. They write screenshots and a JSON report to `test-results/` and clean up their own processes.

## Play

- Move: A/D or left/right arrows. Jump: W/up. Crouch: S/down.
- Block: hold away from the opponent. Crouch plus back guards low attacks; standing back guards mid/high attacks.
- Punch J, kick K, grab I or simultaneous J+K, super L/Space at full SHAKTI.
- Forward+J/K use specials; down+K sweeps. Chains include J,J,J; J,J,K; J,K,K; K,K.
- Esc pauses/resumes. M toggles music. N toggles all audio. Audio starts muted.
- Selection: left/right change 1P, up/down change CPU (or guest), T cycles stages, 1/2/3 set difficulty, Enter starts.
- Mobile landscape displays one directional pad and four action buttons. Cancellation and lost pointer capture release held inputs.
- Best of three rounds, 60 seconds per round. Ties replay without awarding a win.
- Against Mbapu, build SHANTI by holding back within 2.5 arena units while grounded and able to guard. Accumulate 12 defensive seconds without attacking for a peaceful match victory. Any attack input resets the charge.

Nine fighters and three arenas are supplied, including Kenny, a strict Software Engineering teacher. Kenny adapts the existing detailed humanoid rig with a custom face texture, spectacles, a pink shirt/black waistcoat and an attendance-register ultimate. His displayed dialogue includes "What r u looking down there?", "I don't give a damn." and "No attendance for u, pa. Listen to class!". No recorded Kenny voice is supplied. Supers use complete procedural rig choreography and configured cinematic props. Matches wait for both models to load; failures return to selection with an error. `custom_fighter.ts` is an unregistered example that explicitly reuses Modi's model and chakra choreography; a distinct chai character/model/super is not supplied.

## Architecture and extension

- `src/combat/`: fighter state machine, move frame data, collision, fixed physics and defensive boss victory.
- `src/animation/`: authored procedural rig poses and GLB loading/cache/ownership.
- `src/core/GameEngine.ts`: match lifecycle, fixed update loop and host authority.
- `src/cinematics/`: nine super timelines; fixed 60 Hz choreography, launched-defender physics and cancellable cleanup.
- `src/characters/`: registry and roster definitions.
- `src/input/`, `src/ai/`, `src/ui/`: controls, difficulty profiles and screen/HUD flow.
- `src/multiplayer/` and `server/`: WebSocket client and room relay.

Register a `FighterDefinition` before constructing the engine. New entries appear in selection automatically. Definitions can specify `modelId`, `modelHeight`, `maxHealth`, `grabDamage`, movement/damage stats, move overrides or new move IDs in `moves`, and `attackPoses` with windup/strike pose data. Existing input types select the standard move IDs, so override those IDs for new normal attacks or connect new move IDs through `chains`. `superId` explicitly reuses an implemented super choreography. A new cinematic ability still needs an authored timeline in `SuperDirector`; arbitrary abilities are not yet plug-ins. New models must use compatible humanoid bones or need a rig adapter.

Online matches resolve hits, damage and results on the host and send complete fighter snapshots at roughly 30 Hz. The guest predicts its own movement/attack animation immediately, restores authoritative state, and replays unacknowledged inputs. Small position corrections are smoothed; prediction respects opponent pushboxes and never applies collision damage. This reduces input latency but is not full rollback netcode: confirmed hits still depend on network latency. The host is trusted. Rooms are ephemeral, hold two players, and close when either leaves. No authentication, matchmaking or hosted server is included.

See [ENGINEERING_REPORT.md](docs/ENGINEERING_REPORT.md) for repairs, verification evidence and remaining limitations. Asset provenance/licensing requires confirmation before public distribution.

Pratham is also playable: a reference-based young face, thick black glasses and cream hoodie, with the phone-themed **Ultimate Hurting**. It ignores a call, blocks the contact and deals 32 damage through a broken-heart impact. All four requested dialogue lines are displayed. See [PRATHAM.md](docs/PRATHAM.md) for assets, exact image-generation prompts and modeling details.

The latest ultimate audit fixes avatar shading, projectile paths, bucket/stamp impacts, launch/landing transitions and cinematic dialogue. The 46-test regression suite includes 162 ultimate scenarios. To capture production ultimate phases and mirrored corner sequences, run `HEADFUL=1 npm run test:preview -- --supers-only` after building; add `--fighter=modi` for one fighter. The complete browser suite remains `HEADFUL=1 npm run test:preview`.

[REFERENCE_REFRESH.md](docs/REFERENCE_REFRESH.md) records the reference website's current moves and additions, with local implementation limits stated explicitly.
