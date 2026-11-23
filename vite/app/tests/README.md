# Frontend regression tests

The vitest suite of the compliance assistant's GUI. Every page, component, hook and utility under `src/` runs here against an in-process **backend double**, with no browser, no Django and no network.

- **Environment.** vitest in jsdom with Testing Library. `tests/support/setup.js` adds the browser APIs jsdom lacks, a location double, and a console guard.
- **Backend double.** msw intercepts every XMLHttpRequest and fetch the app sends. That covers the shared axios client with its interceptors and the chat's fetch stream. `tests/support/backend/handlers.js` answers every endpoint the app calls with the happy-path bodies from `fixtures.js`, shaped like the Django serializers. A test declares any deviation with the `given.*` one-liners from `server.js`.
- **Strictness.**
  - A request that no handler answers **fails the test**. The double must never fall behind the app, and `tests/core/structural.test.js` also checks that statically.
  - So does a React defect report on `console.error`: a missing key, an update while rendering, an unknown DOM prop, invalid nesting, an input switching between controlled and uncontrolled.
  - So does a render crash. React reports every error an error boundary caught (the router's `RouteError`, `renderPage`'s `TestErrorBoundary`), so a crashed page fails its test even when the test asserts only what is absent.
  - A test that provokes one of these on purpose says so first, with `allowUnhandledRequests()` or `allowConsoleErrors(/…/)` from `support/setup.js`.

## Running

From `vite/`:

```bash
./runTests.sh                                   # the whole suite, in the production builder image
./runTests.sh tests/pages/users.test.jsx        # some files
./runTests.sh -t 'route sweep'                  # any vitest argument
```

`runTests.sh` builds the builder stage of the production `Dockerfile`. That is the same `npm ci` and the same `npm run build`, including the translation guard. It then runs vitest inside that image with no network, so what is tested is what ships and nothing can leave the container. The test container is named per run (`legalops-vite-tests-<pid>`), so two runs may overlap.

For quick iteration, run against the working tree instead, with no image build (it uses the `node_modules` the dev container installed in `app/`; on a fresh checkout run `npm ci` in the same container first, with the network):

```bash
sudo docker run --rm --network none -v "$PWD/app:/app" -w /app node:24.16.0 npx vitest run tests/pages/users.test.jsx
```

The host has no node, so always run inside a container. Do not run the suite inside the running `legalops-vite` dev container. It serves the live site, the compose file caps it at 2 GB, and a full run peaks at about 3.5 GB. `npm run lint` in the same throwaway container lints the suite along with the app (`eslint.config.js` has a block for `tests/`).

## Layout

| Path | Covers |
|---|---|
| `support/setup.js` | Polyfills, the msw lifecycle, the per-test slate, and the unhandled-request and console guards. |
| `support/render.jsx` | `renderPage(ui, {route, path, locale})` renders the element in the production frame: the query client, a memory data router, `Providers` and the `NavigationMemory` history tracker. `renderRoutes(routes, {route})` puts several pages on one router in that frame (a list and its detail: the way back). `renderApp({route})` renders the real `router.jsx` table through `App.jsx`, `AuthProvider` and `PageWrapper`. |
| `support/auth.js` | The admin (`authData`, the default) and plain-user (`userAuthData`) sessions, plus `signIn()` for the bearer token. |
| `support/location.js` | The `window.location` double. It records `navigations` and `reloads`. |
| `support/chat.js` | The chat's test kit: `renderChat`, AI SDK UI-message SSE builders, a stream the test writes chunk by chunk (`openChatStream`), history row builders, upload helpers. |
| `support/backend/fixtures.js` | One realistic body per endpoint, forming a coherent fictional world. |
| `support/backend/programme.js` | The work products of a compliance programme: three real products cut down (`programme/*.json`) and bound to the fixture world, and `normalise`, which answers an edited draft the way the backend stores it — shaped, scored and checked against the rules of its kind. |
| `support/backend/handlers.js` | The default handler for every endpoint. |
| `support/backend/server.js` | The msw server, `url()`, `apiError()` and the `given.*` overrides. |
| `support/backend/contract.js` | `describeEndpointContract()`, the matrix of broken, wrong, late and missing answers a page must survive. |
| `core/` | The harness smoke test (`smoke`: the double answers, the page's own error, the real route table, the guards), the api client, session and token, i18n, error mapping, formatters, hooks, the app shell, the auth guard, routing, the structural rules, and coming back to a page: the scroll memory of `<main>` and the kept scrollers, the way back, the view state kept in the address and in the tab's session (`scroll-memory`, `view-state`). jsdom has no layout: those tests stub `scrollHeight` / `clientHeight` and drive `scrollTop` themselves. |
| `components/` | One file per shared component. |
| `pages/` | One file (or more) per page folder under `src/pages`. It covers behaviour, both roles, both languages, and the contract matrix for every endpoint the page reads. |
| `site/` | The public site (`src/site`): its route table on a memory router inside the translations provider only — every page with its one h1 and title in both languages, the bar, the specimens, and the console's old addresses handed on under `/console`. |
| `contract/route-sweep.test.jsx` | Every route of the real route table under the default session, as a plain user, in Lithuanian, with every GET failing, with a 401, and with every GET answering the wrong shape. |

## Conventions

- **Tests speak English.** The default locale cookie in tests is `en`, while the app's own default is Lithuanian. Every page also has at least one Lithuanian test.
- **Query by role, label and text,** as the user reads them. A `data-testid` is the last resort.
- **Vary fixtures without editing them.** Build the variation with `{ ...f.company, name: '…' }` and answer it with `given.json(…)`. The fixtures are shared by every test.
- **Assert what the user would see.** For a mutation, capture the request body with `given.capture(…)`, then assert the toast, dialog or list that follows.
- **Known defects.** Fix a defect where it lives and keep the test as a regression guard. A defect that cannot be fixed yet is pinned with `it.fails('… [FE-AREA-n]')`, or with `pins` in a contract matrix, so the suite stays green while the bug stays on record.
- **House style.** Every file opens with the `// ---` banner. Sections are separated by banners, with 7 blank lines between top-level sections, like the rest of the app.

## Practical notes

What the suite learned the hard way:

- **Fake timers.** `vi.useFakeTimers()` with no options fakes every timer API, `requestAnimationFrame` and `performance` included. Pass an explicit `toFake` list, usually the timeouts, the intervals and `Date`. A test that fakes `setTimeout` and still waits for the page needs `shouldAdvanceTime: true`: React Query delivers every update through `setTimeout(…, 0)`.
- **Menus and dialogs.** An open MUI menu or dialog hides the rest of the page from role queries (`aria-hidden`). Read what is behind it with `{ hidden: true }` (see `components/navbar.test.jsx`).
- **No layout.** jsdom measures nothing. The scroll tests stub `scrollHeight` and `clientHeight` and set `scrollTop` themselves.
- **Uploads and the chat stream.** `support/setup.js` puts Node's `FormData`, `File` and `Blob` in place of jsdom's, so uploads reach the double as real multipart bodies. It also resolves the chat's relative `fetch` URL on the test origin.
- **stderr noise.** Emotion's warning that `:first-child` is "potentially unsafe when doing server-side rendering" comes from the MUI X DataGrid's own styles, not from the app. It is harmless here because nothing renders on a server.
