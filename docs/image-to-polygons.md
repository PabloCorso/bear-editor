# Experimental image to polygons

Open **Level options (three dots) → Image to polygons…**. Choose a PNG, JPG or
WebP, then use **Compare all** or an individual **Run** button. Select a result,
choose its world width and position, and import. The generated polygons are
selected for moving, resizing and editing; import is a single polygon mutation
in the existing undo history. The default position is five world units beyond
the level’s rightmost vertex, to avoid changing existing ground/sky parity.

This is a comparison workbench, not a playable-terrain generator. There is no
vertex-count cap. The initial longest-side resolution is 512 px; choose up to
4096 px when small details matter. High resolutions, particularly with all six
workers running, can consume substantial memory. Stop individual jobs if needed.

## Implementations

| Mode               | Implementation                                                                                    | Useful for                                                       | Limitations                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Binary tracing     | ImageTracerJS 1.2.6, fixed black/white palette                                                    | Logos, silhouettes, smooth drawings                              | Threshold discards color distinctions; quadratic fitting can round corners                                               |
| ImageTracer colors | ImageTracerJS 1.2.6, deterministic palette initialization and quantization                        | Flat illustrations and color boundaries                          | Palette quantization can move edges or lose small regions; not semantic object segmentation                              |
| VTracer            | vtracer-wasm 0.1.0, visioncortex clustering, cutout hierarchy, spline/polygon fitting             | Complex color artwork and curved outlines                        | Older binding; color levels are per channel, not a total palette size; gradients can produce many regions                |
| Marching squares   | d3-contour 4.0.2 with optional interpolation                                                      | Antialiased boundaries, predictable threshold exploration        | Follows luminance only; stair steps without interpolation; does not fit curves                                           |
| OpenCV contours    | @techstark/opencv-js 4.12.0-release.1, findContours, RETR_TREE, CHAIN_APPROX_SIMPLE               | Binary shapes, full contour nesting, compact straight boundaries | Pixel-center contours can shrink thin features; one-pixel components may have no enclosed area; large runtime            |
| Centerlines        | skeleton-tracing-js 1.0.4 vanilla JS, Zhang–Suen thinning and LingDong divide-and-conquer tracing | Handwriting, diagrams and thin decorative strokes                | Intentionally loses original stroke width and filled areas; branches and small loops can change; chosen width is uniform |

Color modes vectorize the prepared color image first, then select dark palette
regions by luminance. This is different from thresholding the original image
before tracing. Since Elma only has ground/sky topology, adjacent selected color
regions are merged. Color detail with no luminance distinction is lost. No source
colors are embedded as pictures or textures.

Parameters shared across modes are threshold, blur, final polygon
simplification, curve flattening error and minimum region area. Adapter controls
include curve fitting/interpolation, palette size or per-channel precision,
VTracer corner threshold and reconstructed centerline width. Controls that do not
apply to an algorithm are omitted. After a mode has run, changing its parameters
recomputes it with a short debounce. Each card holds its own algorithm settings.

## Polygon conversion

Elma non-grass polygons are rings of vertices; closing edges are implicit. Bear’s
renderer toggles fill at every enclosing ring, independent of winding. A hole is
a separate nested polygon and an island in a hole is another nested polygon.
Neither the editor format nor the renderer needs an SVG compound-path object.

1. Decode and resize locally. Composite transparency over white consistently and
   optionally blur using OffscreenCanvas in a worker.
2. Trace in an independent adapter. SVG emitted by the two SVG-producing
   adapters is parsed with svg-pathdata; cubic/quadratic curves are flattened
   adaptively with de Casteljau subdivision. Generated SVG is never inserted
   into the DOM, and user SVG uploads are not accepted.
3. Union selected regions with the existing polygon-clipping dependency so
   overlapping shapes and reconstructed stroke joints do not cancel under Elma’s
   parity fill. Remove consecutive duplicate vertices and repeated closure points.
4. Simplify closed rings with simplify-js (Ramer–Douglas–Peucker on two open
   arcs), filter small regions/holes, and boolean-normalize the result to repair
   intersections introduced by simplification. Simplification is not guaranteed
   to preserve narrow bridges; reduce it to zero for a fidelity baseline.
5. Export outer/hole rings directly, or optionally decompose regions containing
   holes with Earcut. The latter is a visual experiment: triangles share edges
   and can trigger topology diagnostics. Keep it off for normal editing.
6. In “Dark regions are ground” mode, prepend a slightly larger sky frame.
   Outside all polygons Elma is ground; within one ring it is sky. The extra
   frame lets the dark silhouette appear as ground inside the image’s sky area.
   Turning this off makes dark regions sky without that extra frame.
7. Preview the final Polygon[] with a single even-odd fill, using Bear’s ground
   and sky colors. Counts include the frame and any triangles. Import translates
   and scales that same result into editable polygons, without replacing level
   objects or pictures.

Centerlines become round-capped segment regions, unioned before exporting rings.
They have actual width and area rather than coincident forward/backward vertices.
The 12-sided round caps are an approximation. The original thickness is not
estimated, and this mode is not expected to reproduce filled silhouettes.

No global intersection-free placement guarantee is possible when importing over
existing polygons. Even within the result, point contacts and triangulation seams
may be flagged by topology checks. The preview represents standalone parity, not
an overlay simulation against the current level. The dialog explains this and
defaults to importing beside the existing level. Winding and file precision are
handled by Bear’s existing level serializer when saving.

## Architecture, browser support and cost

