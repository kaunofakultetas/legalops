# Screenshots of the console and the public site

Made on fake data (the console's test fixtures: every company, person, date, amount and model
name is made up), English interface unless the name ends in `-lt`. Used in chapter 14
(`chapters/14-console.tex`). Routes of the console are given without the `/console` base.

| File | Page and route | What a reader should notice |
|---|---|---|
| `login.png` | Sign-in, `/login` | One sheet on the ink-to-blue backdrop; the wordmark (link to the public site), the language switch, the form |
| `chat-tools-lt.png` | Chat, `/chat/:threadId`, Lithuanian | The navigation as an administrator sees it; the conversation list; a tool pill ("Paieška teisės aktuose · atlikta") and two tool cards (report, action register); the company button in the header; the AI notice and the model button under the composer |
| `company-profile.png` | Company page, profile tab, `/companies/:id` | The nine tabs; "Run compliance analysis"; the tri-state yes / no / unknown flags |
| `document-drawer.png` | Document drawer, opened from the documents tab | The evidence inventory (controls with quotes, roles, registers, laws, weaknesses), the outline, the paged text |
| `analysis-start-dialog.png` | Start dialog, from a company or `/reports` | Report language, optional scope, the two options (own requirements, continue without the scope approval), the upper-bound estimate with the shared corpus part and the budget |
| `report-scope.png` | Report waiting for scope approval, `/reports/:id?tab=acts` | The banner, the price panel with "Approve and continue" / "Cancel the analysis", an "Assess" switch per act with its obligation count |
| `report-overview.png` | Finished report, summary tab | Finished and Approved chips, the approval banner with "Withdraw the approval", the outdated-acts warning, the KPI tiles, "since the previous report", the status bar, open obligations by severity, the citation audit counts |
| `report-finding-card.png` | Findings tab, one card opened | Status, severity and "Unreviewed obligation" chips; "Before" history; obligation, assessment, cause, consequence (a ceiling, not a forecast), evidence with the yellow marker, recommendation, deadline, reviewer's note, "Review" |
| `finding-review-dialog.png` | The review dialog of a finding | AI assessment kept visible; keep it or pick another status; the note; the cause, which only a person writes |
| `report-citations.png` | Citations tab of a report | Verdict toggles with counts; a card per reference: what the document says, what the provision really covers, the check's note, the links |
| `action-register.png` | Company page, actions tab, `?tab=actions` | State filter with counts (late with the warning mark); rows with owner, due date, priority, findings, source report; "Changes in the law" under the register |
| `programme-tab.png` | Company page, programme tab, `?tab=programme` | The three kinds in order, the state of each newest version (draft with broken blocking rules, generating with its step), earlier versions, Open / Generate a new version |
| `product-policy.png` | Work product page, compliance policy, `/programme/:id` | Edit / Approve (off while a blocking rule is broken) / PDF / Word; the Rules panel with a broken blocking rule; the Policy, Documents, Provenance tabs |
| `governance-raci.png` | Work product page, governance, Process and RACI tab (crop) | Steps in rows, roles in columns; each step with exactly one A (or AR) and at least one R |
| `risk-register.png` | Work product page, risks, Register tab (crop) | The 5×5 matrix with its bands; a scenario card with the four-part sentence, the eight dimension scores, "L3 × I3 = 9 · Medium" computed by the system, a provision flagged with a warning |
| `corpus-act.png` | One act, structure tab, `/corpus/:id` | The provision tree and the unit viewer, "Copy the citation", "Official text", the version chip, "Refresh from the source" (admin) |
| `obligations.png` | Obligation review, `/obligations` (admin) | Filters (act, status, domain, severity, check), "Doubted first", the judge's chip and "what is off" under the title, the row actions approve / reject / edit / delete |
| `prompt-editor.png` | Prompt editor, `/prompts/:slug` (admin) | The draft (based on, variables, text, model, temperature, max tokens, change note, "Activate right away"), the Versions / Compare / Test tabs, the version history |
| `usage.png` | AI usage, `/usage` | Period and scope, today's budget, totals, cost per day and tokens per day as two charts, the splits by purpose and by model |
| `site-home.png` | Public site, home, `/` | The ink bar with the site's pages, the language switch and the way into the console; the hero with the mark as a 3D object |
