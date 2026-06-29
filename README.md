# GIMS · Getting Started (interactive demo)

> **This is a non-functional demonstration.** It looks and behaves like GIMS, but it has
> **no real backend, no real authentication, and stores nothing.** Every screen is the *real*
> GIMS front end, driven by an **in-browser mock** — all data is simulated and **resets when you
> close the tab**. Any login works. It exists to show the workflow and UI, not for regulated use.
>
> The real, 21 CFR Part 11-defensible GIMS (keyed integrity chaining, server-of-record custody,
> validated time, electronic signatures) is a separate, private system. **None of that backend
> logic lives in this repository.**

A gnome-led, chaptered walkthrough that builds a small GIMS "grammar" end to end:

1. **Welcome** — the parts-of-speech model.
2. **Noun** — define a `Sample` with `received_at` / `due_at` (datetime) + a `hold_clock` field.
3. **Adjective** — turn `hold_clock` into a live **Duration** timer bound `received_at → due_at`.
4. **Verb** — define a `Test` action *(in progress)*.
5. **Enter data** — create a `Sample` record *(in progress)*.
6. **Runlog** — watch the clock tick + the NTP-validated clock badge *(in progress)*.

## How it works

- **Real front end, mock backend.** `mock/gims-mock.js` overrides `window.fetch` *before* the page
  bundles load and answers GIMS endpoint paths from an in-memory store (kept in `sessionStorage` so
  data survives chapter→chapter and clears on tab close). It also stubs `window.GIMS` so the real
  React pages mount anonymously. No network leaves the page.
- **Prebuilt, committed bundles.** `static/` mirrors GIMS's `/static/` tree (React vendor + page
  bundles + Watery CSS + the tour engine + the gnome). React is externalized at build time, so these
  are shipped **prebuilt and never regenerated here**. Refresh them with `./sync-assets.sh`.
- **The tour.** `tutorial/chapters.js` paints the DEMO banner and runs the per-chapter gnome tour
  (the vendored `static/lib/tour.js` engine), driving the real controls and advancing to the next
  chapter on finish.

## Run locally

```bash
python3 -m http.server 8190    # then open http://127.0.0.1:8190/
```

## Deploy

Static — no build step. `vercel.json` sets `cleanUrls` + security headers; deploy is a `git push`.

## Re-syncing the front end

```bash
GIMS_SRC=/path/to/GIMS-Project ./sync-assets.sh
```

## Portability to in-app mode

The mock + tour are intentionally decoupled from the host pages. The **same** `mock/gims-mock.js`
+ `tutorial/chapters.js` can run *inside* GIMS itself behind a `?mockMode=1` flag (install the fetch
override before `/orchestrate/inject.js`, reuse `window.GIMS`), giving an in-app guided onboarding
without a real project. This standalone repo is the extracted, presentable target of that one flow.
