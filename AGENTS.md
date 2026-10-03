# Server Engine development rules

## Live state communication

All live UI state must communicate through the shared authenticated WebSocket
event channel at `/api/v1/jobs/ws`.

- Use HTTP requests for initial page data and explicit user mutations only.
- After a mutation is queued or completed, publish and consume WebSocket events;
  do not add background polling, repeated `setInterval` refreshes, or reload the
  page to discover status changes.
- Service actions must emit `service-status` events containing `serviceId`,
  `action`, `status`, `running`, and `message` where applicable.
- Job progress and completion must be consumed from the jobs WebSocket. Pages
  should update their local state from those events immediately.
- Prefer the existing shared socket/event bridge owned by `Topbar.jsx` and
  listen for its `serverengine:service-status` and `serverengine:jobs-updated`
  browser events. Do not create duplicate WebSocket connections for ordinary
  pages unless the feature needs a separate stream.
- A page may offer an explicit Refresh/Check again button, but it must not use
  that request as an automatic live-update mechanism.
- When adding a new service or resource action, test the complete path:
  mutation → job event → service/resource event → UI state update, without a
  manual reload.

## State correctness

Event handlers must use IDs from the same source as the page’s catalog and must
not reference undefined duplicate constants. Treat queued/running and terminal
job states separately, and keep the UI disabled/loading state synchronized with
the event stream.
