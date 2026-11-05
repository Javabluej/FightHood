# Engineering audit and repair report

Audit date: 4 November 2026. Stack: TypeScript, npm, Vite, Three.js, Web Audio and a standalone `ws` room server. Characters use skinned GLB rigs and authored procedural poses, not sprite sheets. Existing dependencies were already installed; no new runtime dependency was introduced.

## 1. Issues discovered

| Severity | Defect and cause | Resolution |
| --- | --- | --- |
| Critical | Delayed round/result callbacks retained access to mutable engine fields after a quit or restart. | Match/round generation guards invalidate obsolete work. |
| Critical | A lethal throw forced knockdown even at zero health; recovery could restore an actionable dead fighter. | Throws enter terminal KO; dead fighters cannot start attacks. |
| High | Round termination stopped fighter updates, freezing KO launches above the floor. | Locked round states continue physics and animation clocks. |
| High | Super timing ran during its asynchronous banner, and supers continued through pause. Cancelled banner continuations could add props after cleanup. | Readiness gate, fixed choreography clock, cancellation guards and separate cleanup/completion. |
| High | Super launch velocities were assigned without integrating the defender during the cinematic. Normal rig updates also competed with director poses. | Fixed-step cinematic knockback and one owner for each pose. |
| High | Blockstun was excluded from guardable states, permitting subsequent hits to bypass held guard. Crouch input could also change a standing attack's pose/hurt profile. | Continuous guarding and state-derived attack crouching. |
| High | Collision used only a broad elevation difference; active strikes resolved in P1 order and interrupted P2 before a possible trade. | Vertical strike/hurt interval overlap and simultaneous strike capture. |
| High | CPU startup detection bypassed reaction delays; queued attack buttons fired every update; jump-in kick queues were never executed. | Profile reaction gates, one-shot queue entries and shared queued-button execution. |
| High | Partial guest prediction lacked airborne/stun/invulnerability fields and could restart attack state while copying snapshots. Rematch events were dispatched twice; identical-character winners were inferred by character ID. | Complete host-authoritative snapshots, single dispatch and score-based winner side. |
| High | Server relayed arbitrary message types from either role, permitted abandoned room memberships and did not guarantee code uniqueness. | Role-aware relay, normalized inputs, unique codes, membership cleanup, payload bounds and heartbeat. |
| High | Pause button displayed an overlay without pausing simulation; touch UI contained a second unbound control set and lacked cancellation cleanup. | Engine pause callback, synchronized online pause and one pointer-driven pad. |
| Medium | Neutral state clocks reset every tick; a second attack-pose smoothing filter delayed visible strikes beyond active frames; high-hit reactions read a nonexistent field. | Transition-only state clock resets, explicit attack/hit restarts, direct frame-derived attack poses and correct height metadata. |
| Medium | Asset completion could repopulate disposed rigs; stand-in meshes, shadow textures, costumes and stage scenery had ownership/cleanup gaps. | Disposal guards and owned-resource cleanup; shared GLB data remains cached. |
| Medium | HUD scheduled health trail timers and restarted combo animations every simulation frame. Crowd bodies/heads required 360 individual mesh draws. Random point-light visibility changed shader light counts. | Change-driven HUD work, instanced crowd and camera flash sprites. |
| Medium | Loading automatically accepted the opening notice; advertised selection/audio shortcuts were incomplete. | Explicit acceptance and functional selection, music and mute controls. |
| Medium | README claimed an eighth playable custom fighter, stage interruptions and fully verified parity without corresponding implementation/evidence. | Documentation now distinguishes supplied features, example configuration and remaining work. |

## 2. Issues fixed and affected files