The dialog is lazy-loaded from the header menu. Each run creates its own module
worker, dynamically imports one adapter, reports errors to that card, and
terminates when finished, cancelled, superseded or closed. An adapter failure
cannot mutate the document or stop another card. Worker output is associated with
its source image and option snapshot, so a stale result cannot be selected after
those inputs change. No uploads, CDN requests, native server process or API keys
are required at runtime.

Requires modern module workers, WebAssembly, createImageBitmap and OffscreenCanvas
2D. This was not cross-browser UI tested; browsers without these capabilities
show a card error rather than falling back to main-thread processing. WASM must
be permitted by the host’s CSP. Fresh workers trade initialization time for easy
cancellation and isolation; the timing includes module/runtime startup and cleanup
of geometry, but excludes initial image decoding.

Measured production assets (uncompressed, approximate; worker-shared chunks are
not additive for every adapter):

| Asset                                 |    Size |
| ------------------------------------- | ------: |
| Lazy comparison dialog                |   12 KB |
| Worker plus shared polygon conversion |   39 KB |
| SVG path parser/flattening chunk      |   21 KB |
| ImageTracer adapter/runtime           |   20 KB |
| VTracer adapter/glue                  |    7 KB |
| VTracer WASM                          |  137 KB |
| Marching squares adapter/runtime      |    5 KB |
| Skeleton adapter/runtime              |    5 KB |
| OpenCV adapter/runtime                | 10.8 MB |

The ES-module worker output setting in Vite is required for adapter code splitting
and also applies to Bear’s existing LGR worker; the production build checks both.

OpenCV’s pinned Emscripten runtime is a self-resolving thenable. It is statically
imported _inside the lazy adapter_ and initialized through a separate void promise.
Directly awaiting it, or dynamically importing its then-bearing namespace, can
hang through recursive promise assimilation.

## Licensing and research

Dependencies are pinned in package-lock.json. ImageTracer is Unlicense;
VTracer’s binding, visioncortex, skeleton tracing, simplify-js and svg-pathdata are
MIT; d3-contour is ISC; Earcut is ISC; OpenCV is Apache-2.0. Existing
polygon-clipping is MIT. Original license notices remain in the installed
packages. The skeleton npm package omits a license file; its package metadata and
upstream repository identify MIT (see [third-party notices](../public/image-to-polygons-notices.txt)).

Potrace was investigated but is **not bundled**. Both esm-potrace-wasm and the
source of potrace-ts carry GPL code; distributing it within this MIT project
requires a deliberate licensing decision. Binary ImageTracer provides an
established binary tracing alternative for this experiment, without relabeling
it as Potrace.

Other evaluated directions: AutoTrace has centerline support but brings GPL/LGPL
and a less convenient browser integration; full OpenCV thinning/contrib is heavier
than the independent skeleton implementation; custom pixel-edge tracing was
unnecessary given D3 and OpenCV; stacked SVG regions were avoided in VTracer
because overlapping regions need paint-order reconstruction before parity export.

Primary sources:

- [ImageTracerJS](https://github.com/jankovicsandras/imagetracerjs)
- [VTracer](https://github.com/visioncortex/vtracer) and [the pinned WASM binding](https://github.com/jsscheller/vtracer-wasm)
- [OpenCV.js package](https://github.com/TechStark/opencv-js) and [contour hierarchy documentation](https://docs.opencv.org/4.x/d9/d8b/tutorial_py_contours_hierarchy.html)
- [D3 contour documentation](https://d3js.org/d3-contour/contour)
- [Skeleton tracing](https://github.com/LingDong-/skeleton-tracing)
- [Earcut](https://github.com/mapbox/earcut)
- [svg-pathdata](https://github.com/nfroidure/svg-pathdata)
- [simplify-js](https://github.com/mourner/simplify-js)
- [Potrace WASM licensing](https://github.com/tomayac/esm-potrace-wasm)

## Verification evidence

- `npm run validate`: ESLint, TypeScript and all 150 existing Vitest tests pass.
- `npm run build`: client, worker/WASM assets and SSR build pass. OpenCV emits
  expected Node-module externalization notices for its unused Node environment
  branch; VTracer emits a missing default WASM-name warning, but its initializer
  is explicitly given the emitted vtracer.wasm asset URL.
- All six emitted production worker/adapter chunks also execute against a 32×32
  ring fixture in a Node worker harness with a minimal OffscreenCanvas stub and
  local WASM fetch mapping. This exercises bundling and initialization, not native
  browser image decoding, blur or UI behavior.
- Ad hoc execution of the real adapters on a generated 64×64 nested square,
  hole, island and thin separate stroke fixture produced:

| Mode               | Rings / vertices | Decomposed polygons / vertices |
| ------------------ | ---------------: | -----------------------------: |
| Binary tracing     |           4 / 16 |                        10 / 32 |
| ImageTracer colors |           4 / 16 |                        10 / 32 |
| VTracer            |           4 / 16 |                        10 / 32 |
| Marching squares   |           4 / 20 |                        14 / 44 |
| OpenCV             |           4 / 20 |                        14 / 44 |
| Centerlines        |           3 / 25 |                        17 / 57 |

Counts above exclude the optional sky frame. Filled modes preserve the fixture’s
hole, island and thin region under point/parity checks, including decomposition.
Centerlines retain a thin stroke but intentionally replace filled shapes with
skeletons. These are small synthetic fixtures, not a claim that the modes have
been benchmarked on complex artwork. No new test files were added, following
AGENTS.md.

Browser UI verification could not be completed in this environment: local
Chromium was blocked from creating its process socket, and the available remote
browser could not access the local development server. Upload interactions,
visual layout, cancellation, import/selection and undo still need a manual pass
in the running editor. In particular, visual fidelity on logos, photos, drawings
and characters is the purpose of testing this PR, not an established conclusion.
