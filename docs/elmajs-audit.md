# elmajs dependency audit

Inspected the installed `elmajs@1.2.4` package and this repository on 2026-11-05.
This PR keeps the native binary parser and writer unchanged.

## Types and boundaries

`app/editor/elma-types.ts` now owns positions, polygons, level objects, apples,
pictures, saved times and complete editor levels. Positions remain `{x,y}`
objects. Store/tools no longer derive canonical types from elmajs constructors.
Native level loading creates plain geometry/picture records, and writing adapts
editor data in `helpers/level-parser.ts`. Runtime Level/LGR exports live in
`helpers/elma-binary.ts`, not the shared domain module. Graphics decoding still
uses elmajs's `PictureData` type at its LGR boundary; the saved-times UI uses its
`formatTime` utility. Play-mode conversion accepts an editor-owned structural
view of native level data and retains the existing export normalization path.

## Packaging and measured bundle cost

The package declares `main: lib/index.js` (CommonJS) and `types: lib/index.d.ts`.
It ships `lib-esm/`, but declares no `module`, `exports`, `type: module`, or
`sideEffects` field. Normal Vite resolution therefore uses CommonJS. The current
client and React Router SSR production builds both succeed with that entry.

The CommonJS entry re-exports level, replay, LGR and state modules. Their internal
imports also go back through barrels. A Vite 6 production experiment exporting
only `Level`, `LGR`, and `formatTime` (the runtime exports used by Bear) gives:

| Entry              | Minified bytes | Gzip bytes |
| ------------------ | -------------: | ---------: |
| `lib/index.js`     |         93,819 |     21,258 |
| `lib-esm/index.js` |         55,277 |     13,668 |
| Difference         |         38,542 |      7,590 |

Method: Vite's JS `build()` API with `configFile: false`, ES library output,
esbuild minification, default tree shaking, and a temporary entry re-exporting
those three symbols from each installed entry. Byte counts are UTF-8 output and
Node `gzipSync` output. These are **isolated dependency builds**, not a claim
about whole-app transfer savings, page-load timings or worker deduplication.
Rollup's output module records confirm that CommonJS retains replay parsing and
state-file handling that Bear never uses. The ESM experiment removes most of
that code, although some module initialization remains through internal barrels.

The only runtime package dependency is `buffer`; its transitive dependencies
`base64-js` and `ieee754` are also included. The Buffer module alone contributes
62,486 rendered bytes before minification in both experiments. It remains needed
by the level and LGR readers/writers even with ESM. `fs-extra`, Jest, webpack and
other package development tools are not shipped into Bear's browser bundle.

## Loading and follow-ups

The existing Faster loads roadmap correctly separates initial HTML response delay
from JavaScript delivery. These bundle measurements do not explain server response
time. No network timing or claim of a TypeScript-checking bottleneck was established
here. Removing constructor-derived domain types fixes ownership without asserting
an unmeasured compiler performance improvement.

1. First try a separate ESM entry/configuration PR. The browser-targeted Vite
   experiment works, but deep `.js` ESM inside a package without ESM metadata needs
   validation with the actual SSR externalization, Node runtime, Vite development
   prebundling, LGR worker and production browser. Do not infer native Node/SSR
   compatibility from the isolated browser build.
2. A native TypeScript `.lev` reader/writer deserves a separate, focused proposal
   if clearer validation, lazy loading or reduced binary coupling is still useful
   after ESM. Editor-owned records now give it a clean boundary. Typed arrays and
   `DataView` could replace Buffer for `.lev`, but LGR would still use Buffer until
   separately addressed, so a `.lev` rewrite alone cannot promise its removal.
3. A replacement must preserve header/version handling, binary string semantics,
   object enums, polygon winding/precision, integrity, encrypted top-ten lists and
   existing error behavior. Compare native round trips against real levels and
   the game before switching. Replacing only the parser while retaining the
   existing writer would still retain the old dependency on the export path.

Recommendation: pursue the smaller ESM/loading investigation first; keep native
parser replacement separate from the JSON/type change and justify it against
measured loading and maintenance benefits.