- `src/core/GameEngine.ts`: cancellable match flow, model readiness, round scoring, timer/KO flow, pause, online authority, super completion synchronization, mirror results, camera framing and frame-rate-independent camera smoothing.
- `src/combat/Fighter.ts`, `collision.ts`, `physics.ts`, `peace.ts`: state/physics/guard/throw/trade repairs, complete snapshots, bounded health/meter, move overrides and defensive boss victory.
- `src/animation/ModelRig.ts`, `poses.ts`, `src/cinematics/SuperDirector.ts`: rig ownership, pose synchronization, deterministic cinematic steps, resource disposal and launch/landing behavior. Decoder concurrency is limited to one worker to reduce loading spikes.
- `src/ai/Bot.ts`, `src/input/InputManager.ts`: fair reaction gates, queued actions, keyboard focus/default handling, pointer capture/cancellation and listener disposal.
- `src/multiplayer/NetworkClient.ts`, `server/roomServer.js`: connection coalescing/timeouts, secure-scheme/configurable endpoint selection, complete snapshots and room/protocol lifecycle.
- `src/ui/UIManager.ts`, `src/style.css`, `index.html`, `src/satire/newsdesk.ts`: menus/HUD/pause/touch/notice repairs, dynamic registry tiles and initial newsdesk content. Removed the original-domain redirect from the local entry point.
- `src/types/index.ts`, roster configurations: typed hit results and character extension fields. The unregistered custom example explicitly identifies reused model/cinematic assets.
- `tests/`, npm scripts and README: repeatable assertion-based verification and accurate operating instructions. Production output is regenerated in `dist/`.

## 3. Animation repairs

The existing rig and pose system was preserved. There are no sprite sheets or missing sprite-frame coordinates to repair. Startup/active/recovery timing comes from the same move data used by hit detection. Attack pose interpolation is sampled directly at the simulation frame rather than filtered a second time. Repeated attacks and hits restart their clocks, while holding idle/walk no longer restarts state time. Walk phase derives from accumulated travel.

Supers wait for their banner/setup before advancing a fixed 60 Hz timeline. The director owns choreography poses, applies gravity/landing to launched defenders, restores visible rigs and disposes temporary props. Cancellation cannot call match-completion logic or resurrect old props. KO movement continues after combat actions stop. Failed character loading returns to selection with an error; an unanimated stand-in is not presented as a working fighter.

## 4. Gameplay improvements

Core simulation remains fixed at 60 Hz. Tests compare identical jump/movement inputs under 30, 60 and 120 render-step schedules. Movement limits and pushboxes retain separation at both walls. Guard height, vertical overlap, one-hit-per-attack, grounded grabs, throw tech, terminal KO, combo cancellation/scaling, recovery and super energy are covered by assertions. Simultaneous active strikes can trade.

CPU plans emit attack edges once, respect difficulty reaction thresholds, execute queued airborne attacks and use down input for sweeps. The three profiles retain different aggression, defense, throw-tech and super probabilities.

Mbapu now has a configured defensive alternative: 12 accumulated seconds of grounded back-guard within 2.5 arena units earns a peaceful match victory; attack inputs reset the charge. This is an independently chosen local rule, not a claim of exact reference timing.

Online combat is genuinely synchronized through two clients and a live relay server. The host simulates both fighters; the guest renders full authoritative snapshots. Pause, super completion, round transitions, results, rematches and disconnects have explicit paths. CPU substitution is not used for a disconnected peer.

## 5. Performance improvements

The crowd's 180 bodies plus 180 heads are rendered with two instanced meshes rather than 360 individual meshes. This reduces those crowd draw submissions by 358 while retaining positions and per-body colors. Camera flashes use small additive sprites instead of changing the number of scene point lights, avoiding repeated light-count shader variants.

Health trails have at most one pending update, health writes occur on value changes, and combo animation/layout restarts occur only when the count changes. GLB promises are cached, late model completions respect disposal, stage scenery is retained for unchanged stages and disposed on replacement, and transient skeleton/material/shadow resources are released. Audio requests are deduplicated and stale music loads cannot replace a newer selection.

