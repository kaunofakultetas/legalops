# legalops-vite — the GUI

The compliance assistant's user interface, served as static files behind
the Caddy ingress. Django has no pages of its own. One Vite project with
one entry (`index.html` → `src/main.jsx`) holds two applications, each
with a router of its own (`src/paths.js`). The entry starts one of them by
the address, and only that one is downloaded:

- **The public site** at the root of the origin (`src/site/`): what the
  product is, for a visitor without an account. Plain React and Tailwind —
  no MUI, no session, no request to the backend.
- **The console** under `/console` (`src/console.jsx`): the application
  itself, behind the sign-in. React 19, MUI 7 + Tailwind 4, assistant-ui,
  TanStack Query.

A link from one to the other is a plain `href` that loads the other
application; they share the stylesheet, the fonts, the translations and the
brand's colours (`src/brand.js`). An address the console had before it
moved under `/console` (a bookmarked `/reports/…`, `/login?next=…`) is
handed on by the public site (`src/site/pages/Missing.jsx`).

In the console every data call goes through `/api/*` with the bearer token
attached (`src/api/client.js`); the chat itself streams from
`/api/assistant/chat` (the node assistant container). Both applications are
in Lithuanian and English (Lithuanian by default), and share the cookie that
remembers the choice.

## The public site

| Route | Page |
|---|---|
| `/` | Home: the claim beside the mark as a 3D object, one finding with its marked evidence up close, what the assistant does, the report, the conversation, the sources, what it does not do |
| `/product` | The way from a conversation to an approved report, step by step |
| `/method` | The six steps of an analysis, what a report does with an act, the five statuses, what stays with a person |
| `/sources` | How the texts are kept and which acts are in the corpus (`src/site/acts.js` follows `corpus/catalog.yaml`) |
| `/documentation` | What the system's documentation covers and how it is arranged, with the book itself as a PDF in the visitor's language (`/docs/<language>/documentation.pdf`, served by `legalops-docs`) |
| `/about` | Who made it, who it is for, access, what happens to the data |

