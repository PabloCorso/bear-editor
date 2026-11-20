# Visual documentation experiments

Compare four ways to explain Bear Editor without requiring a reader to know
Elasto Mania. These are documentation prototypes, not changes to the editor.

| Format               | Expected output                         | What to evaluate                                                     |
| -------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Raw screenshot       | `editor-overview.png`                   | Can you understand the workspace at a glance?                        |
| Annotated screenshot | `editor-annotated.png`                  | Do the three numbered callouts help orient a new reader?             |
| Looping GIF          | `create-polygon.gif`, `move-vertex.gif` | Are the actions and keyboard shortcuts easy to follow?               |
| Visual walkthrough   | `step-1.png` through `step-3.png`       | Can screenshots replace a lengthy tutorial?                          |
| MP4                  | `editor-to-game.mp4`                    | Is the editing-to-playtesting transition compelling for a portfolio? |

## Generate and review

The optional capture script uses the actual editor in a disposable browser
session and adds a temporary caption and click indicator for documentation.
It does not alter application code, save levels, or send analytics.

Download `bear-editor-showcase` from the Visual documentation workflow run
associated with this pull request to compare the outputs. The first run is a
prototype; review it visually before incorporating its assets into the README.

To reproduce locally, install Playwright and FFmpeg, then run:

```sh
npm ci
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npx react-router dev --host 127.0.0.1 --port 5173
```

In another terminal:

```sh
node docs/showcase/capture.mjs
```

The output defaults to `docs/showcase/generated`. The script requires a browser
capable of initializing WebGL 2. `BEAR_SHOWCASE_URL` and
`BEAR_SHOWCASE_OUTPUT` can override the source and destination.
