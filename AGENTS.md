# Server Engine development rules

## Frontend formatting

All JavaScript-related source files must use readable, consistently formatted
code. This includes `.js`, `.jsx`, `.ts`, `.tsx`, `.css`, `.scss`, and related
frontend files.

- Use normal multiline formatting for components, functions, objects, arrays,
  conditionals, and JSX.
- Do not write entire React components, render trees, handlers, or CSS rules on
  one line to save space.
- Keep nested JSX indented so its structure is immediately understandable.
- Use one logical statement or CSS declaration per line.
- Preserve readable spacing between related sections and avoid dense chained
  expressions when a named variable or helper improves clarity.
- Run the project formatter or frontend build checks before handing off a UI
  change.

## Server response feedback

- Success or error responses from API requests, jobs, service actions, saves,
  deletes, uploads, and other server operations must use the shared Toast
  component.
- Do not show server-operation success or error messages as inline page text,
  banners, or modal body lines.
- Inline messages are reserved for form and field validation, such as an
  invalid domain, missing required value, or malformed IP address.
- Keep the response message concise and use the correct success or error Toast
  variant.

## Shared UI components

- Prefer the shared components in `web/src/components/ui` whenever they fit the
  requirement, especially for forms, labels, inputs, buttons, dialogs, and
  common feedback patterns.
- Check the shared UI directory before creating a new primitive or duplicating
  an existing control style.
- If a shared component is missing a required capability, extend it or add the
  capability there before creating a one-off implementation in a feature page.
- New shared components must be reusable, consistently formatted, accessible,
  and documented by their props and expected behavior.
- Reuse `web/src/components/SaveButton.jsx` for save actions whenever its
  loading, disabled, and saved-feedback behavior fits. Do not create a
  feature-specific save spinner or save-button implementation.

## Destructive actions

- Every delete, remove, purge, revoke, or other destructive UI action must
  require explicit confirmation before making the API request.
- Use the shared `ActionDialog` component for confirmation dialogs. Do not use
  browser-native `window.confirm()` or custom one-off confirmation markup.
- The destructive API call must run only from the dialog's explicit confirm
  action; cancelling or closing the dialog must leave the resource unchanged.
- Show the result of the destructive operation with the shared Toast component.

## CSS tooltips

- Whenever a task requests a tooltip, use `@floating-ui/react` with portal or
  fixed-position rendering, collision handling (`flip`/`shift`), and a high
  stacking layer. Do not use the fragile pseudo-element tooltip for new work.
- Existing `css-tooltip` elements may remain until they are touched, but new
  tooltip work must use Floating UI.
- Do not use native `title` attributes for interactive or informational UI
  tooltips.
- Keep tooltip content concise, accessible, and positioned without changing
  the layout of the surrounding control or row.

## Dropdowns and menus

- Custom dropdowns and action menus must use the shared Floating UI pattern
  with portal rendering, fixed positioning, `flip`/`shift` collision handling,
  an opaque surface, and a high stacking layer. Do not place new custom menus
  inside cards or overflow containers with absolute positioning.

## Frontend forms and validation

- Use `react-hook-form` for React form state, submission handling, touched and
  dirty state, and field registration.
- Use `zod` schemas for form validation instead of scattered ad-hoc checks in
  event handlers or submit functions.
- Connect schemas through the React Hook Form resolver so validation behavior
  is consistent for submit, field errors, and future server-side validation.
- Display field and form validation errors inline beside the relevant field;
  use Toast only for server-operation success or failure responses.
- Reuse existing schemas, field components, and validation helpers before
  creating feature-specific duplicates.

## Configuration modals

- Configuration modals for services and infrastructure must reuse the visual
  structure and interaction style of the existing service configuration
  modals: consistent header, tabs or sections, spacing, footer actions, close
  behavior, loading states, and dark-mode treatment.
- Keep configuration modals open after a successful save unless the user is
  completing a one-time creation flow. Show server-operation results with the
  shared Toast component.

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

## Release process

- Never create, publish, replace, or upload a release unless the user has
  explicitly requested the release in the current task.
- Before releasing, update `CHANGELOG.md` with the exact release version and
  concise notes for the changes included in that release.
- Run `git diff --check`, backend Python compilation checks, and the frontend
  production build before building the release artifact.
- Build the release with `scripts/build-release.sh` or the repository release
  script so the bundled frontend, backend version, `VERSION` file, and
  `CHANGELOG.md` are synchronized.
- Verify the artifact was created successfully and publish it with the
  repository release script. Confirm the final GitHub release URL and version
  after upload.
- Do not restart Docker, panel services, Nginx, PHP-FPM, or other managed
  services as part of a release unless the user explicitly requests it.
- Do not silently publish unrelated dirty-worktree changes; preserve them and
  mention any release-scope limitations before handoff.
