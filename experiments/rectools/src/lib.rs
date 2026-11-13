use elma_formats::{
    Graphics,
    lev::{Clipping, Gravity, Level, ObjectType, Polygon, Sprite, Vec2 as FilePoint},
    lgr::Lgr,
    pic::Pic8,
};
use render::{
    Bike, CameraMode, DrawnBike, GpuScene, Output, RenderOptions, Renderer, Scene, SceneOptions,
    Targets, TextureZoom, View, World,
};
use replay::{Animation, LevelObject, Pose, Turning, Vec2};
use serde::Deserialize;
use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;

fn error(cause: impl std::fmt::Display) -> JsValue {
    js_sys::Error::new(&cause.to_string()).into()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Scenery {
    ground: String,
    sky: String,
    textured: bool,
    grass: bool,
    polygons: Vec<ScenePolygon>,
    pictures: Vec<ScenePicture>,
}

#[derive(Deserialize)]
struct ScenePolygon {
    grass: bool,
    vertices: Vec<[f64; 2]>,
}

#[derive(Deserialize)]
struct ScenePicture {
    name: String,
    texture: String,
    mask: String,
    position: [f64; 2],
    distance: i32,
    clip: i32,
}

#[wasm_bindgen]
pub struct BearRenderer {
    renderer: Renderer,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    targets: Targets,
    graphics: Option<Graphics>,
    scene: Option<GpuScene>,
    objects: Vec<LevelObject>,
    bikes: Vec<Bike>,
    drawn_bikes: Vec<DrawnBike>,
}

#[wasm_bindgen]
impl BearRenderer {
    pub async fn create(canvas: HtmlCanvasElement) -> Result<BearRenderer, JsValue> {
        console_error_panic_hook::set_once();
        let (width, height) = (canvas.width().max(1), canvas.height().max(1));
        let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
        descriptor.backends = wgpu::Backends::GL;
        let instance = wgpu::Instance::new(descriptor);
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(error)?;
        let (renderer, adapter) = Renderer::request(&instance, Some(&surface), "Bear rectools")
            .await
            .map_err(error)?;
        let caps = surface.get_capabilities(&adapter);
        let mut config = surface
            .get_default_config(&adapter, width, height)
            .ok_or_else(|| error("Unsupported rectools canvas"))?;
        config.format = render::surface_format(&caps).ok_or_else(|| error("Unsupported format"))?;
        surface.configure(renderer.device(), &config);
        let targets = renderer.create_targets(width, height);
        Ok(BearRenderer {
            renderer,
            surface,
            config,
            targets,
            graphics: None,
            scene: None,
            objects: Vec::new(),
            bikes: Vec::new(),
            drawn_bikes: Vec::new(),
        })
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        if (width, height) == (self.config.width, self.config.height) {
            return;
        }
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(self.renderer.device(), &self.config);
        self.targets = self.renderer.create_targets(width, height);
    }

    pub fn set_lgr(&mut self, bytes: &[u8]) -> Result<(), JsValue> {
        self.graphics = Some(Graphics::Elma(Box::new(Lgr::parse(bytes).map_err(error)?)));
        self.scene = None;
        Ok(())
    }

    pub fn set_scenery(&mut self, json: &str) -> Result<(), JsValue> {
        let scenery: Scenery = serde_json::from_str(json).map_err(error)?;
        let mut level = Level {
            level_id: 0,
            name: String::new(),
            lgr: String::new(),
            foreground: scenery.ground,
            background: scenery.sky,
            polygons: scenery
                .polygons
                .into_iter()
                .map(|p| Polygon {
                    is_grass: p.grass,
                    vertices: p.vertices.into_iter().map(file_point).collect(),
                })
                .collect(),
            sprites: scenery
                .pictures
                .into_iter()
                .map(|p| Sprite {
                    picture: p.name,
                    texture: p.texture,
                    mask: p.mask,
                    r: file_point(p.position),
                    distance: p.distance,
                    clipping: Clipping::from_i32(p.clip),
                })
                .collect(),
            objects: Vec::new(),
            topology_errors: false,
            top_tens: Default::default(),
        };
        let graphics = self
            .graphics
            .as_mut()
            .ok_or_else(|| error("Rectools LGR is missing"))?;
        let options = SceneOptions {
            grass: scenery.grass,
            ..Default::default()
        };
        let limit = self.renderer.atlas_limit();
        let overrides = if let Graphics::Elma(lgr) = graphics
            && !scenery.textured
        {
            // Flat editing colors occupy existing palette entries. Save the original tiles
            // so changing the visibility setting can reuse the parsed LGR.
            let (ground, sky) = lgr.default_textures("ground", "sky", true, true);
            level.foreground = lgr.textures[ground].name.clone();
            level.background = lgr.textures[sky].name.clone();
            Some([
                (ground, flat_texture(lgr, ground, [24, 16, 72])),
                (sky, flat_texture(lgr, sky, [48, 120, 188])),
            ])
        } else {
            None
        };
        let scene = Scene::new(graphics, &level, &[], &options, limit);
        if let Graphics::Elma(lgr) = graphics
            && let Some(overrides) = overrides
        {
            for (index, image) in overrides {
                lgr.textures[index].image = image;
            }
        }
        let scene = scene.map_err(error)?;
        self.scene = Some(self.renderer.upload_scene(scene));
        Ok(())
    }

    pub fn set_objects(&mut self, data: &[f64]) {
        self.objects.clear();
        self.objects
            .extend(data.chunks_exact(5).map(|v| LevelObject {
                r: point(v[0], v[1]),
                kind: match v[2] as u8 {
                    1 => ObjectType::Exit,
                    3 => ObjectType::Killer,
                    _ => ObjectType::Food,
                },
                animation: v[3] as i32,
                gravity: match v[4] as u8 {
                    1 => Gravity::Up,
                    2 => Gravity::Down,
                    3 => Gravity::Left,
                    4 => Gravity::Right,
                    _ => Gravity::None,
                },
                active: true,
                floating_phase: 0.0,
                motion: None,
            }));
    }

    pub fn draw(
        &mut self,
        x: f64,
        y: f64,
        pixels_per_meter: f64,
        time_ms: f64,
        animated_objects: bool,
        zoom_textures: bool,
        bikes: &[f64],
    ) -> Result<bool, JsValue> {
        let Some(scene) = &self.scene else {
            return Ok(false);
        };
        let Some(frame) = render::acquire(&self.surface, self.renderer.device(), &self.config)
        else {
            return Ok(false);
        };

        self.bikes.clear();
        self.bikes.extend(bikes.chunks_exact(14).map(|v| {
            let mut pose = Pose {
                bike_r: point(v[0], v[1]),
                bike_rotation: v[2],
                left_wheel_r: point(v[3], v[4]),
                left_wheel_rotation: v[5],
                right_wheel_r: point(v[6], v[7]),
                right_wheel_rotation: v[8],
                body_r: point(v[9], v[10]),
                flipped: v[11] != 0.0,
                ..Default::default()
            };
            pose.head_r = replay::head_position(&pose);
            Bike {
                pose,
                animation: Animation {
                    bike_turning: Turning {
                        turn_phase: v[12],
                        ..Default::default()
                    },
                    arm_position: v[13].abs(),
                    volt_is_right: v[13] > 0.0,
                    ..Default::default()
                },
                shirt: None,
            }
        }));
        self.drawn_bikes.clear();
        self.drawn_bikes
            .extend((0..self.bikes.len()).map(|bike| DrawnBike {
                bike,
                pictures: 0,
                flag: false,
            }));
        let world = World {
            time: time_ms * replay::MILLISECONDS_TO_PHYS_TIME,
            bikes: &self.bikes,
            objects: &self.objects,
            hide_exit: false,
        };
        let view = View {
            viewport: [0, 0, self.config.width, self.config.height],
            zoom: pixels_per_meter / render::camera::pixels_per_meter(1.0),
            follow: 0,
            camera: CameraMode::Centered,
            camera_edge: None,
            pan: Vec2::default(),
            center: Some(point(x, y)),
            bikes: &self.drawn_bikes,
            translucent: 0..0,
            objects: None,
            timer: None,
            last_apple: None,
            minimap: false,
        };
        let mut options = RenderOptions {
            textures: TextureZoom::Game,
            zoom_textures,
            ..Default::default()
        };
        options.dynamic.animated_objects = animated_objects;
        options.dynamic.still_objects = !animated_objects;
        let output = frame.texture.create_view(&Default::default());
        self.renderer
            .render_world(
                scene,
                &self.targets,
                &world,
                &[view],
                &options,
                Output {
                    view: &output,
                    format: self.config.format,
                },
            )
            .map_err(error)?;
        self.renderer.queue().present(frame);
        Ok(true)
    }
}

fn point(x: f64, y: f64) -> Vec2 {
    Vec2::new(x, -y)
}

fn file_point([x, y]: [f64; 2]) -> FilePoint {
    FilePoint { x, y }
}

fn flat_texture(lgr: &mut Lgr, index: usize, rgb: [i32; 3]) -> elma_formats::lgr::Image {
    let (color, _) = lgr
        .palette
        .chunks_exact(3)
        .enumerate()
        .min_by_key(|(_, candidate)| {
            (0..3)
                .map(|i| (rgb[i] - candidate[i] as i32).pow(2))
                .sum::<i32>()
        })
        .unwrap();
    std::mem::replace(
        &mut lgr.textures[index].image,
        elma_formats::lgr::Image {
            width: 1,
            height: 1,
            pic: Pic8::filled(1, 1, color as u8),
        },
    )
}
