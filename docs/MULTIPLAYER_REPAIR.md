# Multiplayer responsiveness repair

The guest previously waited for host snapshots before displaying movement and attacks, then snapped to each 30 Hz update. This exposed the entire network round trip as input delay.

The guest now predicts its own fighter immediately. Host snapshots acknowledge consumed input sequences; reconciliation restores authoritative state and replays newer commands. Position corrections are smoothed, replay is bounded to 120 commands, and predicted movement respects the opponent pushbox. Combo buffer/timer fields are included in snapshots. Supers clear speculative actions and keep authoritative cinematic events. Collision damage, meter rewards and match results remain host controlled.

Only the guest sends input commands. Snapshots skip transmission when the socket already has over 64 KiB queued, avoiding obsolete position backlogs. The room server forwards acknowledgements with existing snapshot messages; its current running version supports this change without a restart.

Validation: production build passes; **50 tests pass**, including simulated 150–450 ms round trips with jitter, immediate response, acknowledgement/replay, release convergence, damage ownership, buffers and pushboxes. The real two-browser room regression passes with **160 ms injected round-trip delay**, plus pause, health synchronization, online supers, mirror results, rematch, disconnect and mobile controls. No application errors or missing assets were recorded. The initial development browser run was interrupted by a source hot reload; the completed rerun used the final application code. Report: `test-results/browser-report-network.json`.

This is prediction/reconciliation, not full rollback networking. Real ZeroTier peer latency was observed at approximately 88 ms and 437 ms during diagnosis; the latter can still delay confirmed impacts. Cross-device play over the user's actual route has not been measured by this test.

Both players should refresh the page and create/join a fresh room so both run the new client. The game remains at http://10.22.252.77:3000 and multiplayer at port 8080.