Development street-scene counters were 67 draw calls, 118 geometries and 88 textures; after three rematches, geometry/texture counts remained 118/88. The production street scene measured 72 draw calls, with the exact resource counters saved alongside it. Draw counts vary with camera flashes and visibility. See `test-results/browser-report.json` and `browser-report-production.json` for the saved measurements. These counters are evidence of the tested scene, not an FPS guarantee. Hardware/mobile thermal performance has not been benchmarked. The production build still emits Vite's large-chunk warning.

## 6. Validation results

- `npm run build`: TypeScript and Vite production build pass. Large bundle warning remains visible.
- `npm test`: 34 tests pass, including live room-server protocol checks and all 14 move timing/pose cases. No tests are disabled.
- `npm audit --json`: zero reported vulnerabilities in the installed dependency tree at audit time.
- `git diff --check`: passes.
- `HEADFUL=1 npm run test:browser`: passes against development Vite.
- `HEADFUL=1 npm run test:preview`: passes against the built production `dist/`. Both final browser reports have zero uncaught application exceptions and zero missing-asset responses. See the saved JSON reports and screenshots for evidence. Coverage includes actual keyboard attacks, all seven model loads/super completions, pause, KO/result/rematch/timeout, peaceful boss victory, CPU approach, cancellation during intro/super, two-client rooms/health/pause/super/result synchronization, mirror winner identity, disconnect and mobile controls. Some scenarios deliberately place fighters or advance cinematic steps to make checks repeatable; they are not full human-play balance tests.

Early harness runs exposed missing host-tab focus emulation and intermittent headless Chrome display/compositor stalls (`CVDisplayLinkCreateWithCGDisplay`/GPU readback diagnostics and CDP timeouts). The headless mode remains unreliable on this host. Both complete final suites passed using visible Chrome; no tests or application assertions were removed to obtain those passes. Browser artifacts record their outcomes. Audio was kept muted during automation; audible mix/timing was not manually verified.

## 7. Remaining issues and unverified behavior

