# Manual inspiration search and dated hotspots

Inspiration has two manual entry points: topic search and date-limited hotspot search. Public-web research produces a summary, reference material and original links. The separate AIHOT page remains a read-only feed and is not the provider for arbitrary date ranges.

The Host resolves relative periods when it accepts a new run. Custom dates include both selected days in Asia/Shanghai, represented by an exclusive end at the next midnight. The resolved interval belongs to the run, so queue latency and later searches cannot change the historical period. Legacy records omit the interval; their report files and hashes remain unchanged.

Removing task controls is insufficient to retire automatic research: the scheduler and recovered queue can initiate requests without an open page. Startup pauses enabled legacy tasks, clears authorization and next-run fields, preserves archived state, and cancels queued task runs before attaching the runtime. Legacy task mutation methods reject requests, while task reports remain readable and can seed a new manual item.

Report validation checks declared source dates against the run interval and rejects missing, invalid or out-of-range hotspot evidence. It does not independently verify the source page or establish a global popularity ranking. Empty partial reports contain no invented reference material. Copying and content handoff re-read the report through its integrity-checked reference service.

Focused service and DOM tests cover date resolution, legacy task retirement, history, submission validation, manual controls and report actions. Real provider and rendered-host acceptance are distinct from these tests.
