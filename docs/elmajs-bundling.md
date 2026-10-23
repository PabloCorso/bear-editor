# elmajs bundle investigation

Investigated on 2026-10-23 with the installed `elmajs` 1.2.4 and Vite 6.4.2.

## Recommendation

Point Vite's exact `elmajs` import at the package's existing ESM build. This
needs no fork, dependency upgrade, or changes to application imports. It removed
24,561 bytes of minified JavaScript (7,186 bytes gzip) from the main editor chunk
in the production-build experiment: about 3.2% of that chunk's gzip size.

This document records an investigation; production configuration is unchanged.
The temporary build configuration was removed after measuring.

## Priority relative to server response time

A follow-up check of `https://beareditor.com/` on the same day found a much
larger delay before any HTML arrived:

| Public request                             | Time to first byte | Total request time |
| ------------------------------------------ | -----------------: | -----------------: |
| Initial HTML request                       |            8.726 s |            8.741 s |
| Subsequent HTML request                    |            1.041 s |            1.054 s |
| Editor JS (`home-DONFT8GL.js`, compressed) |            0.461 s |            0.987 s |

These were individual curl requests from this environment, not a browser
benchmark or controlled cold-start test. Both HTML responses reported an edge
cache miss and durable-cache bypass. The difference is consistent with a cold
SSR function, but confirming that cause requires function logs or repeated
measurements after idle periods. It does not establish a free-plan limitation.

The app enables SSR, and the home route's server loader only returns whether an
OpenAI API key is configured. Netlify's React Router integration uses serverless
functions by default; static assets use its CDN, while dynamic responses are
[not cached by default](https://docs.netlify.com/build/caching/caching-overview/).
Investigate serving a static/prerendered editor shell or caching eligible HTML
before treating the ESM change as a solution to the observed initial wait.
The bundle reduction remains useful for transfer and client execution after
HTML arrives, but it cannot remove that initial server response delay.

## Why the unused code ships

- `app/editor/elma-types.ts` imports the root namespace and uses `Level` and `LGR`
  at runtime. Its other package references are types.
- `app/editor/play-mode/level-converter.ts` imports `ObjectType` and `Gravity` at
  runtime. `pcx-loader.ts` has only a type import and adds no runtime dependency.
- The installed package declares `main: lib/index.js`, with no `module`,
  `exports`, or `sideEffects` fields. It nevertheless ships `lib-esm/index.js`
  alongside the CommonJS build.
- The CommonJS root re-exports levels, replays, shared definitions, utilities,
  LGRs, and state.dat support. The production bundle retains all these areas.
- Switching the application's namespace import to named imports would still
  resolve to that CommonJS entry. CommonJS deep imports also retain the root:
  `lib/lev/Level.js` requires `../`, and `lib/lgr/LGR.js` does likewise.

The [upstream repository](https://github.com/elmadev/elmajs) owns the packaging;
the observations above come from the locally installed release.

## Measured production output

Each variant used a fixed snapshot of the working tree and `react-router build` with a temporary
Vite configuration. A temporary `generateBundle` hook inspected Rollup's
`chunk.modules[*].renderedLength` and measured final `chunk.code` using
`Buffer.byteLength` and Node's default `gzipSync`. Sizes below are bytes, without
source maps; gzip is a transfer-size estimate, not a measured load-time change.

| Configuration                                      | Main editor JS | Main editor gzip | All client JS | All client gzip\* |
| -------------------------------------------------- | -------------: | ---------------: | ------------: | ----------------: |
| Current CommonJS root                              |        708,693 |          221,419 |     1,089,337 |           344,917 |
| Exact root alias to ESM                            |        684,132 |          214,233 |     1,064,705 |           337,725 |
| ESM plus package-scoped `moduleSideEffects: false` |        683,520 |          213,984 |     1,064,093 |           337,475 |

\* Sum of independently gzipped JavaScript chunks, including deferred chunks.
Changed filenames/import hashes account for small changes outside the main chunk.

With ESM alone, the replay and state classes disappear, but enum initialization
in `rec/Event.js`, `rec/Frame.js`, `rec/Replay.js`, and `state/State.js` remains.
Rollup conservatively preserves these top-level calls as potential side effects.
Marking only `elmajs/lib-esm/` modules side-effect-free removes these remnants,
saving another 612 bytes minified / 249 bytes gzip. Prefer the simple alias first;
the additional override creates a maintenance obligation for a small gain.

The `buffer` browser implementation remains necessary for level/LGR binary I/O.
ESM does not remove it, nor does it split LGR parsing into a deferred chunk.

## Proposed application change

Add an exact alias to `vite.config.ts`, preserving the existing options:

```ts
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Inside the returned Vite configuration:
resolve: {
  alias: [
    {
      find: /^elmajs$/,
      replacement: require.resolve("elmajs/lib-esm/index.js"),
    },
  ],
},
```

The experiment used an absolute path to this same ESM entry. The exact match
avoids rewriting subpaths. TypeScript continues using the public root declarations.
Vite bundles the aliased ESM into the server build as well; the baseline server
build externalizes CommonJS. Verify SSR and development prebundling before
shipping the change. Storybook uses this Vite configuration too.

The deep path is published but is not an explicit package export contract. Check
it when upgrading `elmajs`, especially if upstream introduces an `exports` map.
A durable upstream improvement would advertise the ESM entry to bundlers and,
after auditing module initialization, declare the package side-effect-free.
Native Node ESM support needs additional work: the current ESM files contain
extensionless/directory imports and the package lacks an ESM package boundary.
Adding only an `exports.import` target would not address those issues.

## Validation performed

- All three variants completed client and SSR production builds.
- Rollup module inspection confirmed replay/state implementations remain in the
  baseline, disappear with ESM, and leave no rendered replay/state modules with
  the additional side-effect override.
- A temporary browser-targeted esbuild bundle of the ESM exports was compared
  against the installed CommonJS exports using all 120 checked-in `.lev` files
  and `app/assets/lgr/Default.lgr` (334 pictures). Parsed data, serialized bytes,
  and reparsed data matched. `Math.random` was fixed during serialization because
  the level writer deliberately generates randomized integrity fields.
- No test files were added. Browser UI, development-server behavior, Storybook,
  and deployed SSR were not exercised; no load-time improvement is claimed.