- Public internet deployment needs an actual reachable WebSocket service and TLS for HTTPS. No hosted backend, credentials, authentication, matchmaking, persistence, dedicated authoritative simulation or rollback netcode is supplied. Host trust and guest input latency remain limitations; adverse WAN conditions and background-tab behavior are not certified.
- The Cow Crossing/Sabziwala interruptions and boss unlock/progression/statistics advertised by the previous README were absent. They are not claimed as implemented. The custom chai configuration remains an example with explicitly reused art/choreography, not an additional distinct character.
- Hit detection uses configured ranges and vertical hurt intervals, not mesh/bone collision. New body proportions and moves still need visual tuning. Automated pose finiteness does not establish perfect foot contact for every frame of every character.
- Mobile evidence is Chrome landscape emulation. Real iOS Safari, physical multitouch/thermal behavior, long sessions and low-end hardware still need device testing. Audible output and long-duration memory/FPS profiling remain unverified.
- The public reference at [fightkaro.com](https://fightkaro.com/) was accessible for its observable menu/roster/stage/difficulty/control/result interface. Those structures were compared. Exact reference movement speed, damage, camera framing, super timings and animation parity were not measured interactively and remain unverified. No proprietary source was copied during this repair.
- Asset licensing/provenance is not established by the repository's prior attribution text and needs confirmation before distribution.

## 8. Expansion readiness

New character definitions can select compatible model assets, health, movement/damage stats, throw damage, custom normal-move data, chain destinations, attack key poses and an existing super choreography. Registered entries receive selection tiles automatically. Custom move snapshots are supported. This is materially safer than hardcoding every new fighter in the engine.

Distinct super mechanics still require an authored `SuperDirector` timeline, and noncompatible skeletons need a rig adapter. This is an extensible playable foundation with remaining production work; it is not a certification of complete reference parity or production readiness across all devices and networks.

## Kenny and animation follow-up

Kenny is now registered as the eighth fighter, with a generated reference-based portrait, a custom face albedo, fitted spectacles, pink shirt/black waistcoat, dialogue bubbles and the attendance-register ultimate. The initial primitive model was rejected and replaced: the final version customizes the existing detailed Rahul humanoid mesh and skin weights, rather than presenting a primitive mannequin or a new scanned likeness. The source asset remains unchanged; Kenny owns his customized geometries/materials and disposes his face texture. Mirror palettes now target clothing rather than recoloring faces.

Bapu's duplicate ultimate voice came from a shared entry cue plus a second identical cue in his setup. Removed the second cue; Nitin had the same duplication and is corrected too. Cinematic entry is idempotent. Bapu's delayed dialogue now follows simulation time, so pausing no longer triggers it on a wall-clock timer.

Fixed cinematic root-height changes without corresponding leg IK, which caused floating/overbent standing poses. Explicit attack leg poses are preserved. Launched defenders retain their floor pose when transitioning to getup rather than briefly snapping upright. Hand attachments update against the current simulation step. New lines replace the previous bubble for the same fighter, preventing overlapping dialogue during rapid cinematic transitions.

Validation: `npm run build`, all **37** regression tests, the eight-fighter development smoke suite and the final eight-fighter production preview suite pass. Tests explicitly assert one Bapu/Nitin voice cue, equivalent super outcomes at 30/60/120 FPS, planted-foot height, custom model ownership and Kenny's exact 32-damage ultimate. Production browser checks include keyboard, all eight models/supers, rematches, two-client multiplayer, mobile touch and screenshots. The final model preview is `test-results/kenny-model-closeup.png`; the attendance cinematic is `test-results/kenny-ultimate.png`. Kenny's requested lines are displayed text; no recorded Kenny voice is supplied. Likeness is an artistic adaptation of a shared anatomical mesh, not a face scan. No claim is made that every possible animation defect has been eliminated.

## Pratham follow-up — 5 November 2026

Added Pratham as the ninth playable fighter with a reference-based portrait and face texture, widened facial proportions, fuller beard, thicker rounded black glasses, a cream casual outfit with a folded hood/drawstrings, and custom phone-themed move names. The model adapts the existing weighted humanoid mesh; the likeness is an artistic approximation rather than a face scan. Kenny retains his existing appearance through the shared customization pipeline.

## Ultimate and rendering audit — 5 November 2026

### Issues found and repaired

| Severity | Defect and cause | Repair |
| --- | --- | --- |
| High | Dozer Dada's exported head omitted `metallicFactor`, defaulting to fully metallic skin. Thin double-sided clothing also produced harsh self-shadowing. | `animation/materials.ts` prepares private avatar materials with nonmetallic skin/fabric, suitable roughness and front-face shadow casting. `StageRenderer` adds shadow bias and soft fill; Sansad lighting preserves skin and cloth detail. Cached source assets and skin palettes remain intact. |
| High | Yatra Boy's projectile continually recomputed its release position and targeted z=0 while the actual hopper sits at z=-0.6. Panel gears rotated around the wrong axis. | Potato pickup, held windup and fixed-origin throw are separate phases. The throw targets the hopper rim's actual world position and shrinks into the opening. Gears spin in the panel plane. Processing light/rumble stop after output, and sink interpolation is clamped. |
| High | Toll Man launched the defender from below the floor, immediately cancelling airborne physics. | Launch starts above the floor. The descent into the pothole is continuous. Fuel reaches the hole, the match follows an arc, and the transparent fireball fades and becomes invisible. |
| Medium | Mitra Chakra jumped from the raised hand to an unrelated lower coordinate when thrown. | Capture the actual release position; the disc follows the current hand during charging and starts its throw continuously. |
| Medium | Dozer Dada repeated warning dialogue every frame; bucket impacts did not align with the opponent or visible lifts. | One-shot dialogue; aligned bucket center; three lift/drop cycles; eye beams follow actual head positions. |
| Medium | Tariff Taau's stamp teleported directly to the floor. | Visible descent precedes the single damage/impact event. |
| Medium | Mbapu dropped abruptly at the end and dealt an undocumented 35 damage. Wheel spokes formed a tangled pattern. | Smooth landing, radial spokes, 30 normal damage / 40 configured CPU-boss damage, matching the refreshed menu information. Entry voice remains single-shot. |
| Medium | Close-range/corner starts overlapped cinematic props; transforms could lag choreography; some actors stayed in their final pose. | Shared banner-time staging reserves room inside arena bounds. Commit transforms after choreography/physics, blend the attacker back to idle, and wait for an airborne defender to land before completion. Restore getup/KO poses and visibility. |
| Medium | Camera motion detached speech, long lines overlapped/cropped, and health bars waited until cinematic completion. | Update speech after camera matrices, wrap/clamp bubbles and separate overlapping speakers. Frame impact health is reflected during the cinematic. Camera framing includes elevated effects. |

All changes preserve the nine-fighter roster, including Kenny and Pratham. Deedee, Kenny and Pratham receive the shared staging, camera, dialogue and transition fixes; their existing authored abilities remain intact. Props release shared geometry, materials and textures once, and dispose lights during cleanup.

### Verification

- `npm run build`: TypeScript and production build pass. Vite still warns about the roughly 774 kB main JavaScript chunk; no warning was suppressed.
- `npm test`: **46 tests pass**. New coverage includes **162** complete super timelines (nine fighters × three render rates × two facing directions × three arena positions), exact single-hit damage and voice entry, valid transforms/poses, visibility, getup/KO, cancellation, hopper depth, gear axis, disc-release continuity, Toll Man's launch and Mbapu's landing/boss damage.
- `HEADFUL=1 npm run test:preview`: full production browser suite passes: all nine loaded models/supers, 42 rendered phase checkpoints, nine mirrored corner sequences, real-time Yatra Boy completion/recovery, keyboard, pause, results, rematch, CPU, repeated-match resource stability, two-client rooms, authoritative online supers/results, disconnect and mobile touch. No uncaught application errors or missing assets.
- Final targeted production rendering is repeated after the disc-release/dialogue refinements, using `HEADFUL=1 npm run test:preview -- --supers-only`; phase screenshots and its separate JSON report are saved under `test-results/`.
- Measured gameplay sample: **69 draw calls, 128 geometries, 88 textures**; geometry/texture counts remain **128/88 after three rematches**. This establishes resource stability in this run, not an FPS guarantee across devices.

Evidence: `test-results/browser-report-production.json`, `test-results/browser-report-super-phases.json`, `yogi-model-closeup.png`, `super-rahul-4.05.png`, and the `super-<fighter>-<phase>.png` / `super-<fighter>-mirrored-corner.png` captures.

### Refreshed reference and remaining scope

See [REFERENCE_REFRESH.md](REFERENCE_REFRESH.md) for the dated public roster, super descriptions and input chains. Sutti Babu, Rail Raja, Budget and the seasonal portal are observed reference additions, not implemented local features. Exact reference frame timing, movement constants, hidden Budget behavior, rollback networking and performance across all devices remain unverified. No proprietary reference source was copied. These checks cover the repaired paths; they do not certify that every possible game defect has been eliminated.

Ultimate Hurting displays an incoming call, ignores it, then marks the contact blocked and breaks the opponent's heart for exactly 32 damage. All four supplied lines appear once in the cinematic, with additional configured intro/hit/hurt/victory dialogue. Call blocking is fictional in-game behavior. No Pratham voice recording or imitation is supplied.

New regression cases cover registered roster availability, exact dialogue text, owned model geometry and skin weights, hoodie/glasses details, all attack poses, and equivalent one-hit ultimate outcomes at 30/60/120 FPS. The current unit suite has 40 tests. See the saved production browser report for the latest all-nine-fighter gameplay results and screenshots. Assets and exact built-in image-generation prompts are in PRATHAM.md.