The route table is `src/site/router.jsx`. The product is shown, not
screenshotted: `src/site/specimens.jsx` redraws pieces of the console's
screens as plain HTML with made-up content, labelled by the console's own
messages (statuses, timeframes, a report's tabs). What the pages say about
the analysis and the data follows `docs/markdown/lt/user-guide.md` (§4 and §8) — change
them together. `public/robots.txt` still keeps crawlers out of the whole
origin; open the root there when the site should be found.

## The console's pages

All under `/console` (the router's base — the paths in the code and in the
table are written without it).

| Route | Page | Who |
|---|---|---|
| `/`, `/chat/:threadId` | The chat: conversation list, thread, company panel | everyone |
| `/dashboard` | The overview (Apžvalga) | everyone |
| `/companies`, `/companies/:companyId` | Companies; one company's profile, credentials, documents, roles, reports, programme (its work products and their generation), chats | everyone |
| `/reports`, `/reports/:reportId` | Reports; one report with its progress, tabs, review, approval, exports | everyone |
| `/programme/:productId` | One work product of a company's compliance programme — the compliance policy, the structure with the process and RACI, the risk register: its rules, its content by tabs, editing, approval, exports | everyone |
| `/corpus`, `/corpus/:documentId` | The legal corpus (catalogue, search, citation checker); one act | everyone (admins also write) |
| `/usage`, `/jobs`, `/account` | AI usage and budget, the job queue, the account | everyone |
| `/obligations` | The obligation review queue | admins |
| `/prompts`, `/prompts/:slug` | The prompt store and editor | admins |
| `/settings/mcp` | MCP servers | admins |
| `/users`, `/audit` | Users, the audit trail | admins |
| `/login` | Sign-in | anonymous |

The route table is `src/router.jsx`; admin-only pages are guarded there
and hidden from the sidebar. A signed-out visitor, an expired session and a
logout end at `/console/login`, which returns to `?next=` after signing in
(`src/auth/session.js`). The user guide (`docs/markdown/lt/user-guide.md`)
describes each page as the user sees it.

## Layout

```
vite/
├── Dockerfile        # prod: node build → caddy static serve
├── Dockerfile.dev    # dev: vite dev server with live reload
├── Caddyfile         # in-image server: every route → index.html, cache rules
├── runTests.sh       # the vitest suite in the production builder image
└── app/              # the Vite project
    ├── index.html                  the one page
    ├── vite.config.js              the build, the dev server, the test setup
    ├── scripts/check-messages.js   the translation guard (run by lint and build)
    ├── tests/                      the vitest suite (tests/README.md)
    └── src/
        ├── paths.js          the console's base and its sign-in address
        ├── brand.js          the colours, fonts and verdict tints (no MUI)
        ├── main.jsx          the entry: starts the console under /console,
        │                     the public site everywhere else
        ├── site/             the public site: main.jsx (its start), router.jsx,
        │                     SiteLayout / SiteHeader / SiteFooter, parts.jsx
        │                     (its building blocks), specimens.jsx (the
        │                     product, drawn), sculpture.js / sculptureScene.js /
        │                     Sculpture.jsx (the hero's 3D object), useSeen.js
        │                     (what has come into view), acts.js, pages/
        ├── console.jsx       the console's start: query client + router
        ├── App.jsx           layout route: providers, auth guard
        ├── router.jsx        the console's route table (lazy pages)
        ├── providers.jsx     i18n + MUI theme
        ├── theme.js          the console's look: palette, type, component styles
        ├── globals.css       Tailwind + the theme bridge, the marker
        ├── i18n.jsx          lt/en translations
        ├── messages/         {lt,en}.json pairs per page, component and enum set
        ├── api/client.js     the axios instance (bearer, 401 redirect)
        ├── auth/             the bearer token store, the session helpers
        ├── constants/        enums; uploads.js — the upload limits and file types
        ├── components/       shared UI pieces
        ├── hooks/, utils/    shared logic (errors, formats, file checks)
        └── pages/            one folder per page; pages/Chat is the main
                              screen (assistant-ui runtime, thread list,
                              thread, composer with file drop, tool cards)
```

`src/constants/uploads.js` copies Django's per-file limits (50 MiB for
documents and chat attachments, 60 MiB for a legal act) and the file types
each upload takes, so a file is refused before it is sent: change it
together with Django (docs/markdown/en/operations.md §8).

## Look

One light theme, defined in `src/theme.js` (palette, type scale, component
styles) from the brand's table in `src/brand.js`. `src/globals.css` maps the
same values onto Tailwind utilities. The public site wears the same look
without MUI: its start writes the palette's CSS variables itself
(`src/site/main.jsx`).

- **The brand.** The mark is a mosaic of four tiles: an ink quarter disc,
  two squares in a middle blue, and a yellow quarter disc
  (`components/layout/Wordmark.jsx`; `public/favicon.svg` puts it on an ink
  tile). On ink the mark is reversed to white, pale blue and yellow. The
  app wears the mark's colours:
  - ink `#173A6E`: the top bar, buttons, links and the keyboard focus ring;
  - middle blue `#3E6FB0`: the tint of the current place (the page in the
    navigation, the open conversation, the chosen provision), progress
    bars, the first chart series and the light end of the login gradient;
  - yellow `#FFD84A`: the marker (below), the current page's stripe in the
    navigation, the focus ring on the ink bar and the page-loading bar.
- **Colours.** White sheets with hairline borders on a grey-blue canvas, and
  ink-black text. Only floating layers cast a shadow: menus, dialogs,
  drawers and toasts. Status colours are reserved for verdicts and states,
  and always come with a label. Charts draw in the brand blue and a gold
  stepped down from the yellow, which is too light to draw with on white
  (`components/charts/chartTokens.js`).
