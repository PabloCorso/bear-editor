# Rectools rendering experiment

## Try it

Install a Rust toolchain with the `wasm32-unknown-unknown` target and install the
matching bindings generator with `cargo install wasm-bindgen-cli --version 0.2.129 --locked`.
The prototype was built with Rust 1.100.0.

Run `sh experiments/rectools/build.sh` before starting the local dev server or
building the web or desktop app locally. Netlify and desktop CI build the WASM
package automatically. Open `/QWQUU046` to try rectools in the editor and play
mode. Turn on Ground/Sky textures and Grass textures in Visibility options to
see textured rendering. For more geometry and pictures, use `/Tio250` and
`/WCup907`.

The input canvas's `data-renderer` reports `rectools-loading`, `rectools`, or
`webgl-fallback`. Bear's WebGL renderer draws while WASM loads and if initialization
fails, the LGR is rejected, the rectools context is lost, or polygon visibility is
off.

## Scope and implementation

The experiment pins [rectools at 2fd03a8](https://github.com/elmadev/rectools/tree/2fd03a85d0fee2b42cdf79d9526ae82ed248dfe6)
and calls its `Renderer::render_world` with Bear's live camera, objects and
bike poses. This reuses the palette-indexed renderer, stencil and layer passes,
grass, LGR parsing and sprite transforms. The replay crate provides shared pose
and animation types. The replay viewer, playback state, audio and WebGPU
backend are outside the build. Vendoring would add the renderer, shaders and
their tightly coupled format and pose code to this repo. A small adapter at a
pinned revision is easier to review and upgrade.

The original input canvas draws selection, hover, handles, guides, reference
images, grid, bounds and translucent or tinted draft and test-start sprites.
The rectools world is a separate canvas. This keeps editor interactions using
Bear's existing geometry and hit tests. Drafts, grid and reference images now
composite above the rectools world and may layer differently around sprites.
Picture pixel hit tests still use Bear's own sprite dimensions and can disagree
around snapped pixels or when LGR target dimensions differ. Image export uses
the existing renderer.

Rectools uses whole-level bounds to place classic textures and sort pictures.
The adapter passes scenery on changes, reuses the parsed LGR, device and
pipelines, and sends a packed bike pose each frame. Camera movement and zoom
reuse the atlas and geometry. Object data changes only when its visible list or
properties change. A committed scenery change rebuilds the rectools atlas and
static buffers. Live drags that change committed scenery can therefore be
expensive. Rectools' public API currently couples texture upload to static
scene upload. Separating those lifetimes upstream would avoid reuploading the
LGR for geometry and picture edits.

## Visual comparison

In Chromium at 1100 × 730 CSS pixels, the two backends showed the same broad
ground/sky geometry on QWQUU046. With the same Default.lgr and camera,
rectools showed a different sky phase and a crisper, more stepped ground
and grass texture. Its code anchors tiles to the level bounds, scrolls sky
at half speed and uses integer pixel placement and palette indices.
These are concrete differences from Bear's world-space texture sampling,
and match the behavior rectools' Elma Classic-derived code implements.
A capture from the original game at a matched camera and zoom is still needed
to score accuracy. Different animation times in the browser captures also
prevent a pixel-for-pixel comparison of the bikes and moving objects.

The bike and rider render in play mode at DPR 1 and 2. At DPR 2, play mode uses
more device pixels while editor mode retains Bear's existing CSS-pixel
backing size. Ground, grass and picture order around the start area
looked broadly similar. Rectools' clipping and distance rules can produce
different coverage at edges. The flat editing colors approximate Bear's
ground and sky using the nearest LGR palette entries. With textures hidden,
a masked picture using one of those same two tiles can inherit the flat fill.
Custom LGRs and mobile Safari require separate verification.

## Cost and recommendation

The release WASM is 4.01 MB raw and 1.18 MB gzipped. The generated JavaScript
and adapter are also lazy. A normal navigation requested zero WASM files. The
production SPA home bundle grew by about 4 kB minified and 1.2 kB gzipped
compared with main. Across local runs, importing and instantiating WASM took
81–122 ms. Initializing WebGL took another 481–878 ms. First visible rectools
frames took 4.5–7.9 seconds from navigation, including editor startup, LGR
decoding and first-frame work. These timings use a local server and SwiftShader.

The fitted editor views below used Default.lgr, ground/sky and grass textures,
object animations, 1100 × 730 CSS pixels and DPR 1. Each result is the median
and 95th percentile of 20 animation-frame callback intervals in Chromium with
SwiftShader. These intervals include browser scheduling and rendering on the
software GPU.

| Level   | Polygons | Vertices | Pictures | Bear median / p95 | Rectools median / p95 |
| ------- | -------: | -------: | -------: | ----------------: | --------------------: |
| Tio250  |      285 |    2,933 |      979 |       67 / 267 ms |        850 / 2,250 ms |
| WCup907 |      188 |    3,838 |    1,238 |       50 / 217 ms |        500 / 1,467 ms |

A separate 90-frame Tio250 run measured 200 / 417 ms for Bear and
1,117 / 2,550 ms for rectools. The variation is substantial, with rectools
slower in both runs. Hardware measurements are needed to attribute the gap.

Rectools allocates two R8 targets, one R16 target and one depth/stencil target.
At roughly eight bytes per pixel, these account for about 6.1 MiB at
1100 × 730 device pixels and 24.5 MiB at twice that resolution. Its default
minimum two-layer 2048² indexed atlas adds 8 MiB. These estimates exclude
driver overhead, swap buffers, other buffers and Bear's overlay canvas.
The prototype keeps both graphics stacks live and can have both editor and
play renderers allocated during play-testing. Browser-level GPU memory was
unavailable in the software-rendered test environment.

Before a full migration, compare
against original Elma captures, split atlas and geometry updates, confirm
placement and hit-test alignment at different zooms and DPRs, and measure
frame time and memory on physical GPUs, including macOS and iOS Safari.

The Rust adapter is available in this repository under the same terms as the
rectools build. The build uses rectools under its
[upstream dual license](https://github.com/elmadev/rectools/blob/2fd03a85d0fee2b42cdf79d9526ae82ed248dfe6/LICENSE.md),
which includes noncommercial and share-alike terms. The build emits the
upstream license beside its assets. Resolve distribution terms before shipping
the renderer as a general release.
