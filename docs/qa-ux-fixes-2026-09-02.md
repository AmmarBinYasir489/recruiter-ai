# UI / workflow fixes and mobile verification — 2 September 2026

## Result

The issues identified in the preceding local staff UX audit have been addressed. The final combined Chromium regression run passed **19/19 tests**. The unit suite passed **152/152 tests in 21 files**. TypeScript and whitespace checks passed.

This is local development verification, not a production deployment, load test, or a guarantee that every browser/device is supported.

## Changes

- **Private staff notes:** default to an internal note stored in the staff audit history, not a candidate notification. Sending a candidate message is a separate explicit audience choice with confirmation. Both show centered success/error feedback.
- **Create user:** defaults to Candidate, shows duplicate-email and server errors, provides pending/success states, and refreshes the list after creation.
- **Threshold feedback:** successful saves display the saved threshold and an inline status plus centered confirmation. Existing staff-controlled approval rules remain intact.
- **Open candidate refresh:** refreshes the selected track without unmounting its fields, changing the selected funnel, or discarding an unsaved note. Browser test observed a new score within 15 seconds.
- **Filters and selection:** associated labels, collapsible filters, explicit reset including the empty state, hydration-safe initial controls, and working application deep links. Selection was verified after applying filters.
- **Staff mobile view:** candidate rows become readable cards instead of a clipped nine-column table. Bulk controls remain in normal document flow on small screens.
- **Navigation:** active role navigation is visually marked and has `aria-current`.
- **Exports:** current representative-track CSV includes funnel, mode, total, graded/assessment counts, and provisional state. Separate all-track export retains separate rows and scores. Formula-like exported values are escaped.
- **Score detail consistency:** latest displayed score is scoped to the selected track's mode. Ungraded results say Awaiting grading; missing raw values no longer show null/null; latest attempts are not automatically labelled accepted.
- **Candidate mobile:** inputs have phone-friendly text sizing, buttons wrap, diagrams fit, and word-search/crossword boards scale. Assessment pages hide navigation so it cannot obscure the timer or question.
- **Candidate safeguards:** unsupported fullscreen is detected before starting an attempt. Assessment copy/paste restrictions remain. Enter in games and objective-answer inputs does not implicitly submit. Optional browser-storage failures no longer crash the proctor UI.
- **Candidate status text:** final selections/rejections take precedence over stale screening state, and dashboard Hold wording says no action is needed.

## Verification

- Recruiter navigation: overview, drives, new drive, candidates.
- Admin navigation: overview, drives, new drive, candidates, users, tiers, audit, AI settings, leaderboard index.
- All 13 staff routes returned HTTP 200; navigation sweeps recorded no page errors or unnamed visible form controls.
- Threshold application and centered feedback, private-note persistence with zero candidate notifications, duplicate-user error, successful default-Candidate creation and immediate list refresh.
- Filters followed by select-all; CSV response and new columns; application deep link; live score update preserving an unsaved note.
- Recruiter/admin selected-track summaries and same-funnel online/onsite comparison at 390, 1280, and 1920px.
- Candidate dashboard, application, notifications at 390px.
- CCAT/MTT one-question navigation and games at 320/390px; timer visibility; no assessment navigation overlay; Enter does not create a game result; unsupported fullscreen does not start an active attempt.
- Full CV approval → mixed 80-question CCAT → Hold → staff threshold approval → next phase, with candidate privacy assertions.
- CV-only intake/deadline behavior, login and invalid credentials, editable skill suggestions, bulk onsite funnel assignment.

Screenshots from the final combined run are in `test-results/final-ux/`.

## Boundaries

- No production deployment or Git push was performed in this pass.
- No remote database migration or question-bank deletion was performed.
- Tests used isolated temporary QA records where mutations were needed; existing candidate scores and hiring decisions were not changed.
- Phone coverage used Chromium viewport simulation, not physical iPhone/Android devices. Browsers without required fullscreen support can use candidate pages, but cannot start a secure assessment; the UI explains this before the timer starts.
- Production build and production performance were not rechecked while the user's development server was running.