- **Type.** Source Sans 3 for the interface and the assistant's answers.
  Source Serif 4 for page titles and for anything quoted from a source:
  provision texts, obligations, references to the law, and passages from
  company documents. Both are self-hosted through the `@fontsource-variable`
  packages, imported in `main.jsx`. Everything is in sentence case, with no
  capitals on buttons, tabs or labels.
- **The marker.** The brand yellow (the `marked` utility) highlights the
  passage that proves a finding: evidence quotes, and the cited passage in
  the document drawer. It is also the text selection colour. In the chrome
  it only marks "here". It never fills a control or carries text.
- **Shape.** Corners are 3 px on tags, 4 px on controls, 6 px on sheets
  and 8 px on dialogs.
- **Motion.** Inside the app, motion only answers the pointer: a button
  moves down a pixel when pressed, a linked tile lifts on hover, and the
  unpinned sidebar (a rail of icons, like tracer's) opens over the page
  under the pointer or the keyboard focus. The one ambient motion is the
  login page's backdrop: white dots and lines drifting over a gradient
  from the dark ink to the brand blue
  (`pages/Login/Particles.jsx`, tsparticles, jauka's scene and settings).
  Only the login page loads it, in a chunk of its own. Reduced motion
  stops transitions, the chat's thinking dots, and that backdrop.

- **The public site.** The console's ink bar on top, bands on paper, on the
  desk's grey-blue and on ink, titles in the serif. The home page opens on
  the brand's mark as one polished object in three dimensions
  (`src/site/sculpture.js` is the four pieces and their geometry,
  `sculptureScene.js` draws them in plain WebGL — no 3D library — and
  `Sculpture.jsx` sets the stage): glazed pieces with rounded edges come
  together as the page opens, the object turns slowly and leans after the
  pointer, and now and then the yellow piece glides out of its place, leaving
  a line of light — the missing piece. Behind it tiles of the mosaic drift
  out of focus (plain CSS), and as the page scrolls the pieces drift apart.
  The scene loads in a chunk of its own after the page is drawn, draws one
  still frame under reduced motion, and gives way to a flat picture of the
  mark where there is no WebGL.
- **Every page moves as it is read.** The hero's words arrive as a page
  opens (`hero-rise`); every band below holds its parts back until it comes
  into view and then lets them arrive in a way of its own — on the first
  page the finding's sheet rises and the mark's tiles come out from behind it
  before the marker is drawn, the report tilts up from the page, the acts'
  names cascade. `Band`'s `reveal`, `Part` and (for one group of a long band)
  `Reveal` in `src/site/parts.jsx` mark what moves; the movements are the
  `.reveal` rules of `globals.css`. Under reduced motion nothing is held
  back.
- **Every page is signed with the object.** The head of each other page
  shows the same four pieces on a small stage, set out to its subject
  (`ARRANGEMENTS` in `sculpture.js`): a rising line of steps on the product
  page, layers one behind another on the method page, volumes on a shelf on
  the sources page, the mark whole on "about".
- **The specimens play.** In a band that reveals, the conversation is spoken
  — the question, the assistant's three dots for a moment, the answer — the
  analysis on the product page runs through its stages with its cost
  climbing and starts over, and the lists of acts arrive group by group.

## Development

The `# Dev` toggles on the `legalops-vite` service in docker-compose.yml
select Dockerfile.dev + the `./vite/app:/app` bind mount + the external
network for npm. Lint inside the container: `npm run lint` (eslint and the
translation guard, which fails on a key missing in one language, differing
placeholders or an untranslated string).

Verify inside a node container (no node on the host), from `vite/`:

```
docker run --rm -v "$PWD/app:/app" -w /app node:24.16.0 \
    sh -c "npm install && npm run lint && npm run build"
```

## Tests

`./runTests.sh` builds the builder stage of the production Dockerfile (the
same `npm ci` and `npm run build`, translation guard included) and runs the
vitest suite inside it, in a container named per run. The layout,
conventions and a quicker bind-mount command are in
[app/tests/README.md](app/tests/README.md).
