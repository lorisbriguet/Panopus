//! wgpu render engine for the Finish graph — the export-side twin of
//! src/lib/glExecutor.ts. Same shaders, same graph semantics; the parity
//! harness (Task 15) pins both to the same pixels.
//!
//! Shader path: the shared .frag sources carry no #version/precision and
//! declare their contract uniforms as loose `uniform ...;` lines (the
//! WebGL2 header path). Here those lines are STRIPPED and replaced by a
//! generated Vulkan-GLSL header: a single std140 `Params` uniform block
//! (block members are referenced unqualified, so shader bodies compile
//! unchanged) plus explicitly-bound split texture2D/sampler pairs with
//! #defines restoring the combined sampler names the bodies use. naga's
//! glsl-in parses the result and wgsl-out feeds wgpu.
//!
//! std140 layout of the Params block (mirrored by write_params): members
//! in declaration order — uRes: vec2 (align 8, size 8) first, then one
//! member per manifest param in manifest order: float/int/enum/bool as a
//! 4-byte scalar (align 4), color as vec3 (align 16, size 12). Offsets
//! are align_up(cursor, align); total size rounds up to 16.
//!
//! Orientation: WebGL uploads flipped (v=0 = image bottom, GL layout) and
//! its FBO passes keep that layout. wgpu rasterizes NDC +y to texture row
//! 0, which would flip every pass. The vertex shader negates y so raster
//! output lands in GL layout too; sources/assets are flipped on upload
//! and the final readback is flipped once at the end. Every pass then
//! sees identical uv semantics in both engines.

use std::collections::HashMap;
use std::path::PathBuf;

use image::RgbaImage;

use super::manifest::{EffectSpec, ParamSpec, PassSpec};
use super::{execution_order, shaders_dir, FinishGraphRs};

/// `u` + PascalCase: scale -> uScale, glyph-atlas -> uGlyphAtlas.
/// Port of glExecutor.ts's uniformName/textureUniformName.
pub fn uniform_name(param: &str) -> String {
    let base = param.rsplit_once('.').map_or(param, |(stem, _)| stem);
    let pascal: String = base
        .split(|c: char| c == '_' || c == '-' || c.is_whitespace())
        .filter(|s| !s.is_empty())
        .map(|s| {
            let mut cs = s.chars();
            match cs.next() {
                Some(f) => f.to_uppercase().collect::<String>() + cs.as_str(),
                None => String::new(),
            }
        })
        .collect();
    format!("u{pascal}")
}

fn glsl_type(kind: &str) -> &'static str {
    match kind {
        "float" => "float",
        "color" => "vec3",
        _ => "int", // int | enum | bool
    }
}

#[derive(Debug, Clone)]
pub struct FieldOffset {
    pub name: String,
    pub kind: String,
    pub offset: usize,
}

/// std140 offsets for the Params block: uRes then the manifest params.
/// Returns (fields, total size). Kept in lockstep with the GLSL block
/// emitted by compose_glsl.
pub fn params_layout(spec: &EffectSpec) -> (Vec<FieldOffset>, usize) {
    let mut fields = Vec::new();
    let mut cursor = 0usize;
    let push = |name: String, kind: &str, cursor: &mut usize, fields: &mut Vec<FieldOffset>| {
        let (align, size) = match kind {
            "vec2" => (8, 8),
            "color" => (16, 12), // vec3
            _ => (4, 4),         // float | int | enum | bool
        };
        let offset = (*cursor + align - 1) / align * align;
        *cursor = offset + size;
        fields.push(FieldOffset {
            name,
            kind: kind.to_string(),
            offset,
        });
    };
    push("uRes".into(), "vec2", &mut cursor, &mut fields);
    for p in &spec.params {
        push(uniform_name(&p.name), &p.kind, &mut cursor, &mut fields);
    }
    let size = (cursor + 15) / 16 * 16;
    (fields, size)
}

/// Texture uniform names for a pass, in binding order 1..: uTex0..uTexK
/// (node inputs for pass 0, previous-pass output for later passes) then
/// the pass's own texture assets.
fn pass_texture_names(spec: &EffectSpec, pass_index: usize) -> Vec<String> {
    let mut names = Vec::new();
    let input_count = if pass_index == 0 { spec.inputs.max(1) } else { 1 };
    for k in 0..input_count {
        names.push(format!("uTex{k}"));
    }
    if let Some(files) = spec
        .passes
        .get(pass_index)
        .and_then(|p: &PassSpec| p.textures.as_ref())
    {
        for f in files {
            names.push(uniform_name(f));
        }
    }
    names
}

/// Build the Vulkan-GLSL source for one pass: generated header + the
/// frag body with its loose contract declarations stripped.
pub fn compose_glsl(spec: &EffectSpec, pass_index: usize, src: &str) -> String {
    let mut out = String::from("#version 450\n");
    out.push_str("layout(location = 0) in vec2 vUv;\n");
    out.push_str("layout(location = 0) out vec4 fragColor;\n");
    out.push_str("layout(std140, binding = 0) uniform Params {\n");
    out.push_str("    vec2 uRes;\n");
    for p in &spec.params {
        out.push_str(&format!(
            "    {} {};\n",
            glsl_type(&p.kind),
            uniform_name(&p.name)
        ));
    }
    out.push_str("};\n");
    // naga 30's glsl-in has no combined-sampler globals (Vulkan split
    // style only) and demands explicit layout(binding=X) on opaque
    // uniforms. Declare texture2D/sampler pairs (sampler at 32, textures
    // from 64 — clear of the Params block at 0) and #define the combined
    // names back so frag bodies keep their WebGL-era texture(uTexN, uv)
    // calls verbatim.
    out.push_str("layout(binding = 32) uniform sampler _samp;\n");
    for (i, name) in pass_texture_names(spec, pass_index).iter().enumerate() {
        out.push_str(&format!(
            "layout(binding = {}) uniform texture2D {name}_t;\n",
            64 + i
        ));
        out.push_str(&format!("#define {name} sampler2D({name}_t, _samp)\n"));
    }
    // Strip the frag's own contract declarations (whole-line loose
    // uniforms and the vUv/fragColor io) — the header above replaces
    // them. Trailing same-line comments go with the line; standalone
    // continuation comments are harmless leftovers.
    for line in src.lines() {
        let t = line.trim_start();
        if t.starts_with("uniform ")
            || t.starts_with("in vec2 vUv")
            || t.starts_with("out vec4 fragColor")
        {
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }
    out
}

/// Mirror of glExecutor.ts's paramValue: enum -> option index (unknown
/// falls back to the default's index), bool -> 0/1, numbers clamped to
/// min/max (ints rounded), color handled separately.
fn scalar_param_value(p: &ParamSpec, v: Option<&serde_json::Value>) -> f64 {
    match p.kind.as_str() {
        "enum" => {
            let opts: &[String] = p.options.as_deref().unwrap_or(&[]);
            let idx = v
                .and_then(|v| v.as_str())
                .and_then(|s| opts.iter().position(|o| o == s))
                .or_else(|| {
                    p.default
                        .as_str()
                        .and_then(|s| opts.iter().position(|o| o == s))
                });
            idx.unwrap_or(0) as f64
        }
        "bool" => {
            let b = v
                .and_then(|v| v.as_bool())
                .unwrap_or(p.default.as_bool() == Some(true));
            if b {
                1.0
            } else {
                0.0
            }
        }
        _ => {
            let mut n = v
                .and_then(|v| v.as_f64())
                .filter(|n| n.is_finite())
                .or_else(|| p.default.as_f64())
                .unwrap_or(0.0);
            if !n.is_finite() {
                n = 0.0;
            }
            if let Some(min) = p.min {
                n = n.max(min);
            }
            if let Some(max) = p.max {
                n = n.min(max);
            }
            if p.kind == "int" {
                n = n.round();
            }
            n
        }
    }
}

/// "#rgb" / "#rrggbb" -> [r, g, b] in 0-1; anything else -> black.
/// Port of glExecutor.ts's colorVec3.
fn color_vec3(v: Option<&serde_json::Value>) -> [f32; 3] {
    let Some(s) = v.and_then(|v| v.as_str()) else {
        return [0.0; 3];
    };
    let hex = s.trim().strip_prefix('#').unwrap_or("");
    let expand = |h: &str| -> Option<[f32; 3]> {
        let full: String = if h.len() == 3 {
            h.chars().flat_map(|c| [c, c]).collect()
        } else if h.len() == 6 {
            h.to_string()
        } else {
            return None;
        };
        let byte = |i: usize| u8::from_str_radix(&full[i..i + 2], 16).ok();
        Some([
            byte(0)? as f32 / 255.0,
            byte(2)? as f32 / 255.0,
            byte(4)? as f32 / 255.0,
        ])
    };
    expand(hex).unwrap_or([0.0; 3])
}

/// Serialize a node's params into the std140 Params buffer.
fn write_params(
    spec: &EffectSpec,
    node_params: Option<&serde_json::Map<String, serde_json::Value>>,
    fields: &[FieldOffset],
    size: usize,
    out_w: u32,
    out_h: u32,
) -> Vec<u8> {
    let mut buf = vec![0u8; size];
    let put_f32 = |offset: usize, v: f32, buf: &mut Vec<u8>| {
        buf[offset..offset + 4].copy_from_slice(&v.to_le_bytes());
    };
    for (i, f) in fields.iter().enumerate() {
        if i == 0 {
            put_f32(f.offset, out_w as f32, &mut buf);
            put_f32(f.offset + 4, out_h as f32, &mut buf);
            continue;
        }
        let p = &spec.params[i - 1];
        let v = node_params.and_then(|m| m.get(&p.name));
        match f.kind.as_str() {
            "color" => {
                // Fall back to the manifest default like the scalar path
                // (mirrors glExecutor's `node.params?.[name] ?? p.default`).
                let [r, g, b] = color_vec3(v.or(Some(&p.default)));
                put_f32(f.offset, r, &mut buf);
                put_f32(f.offset + 4, g, &mut buf);
                put_f32(f.offset + 8, b, &mut buf);
            }
            "float" => put_f32(f.offset, scalar_param_value(p, v) as f32, &mut buf),
            _ => {
                let n = scalar_param_value(p, v) as i32;
                buf[f.offset..f.offset + 4].copy_from_slice(&n.to_le_bytes());
            }
        }
    }
    buf
}

/// Artwork placement on the page. Mirror of the fit modes composed by
/// FinishTab's preview compositor (src/components/finish/FinishTab.tsx):
/// bars/overflow background is black, input pixels are never modified
/// beyond the resample fill/fit require.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FitMode {
    /// Scale to cover, center-crop the overflow (default).
    Fill,
    /// Scale to contain, letterbox on black.
    Fit,
    /// Center at 100%: 1 artwork px = 1 output px, crop/pad on black.
    Place,
}

/// The FIRST output node's "fit" param ("fill" | "fit" | "place").
pub fn fit_mode(graph: &FinishGraphRs) -> FitMode {
    graph
        .nodes
        .iter()
        .find(|n| n.kind == "output")
        .map_or(FitMode::Fill, fit_of)
}

/// A specific output node's fit mode; unknown id falls back to the
/// first output.
pub fn fit_mode_for(graph: &FinishGraphRs, node_id: &str) -> FitMode {
    graph
        .nodes
        .iter()
        .find(|n| n.kind == "output" && n.id == node_id)
        .map_or_else(|| fit_mode(graph), fit_of)
}

fn fit_of(n: &super::GraphNodeRs) -> FitMode {
    match n
        .params
        .as_ref()
        .and_then(|p| p.get("fit"))
        .and_then(|v| v.as_str())
    {
        Some("fit") => FitMode::Fit,
        Some("place") => FitMode::Place,
        _ => FitMode::Fill,
    }
}

/// Cover-fit `img` to (w, h): scale to fill, center-crop the overflow.
fn cover_fit(img: &RgbaImage, w: u32, h: u32) -> RgbaImage {
    let (iw, ih) = img.dimensions();
    if iw == w && ih == h {
        return img.clone();
    }
    let scale = (w as f64 / iw as f64).max(h as f64 / ih as f64);
    let sw = (iw as f64 * scale).ceil().max(w as f64) as u32;
    let sh = (ih as f64 * scale).ceil().max(h as f64) as u32;
    let resized = image::imageops::resize(img, sw, sh, image::imageops::FilterType::CatmullRom);
    image::imageops::crop_imm(&resized, (sw - w) / 2, (sh - h) / 2, w, h).to_image()
}

/// Compose `img` onto a black (w, h) page per the fit mode.
pub fn place_fit(img: &RgbaImage, w: u32, h: u32, mode: FitMode) -> RgbaImage {
    let (iw, ih) = img.dimensions();
    match mode {
        FitMode::Fill => cover_fit(img, w, h),
        FitMode::Fit => {
            let scale = (w as f64 / iw as f64).min(h as f64 / ih as f64);
            let sw = ((iw as f64 * scale).round() as u32).clamp(1, w);
            let sh = ((ih as f64 * scale).round() as u32).clamp(1, h);
            let resized =
                image::imageops::resize(img, sw, sh, image::imageops::FilterType::CatmullRom);
            let mut out = RgbaImage::from_pixel(w, h, image::Rgba([0, 0, 0, 255]));
            image::imageops::overlay(
                &mut out,
                &resized,
                i64::from((w - sw) / 2),
                i64::from((h - sh) / 2),
            );
            out
        }
        FitMode::Place => {
            let cw = iw.min(w);
            let ch = ih.min(h);
            let cropped =
                image::imageops::crop_imm(img, (iw - cw) / 2, (ih - ch) / 2, cw, ch).to_image();
            let mut out = RgbaImage::from_pixel(w, h, image::Rgba([0, 0, 0, 255]));
            image::imageops::overlay(
                &mut out,
                &cropped,
                i64::from((w - cw) / 2),
                i64::from((h - ch) / 2),
            );
            out
        }
    }
}

const VERTEX_WGSL: &str = r#"
struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};
@vertex
fn main(@builtin(vertex_index) vi: u32) -> VSOut {
    var p = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    let xy = p[vi];
    var out: VSOut;
    // y negated: raster output keeps GL row order (see module header)
    out.pos = vec4<f32>(xy.x, -xy.y, 0.0, 1.0);
    out.uv = xy * 0.5 + 0.5;
    return out;
}
"#;

const BLIT_WGSL: &str = r#"
@group(0) @binding(0) var uTexIn: texture_2d<f32>;
@group(0) @binding(1) var uSamp: sampler;
@fragment
fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(uTexIn, uSamp, uv);
}
"#;

/// One resource binding of a compiled pass, reflected from the naga module.
#[derive(Debug, Clone)]
enum Slot {
    Uniform,
    Texture(String),
    Sampler,
}

struct PassPipeline {
    pipeline: wgpu::RenderPipeline,
    bgl: wgpu::BindGroupLayout,
    slots: Vec<(u32, Slot)>,
    fields: Vec<FieldOffset>,
    buf_size: usize,
}

/// Intermediate pass targets are Rgba16Float: the JPEG DCT passes emit
/// signed / out-of-range coefficients that Rgba8 would clamp (same ruling
/// as the WebGL executor's RGBA16F pool).
const POOL_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;
const IO_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

struct PoolTex {
    tex: wgpu::Texture,
    free: bool,
}

pub struct RenderEngine {
    device: wgpu::Device,
    queue: wgpu::Queue,
    /// Root of the shaders/ tree (dev default; Task 13 points it at the
    /// bundled resource dir).
    pub shader_root: PathBuf,
    vertex: wgpu::ShaderModule,
    sampler: wgpu::Sampler,
    /// Nearest-neighbor variant for scale nodes in "pixel" mode.
    sampler_nearest: wgpu::Sampler,
    pipelines: HashMap<String, PassPipeline>,
    blit: Option<(wgpu::RenderPipeline, wgpu::BindGroupLayout)>,
    /// Same copy shader, but targeting POOL_FORMAT (scale-node passes).
    blit_pool: Option<(wgpu::RenderPipeline, wgpu::BindGroupLayout)>,
    assets: HashMap<String, wgpu::Texture>,
}

impl RenderEngine {
    pub fn new() -> Result<Self, String> {
        let instance =
            wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            ..Default::default()
        }))
        .map_err(|e| format!("no GPU adapter: {e}"))?;
        // F4 export is 10571x15118 - above the 8192 default texture limit,
        // and its readback buffer (row-aligned 10571*4 x 15118 ~ 613 MiB)
        // is above the 256 MiB default buffer limit.
        let adapter_limits = adapter.limits();
        let defaults = wgpu::Limits::default();
        let limits = wgpu::Limits {
            max_texture_dimension_2d: adapter_limits.max_texture_dimension_2d.min(16384).max(8192),
            max_buffer_size: adapter_limits
                .max_buffer_size
                .min(1 << 30)
                .max(defaults.max_buffer_size),
            ..defaults
        };
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("panopus-finish"),
            required_features: wgpu::Features::empty(),
            required_limits: limits,
            ..Default::default()
        }))
        .map_err(|e| format!("request_device: {e}"))?;
        let vertex = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("finish-vertex"),
            source: wgpu::ShaderSource::Wgsl(VERTEX_WGSL.into()),
        });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("finish-sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let sampler_nearest = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("finish-sampler-nearest"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        Ok(Self {
            device,
            queue,
            shader_root: shaders_dir(None),
            vertex,
            sampler,
            sampler_nearest,
            pipelines: HashMap::new(),
            blit: None,
            blit_pool: None,
            assets: HashMap::new(),
        })
    }

    /// Compile one effect pass: GLSL -> naga -> WGSL -> pipeline, with
    /// reflected binding slots. Cached per effect/pass; call before
    /// borrowing the entry from `pipelines`.
    fn ensure_pass_pipeline(
        &mut self,
        spec: &EffectSpec,
        pass_index: usize,
    ) -> Result<(), String> {
        let key = format!("{}/{}", spec.id, pass_index);
        if !self.pipelines.contains_key(&key) {
            let frag_path = self
                .shader_root
                .join(&spec.id)
                .join(&spec.passes[pass_index].frag);
            let src = std::fs::read_to_string(&frag_path)
                .map_err(|e| format!("{}: {e}", frag_path.display()))?;
            let full = compose_glsl(spec, pass_index, &src);

            let mut frontend = naga::front::glsl::Frontend::default();
            let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
            let module = frontend
                .parse(&options, &full)
                .map_err(|e| format!("{key}: {}", e.emit_to_string(&full)))?;

            let info = naga::valid::Validator::new(
                naga::valid::ValidationFlags::all(),
                naga::valid::Capabilities::all(),
            )
            .validate(&module)
            .map_err(|e| format!("{key}: validation: {e}"))?;
            let wgsl = naga::back::wgsl::write_string(
                &module,
                &info,
                naga::back::wgsl::WriterFlags::empty(),
            )
            .map_err(|e| format!("{key}: wgsl-out: {e}"))?;

            // Reflect the bind group from the parsed module.
            let mut slots: Vec<(u32, Slot)> = Vec::new();
            for (_, var) in module.global_variables.iter() {
                let Some(b) = &var.binding else { continue };
                let slot = match module.types[var.ty].inner {
                    naga::TypeInner::Image { .. } => {
                        Slot::Texture(var.name.clone().unwrap_or_default())
                    }
                    naga::TypeInner::Sampler { .. } => Slot::Sampler,
                    _ => Slot::Uniform,
                };
                slots.push((b.binding, slot));
            }
            slots.sort_by_key(|(b, _)| *b);

            let entries: Vec<wgpu::BindGroupLayoutEntry> = slots
                .iter()
                .map(|(binding, slot)| wgpu::BindGroupLayoutEntry {
                    binding: *binding,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: match slot {
                        Slot::Uniform => wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        Slot::Texture(_) => wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        Slot::Sampler => {
                            wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering)
                        }
                    },
                    count: None,
                })
                .collect();
            let bgl = self
                .device
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some(&key),
                    entries: &entries,
                });
            let frag_module = self
                .device
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some(&key),
                    source: wgpu::ShaderSource::Wgsl(wgsl.into()),
                });
            let layout = self
                .device
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some(&key),
                    bind_group_layouts: &[Some(&bgl)],
                    immediate_size: 0,
                });
            let pipeline = self
                .device
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some(&key),
                    layout: Some(&layout),
                    vertex: wgpu::VertexState {
                        module: &self.vertex,
                        entry_point: Some("main"),
                        compilation_options: Default::default(),
                        buffers: &[],
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &frag_module,
                        entry_point: Some("main"),
                        compilation_options: Default::default(),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: POOL_FORMAT,
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
            let (fields, buf_size) = params_layout(spec);
            self.pipelines.insert(
                key.clone(),
                PassPipeline {
                    pipeline,
                    bgl,
                    slots,
                    fields,
                    buf_size,
                },
            );
        }
        Ok(())
    }

    /// Reuse a free target from the size's pool or grow it.
    fn acquire_pool(
        device: &wgpu::Device,
        pools: &mut HashMap<(u32, u32), Vec<PoolTex>>,
        size: (u32, u32),
    ) -> usize {
        let pool = pools.entry(size).or_default();
        if let Some(i) = pool.iter().position(|p| p.free) {
            pool[i].free = false;
            return i;
        }
        let tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("finish-pool"),
            size: wgpu::Extent3d {
                width: size.0,
                height: size.1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: POOL_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        pool.push(PoolTex { tex, free: false });
        pool.len() - 1
    }

    fn ensure_blit_pipeline(&mut self) {
        if self.blit.is_none() {
            self.blit = Some(self.make_blit_pipeline(IO_FORMAT, "finish-blit"));
        }
    }

    fn ensure_blit_pool_pipeline(&mut self) {
        if self.blit_pool.is_none() {
            self.blit_pool = Some(self.make_blit_pipeline(POOL_FORMAT, "finish-blit-pool"));
        }
    }

    fn make_blit_pipeline(
        &self,
        format: wgpu::TextureFormat,
        label: &str,
    ) -> (wgpu::RenderPipeline, wgpu::BindGroupLayout) {
        {
            let bgl = self
                .device
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some(label),
                    entries: &[
                        wgpu::BindGroupLayoutEntry {
                            binding: 0,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                                view_dimension: wgpu::TextureViewDimension::D2,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 1,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                            count: None,
                        },
                    ],
                });
            let module = self
                .device
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("finish-blit"),
                    source: wgpu::ShaderSource::Wgsl(BLIT_WGSL.into()),
                });
            let layout = self
                .device
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("finish-blit"),
                    bind_group_layouts: &[Some(&bgl)],
                    immediate_size: 0,
                });
            let pipeline = self
                .device
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("finish-blit"),
                    layout: Some(&layout),
                    vertex: wgpu::VertexState {
                        module: &self.vertex,
                        entry_point: Some("main"),
                        compilation_options: Default::default(),
                        buffers: &[],
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &module,
                        entry_point: Some("main"),
                        compilation_options: Default::default(),
                        targets: &[Some(wgpu::ColorTargetState {
                            format,
                            blend: None,
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                    }),
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    multiview_mask: None,
                    cache: None,
                });
            (pipeline, bgl)
        }
    }

    fn upload_rgba(&self, img: &RgbaImage, label: &str) -> wgpu::Texture {
        let (w, h) = img.dimensions();
        let tex = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some(label),
            size: wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: IO_FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        self.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &tex,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            img.as_raw(),
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(4 * w),
                rows_per_image: Some(h),
            },
            wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
        );
        tex
    }

    /// Effect texture asset (e.g. dither's glyph atlas), flipped to GL
    /// orientation on upload like the WebGL executor. Cached.
    fn asset_texture(&mut self, effect_id: &str, file: &str) -> Result<wgpu::Texture, String> {
        let key = format!("{effect_id}/{file}");
        if let Some(t) = self.assets.get(&key) {
            return Ok(t.clone());
        }
        let path = self.shader_root.join(effect_id).join(file);
        let img = image::open(&path)
            .map_err(|e| format!("{}: {e}", path.display()))?
            .to_rgba8();
        let flipped = image::imageops::flip_vertical(&img);
        let tex = self.upload_rgba(&flipped, &key);
        self.assets.insert(key.clone(), tex.clone());
        Ok(tex)
    }

    /// Back-compat wrapper: render the chain, then place the FIRST
    /// output's tail onto an out_w x out_h page (fit/fill/place from
    /// that node's settings).
    pub fn render_graph(
        &mut self,
        graph: &FinishGraphRs,
        sources: &HashMap<String, RgbaImage>,
        effects: &HashMap<String, EffectSpec>,
        out_w: u32,
        out_h: u32,
    ) -> Result<RgbaImage, String> {
        let tails = self.render_chain(graph, sources, &HashMap::new(), effects)?;
        let first = graph
            .nodes
            .iter()
            .find(|n| n.kind == "output")
            .ok_or("graph has no output node")?;
        let tail = tails
            .get(&first.id)
            .ok_or("output tail missing from chain render")?;
        Ok(place_fit(tail, out_w, out_h, fit_mode(graph)))
    }

    /// Render the chain at the source's native resolution and read back
    /// each OUTPUT node's input ("tail") as an RGBA8 image at chain
    /// resolution — one deliverable per output node; placement onto
    /// pages is the caller's move (place_fit + per-node settings).
    pub fn render_chain(
        &mut self,
        graph: &FinishGraphRs,
        sources: &HashMap<String, RgbaImage>,
        rasters: &HashMap<String, RgbaImage>,
        effects: &HashMap<String, EffectSpec>,
    ) -> Result<HashMap<String, RgbaImage>, String> {
        use wgpu::util::DeviceExt;

        let order = execution_order(graph);
        // Per-node resolutions (D2): sources native (device-cap), scale
        // nodes change it, everything else inherits its first input.
        const CAP: f64 = 16384.0;
        let source_dims: HashMap<String, (u32, u32)> = graph
            .nodes
            .iter()
            .filter(|n| n.kind == "source")
            .filter_map(|n| sources.get(&n.id).map(|img| (n.id.clone(), img.dimensions())))
            .collect();
        let resolutions = super::node_resolutions(graph, &source_dims, CAP as u32);
        let res_of = |id: &str| resolutions.get(id).copied().unwrap_or((8, 8));
        let black = self.upload_rgba(&RgbaImage::from_pixel(1, 1, image::Rgba([0, 0, 0, 255])), "black");
        // Unwired effect inputs bind TRANSPARENT black so composite-over
        // of an absent layer is a no-op (mirrors glExecutor's `clear`).
        let clear = self.upload_rgba(&RgbaImage::from_pixel(1, 1, image::Rgba([0, 0, 0, 0])), "clear");
        // Text-node rasters, bound as that node's uTex1 (D3).
        let raster_tex: HashMap<String, wgpu::Texture> = rasters
            .iter()
            .map(|(id, img)| {
                let flipped = image::imageops::flip_vertical(img);
                (id.clone(), self.upload_rgba(&flipped, id))
            })
            .collect();

        // Node output textures (kept alive until their consumers ran).
        let mut node_out: HashMap<String, wgpu::Texture> = HashMap::new();
        // Remaining consumer count per producer, over the reachable set.
        let in_order: std::collections::HashSet<&str> =
            order.iter().map(|s| s.as_str()).collect();
        let mut consumers: HashMap<&str, usize> = HashMap::new();
        for w in &graph.wires {
            if in_order.contains(w.from.as_str()) && in_order.contains(w.to.as_str()) {
                *consumers.entry(w.from.as_str()).or_insert(0) += 1;
            }
        }
        // Size-keyed pools of Rgba16Float pass targets, reused once freed
        // (per-node resolutions mean several sizes live in one render).
        let mut pools: HashMap<(u32, u32), Vec<PoolTex>> = HashMap::new();
        // node id -> (size, pool index), for release when consumers are done.
        let mut node_pool: HashMap<String, ((u32, u32), usize)> = HashMap::new();

        let input_tex = |graph: &FinishGraphRs,
                         node_out: &HashMap<String, wgpu::Texture>,
                         id: &str,
                         slot: u32,
                         black: &wgpu::Texture| {
            graph
                .wires
                .iter()
                .find(|w| w.to == id && w.to_in == slot)
                .and_then(|w| node_out.get(&w.from))
                .unwrap_or(black)
                .clone()
        };

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("finish-graph"),
            });

        let mut tail_bufs: Vec<(String, wgpu::Buffer, (u32, u32))> = Vec::new();
        let by_id: HashMap<&str, &super::GraphNodeRs> =
            graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();

        for id in &order {
            let node = by_id
                .get(id.as_str())
                .ok_or_else(|| format!("unknown node {id}"))?;
            match node.kind.as_str() {
                "source" => {
                    let img = sources
                        .get(id)
                        .ok_or_else(|| format!("no source image for node {id}"))?;
                    // Uploaded unmodified — placement is the output stage.
                    // (Only exception: shrink to the device texture cap.)
                    let (iw, ih) = img.dimensions();
                    let flipped = if iw.max(ih) as f64 > CAP {
                        let s = CAP / f64::from(iw.max(ih));
                        let rw = ((f64::from(iw) * s).round() as u32).max(1);
                        let rh = ((f64::from(ih) * s).round() as u32).max(1);
                        let small = image::imageops::resize(
                            img,
                            rw,
                            rh,
                            image::imageops::FilterType::CatmullRom,
                        );
                        image::imageops::flip_vertical(&small)
                    } else {
                        image::imageops::flip_vertical(img)
                    };
                    node_out.insert(id.clone(), self.upload_rgba(&flipped, id));
                }
                "output" => {
                    let (ow, oh) = res_of(id);
                    let input = input_tex(graph, &node_out, id, 0, &black);
                    let tex = self.device.create_texture(&wgpu::TextureDescriptor {
                        label: Some("finish-out"),
                        size: wgpu::Extent3d {
                            width: ow,
                            height: oh,
                            depth_or_array_layers: 1,
                        },
                        mip_level_count: 1,
                        sample_count: 1,
                        dimension: wgpu::TextureDimension::D2,
                        format: IO_FORMAT,
                        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                            | wgpu::TextureUsages::COPY_SRC,
                        view_formats: &[],
                    });
                    {
                        self.ensure_blit_pipeline();
                        let (pipeline, bgl) = self.blit.as_ref().unwrap();
                        let bind = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some("finish-blit"),
                            layout: bgl,
                            entries: &[
                                wgpu::BindGroupEntry {
                                    binding: 0,
                                    resource: wgpu::BindingResource::TextureView(
                                        &input.create_view(&Default::default()),
                                    ),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 1,
                                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                                },
                            ],
                        });
                        let view = tex.create_view(&Default::default());
                        let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                            label: Some("finish-blit"),
                            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                view: &view,
                                resolve_target: None,
                                ops: wgpu::Operations {
                                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                                    store: wgpu::StoreOp::Store,
                                },
                                depth_slice: None,
                            })],
                            depth_stencil_attachment: None,
                            timestamp_writes: None,
                            occlusion_query_set: None,
                            multiview_mask: None,
                        });
                        rp.set_pipeline(pipeline);
                        rp.set_bind_group(0, &bind, &[]);
                        rp.draw(0..3, 0..1);
                    }
                    // Queue this output's readback (one buffer per output;
                    // all copies ride the same encoder/submit).
                    let bpr = (ow * 4 + 255) & !255;
                    let buf = self.device.create_buffer(&wgpu::BufferDescriptor {
                        label: Some("finish-readback"),
                        size: bpr as u64 * oh as u64,
                        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                        mapped_at_creation: false,
                    });
                    encoder.copy_texture_to_buffer(
                        wgpu::TexelCopyTextureInfo {
                            texture: &tex,
                            mip_level: 0,
                            origin: wgpu::Origin3d::ZERO,
                            aspect: wgpu::TextureAspect::All,
                        },
                        wgpu::TexelCopyBufferInfo {
                            buffer: &buf,
                            layout: wgpu::TexelCopyBufferLayout {
                                offset: 0,
                                bytes_per_row: Some(bpr),
                                rows_per_image: Some(oh),
                            },
                        },
                        wgpu::Extent3d {
                            width: ow,
                            height: oh,
                            depth_or_array_layers: 1,
                        },
                    );
                    tail_bufs.push((id.clone(), buf, (ow, oh)));
                }
                "scale" => {
                    // Resampling blit: input -> a pool target at this
                    // node's resolution, linear or nearest per filter.
                    let (nw, nh) = res_of(id);
                    let input = input_tex(graph, &node_out, id, 0, &clear);
                    let nearest = node
                        .params
                        .as_ref()
                        .and_then(|p| p.get("filter"))
                        .and_then(|v| v.as_str())
                        == Some("pixel");
                    self.ensure_blit_pool_pipeline();
                    let target_idx =
                        Self::acquire_pool(&self.device, &mut pools, (nw, nh));
                    {
                        let (pipeline, bgl) = self.blit_pool.as_ref().unwrap();
                        let bind = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some("finish-scale"),
                            layout: bgl,
                            entries: &[
                                wgpu::BindGroupEntry {
                                    binding: 0,
                                    resource: wgpu::BindingResource::TextureView(
                                        &input.create_view(&Default::default()),
                                    ),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 1,
                                    resource: wgpu::BindingResource::Sampler(if nearest {
                                        &self.sampler_nearest
                                    } else {
                                        &self.sampler
                                    }),
                                },
                            ],
                        });
                        let view = pools[&(nw, nh)][target_idx]
                            .tex
                            .create_view(&Default::default());
                        let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                            label: Some("finish-scale"),
                            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                view: &view,
                                resolve_target: None,
                                ops: wgpu::Operations {
                                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                                    store: wgpu::StoreOp::Store,
                                },
                                depth_slice: None,
                            })],
                            depth_stencil_attachment: None,
                            timestamp_writes: None,
                            occlusion_query_set: None,
                            multiview_mask: None,
                        });
                        rp.set_pipeline(pipeline);
                        rp.set_bind_group(0, &bind, &[]);
                        rp.draw(0..3, 0..1);
                    }
                    node_out.insert(id.clone(), pools[&(nw, nh)][target_idx].tex.clone());
                    node_pool.insert(id.clone(), ((nw, nh), target_idx));
                }
                "effect" | "text" => {
                    let (nw, nh) = res_of(id);
                    // Text nodes run the built-in "text" effect with the
                    // node's raster bound as uTex1 below.
                    let effect_id = if node.kind == "text" {
                        "text"
                    } else {
                        node.effect_id
                            .as_deref()
                            .ok_or_else(|| format!("effect node {id} without effectId"))?
                    };
                    let spec = effects
                        .get(effect_id)
                        .ok_or_else(|| format!("unknown effect: {effect_id}"))?
                        .clone();
                    let mut prev: Option<usize> = None;
                    for pi in 0..spec.passes.len() {
                        // Resolve the pass's textures before mutably
                        // borrowing self for the pipeline.
                        let mut asset_bindings: HashMap<String, wgpu::Texture> = HashMap::new();
                        if let Some(files) = spec.passes[pi].textures.as_ref() {
                            for f in files {
                                asset_bindings
                                    .insert(uniform_name(f), self.asset_texture(&spec.id, f)?);
                            }
                        }
                        self.ensure_pass_pipeline(&spec, pi)?;
                        let pass_key = format!("{}/{}", spec.id, pi);
                        let pp = &self.pipelines[&pass_key];
                        let params = write_params(
                            &spec,
                            node.params.as_ref(),
                            &pp.fields,
                            pp.buf_size,
                            nw,
                            nh,
                        );
                        let ubuf =
                            self.device
                                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                                    label: Some("finish-params"),
                                    contents: &params,
                                    usage: wgpu::BufferUsages::UNIFORM,
                                });
                        // Bind group entries per reflected slot.
                        let mut views: Vec<(u32, wgpu::TextureView)> = Vec::new();
                        for (binding, slot) in &pp.slots {
                            if let Slot::Texture(name) = slot {
                                // Image globals are the split-pair `<uniform>_t`
                                // declarations from compose_glsl.
                                let name = name.strip_suffix("_t").unwrap_or(name);
                                let tex: wgpu::Texture = if let Some(k) = name
                                    .strip_prefix("uTex")
                                    .and_then(|s| s.parse::<u32>().ok())
                                {
                                    if node.kind == "text" && k == 1 {
                                        raster_tex.get(id.as_str()).unwrap_or(&clear).clone()
                                    } else if pi == 0 {
                                        input_tex(graph, &node_out, id, k, &clear)
                                    } else if k == 0 {
                                        prev.map(|i| pools[&(nw, nh)][i].tex.clone())
                                            .unwrap_or_else(|| black.clone())
                                    } else {
                                        black.clone()
                                    }
                                } else if let Some(t) = asset_bindings.get(name) {
                                    t.clone()
                                } else {
                                    black.clone()
                                };
                                views.push((*binding, tex.create_view(&Default::default())));
                            }
                        }
                        let mut entries: Vec<wgpu::BindGroupEntry> = Vec::new();
                        let mut vi = 0usize;
                        for (binding, slot) in &pp.slots {
                            match slot {
                                Slot::Uniform => entries.push(wgpu::BindGroupEntry {
                                    binding: *binding,
                                    resource: ubuf.as_entire_binding(),
                                }),
                                Slot::Texture(_) => {
                                    entries.push(wgpu::BindGroupEntry {
                                        binding: *binding,
                                        resource: wgpu::BindingResource::TextureView(
                                            &views[vi].1,
                                        ),
                                    });
                                    vi += 1;
                                }
                                Slot::Sampler => entries.push(wgpu::BindGroupEntry {
                                    binding: *binding,
                                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                                }),
                            }
                        }
                        let bind = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some("finish-pass"),
                            layout: &pp.bgl,
                            entries: &entries,
                        });

                        // Acquire a pool target (reuse a free one).
                        let target_idx =
                            Self::acquire_pool(&self.device, &mut pools, (nw, nh));
                        {
                            let view = pools[&(nw, nh)][target_idx]
                                .tex
                                .create_view(&Default::default());
                            let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                                label: Some("finish-pass"),
                                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                    view: &view,
                                    resolve_target: None,
                                    ops: wgpu::Operations {
                                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                                        store: wgpu::StoreOp::Store,
                                    },
                                    depth_slice: None,
                                })],
                                depth_stencil_attachment: None,
                                timestamp_writes: None,
                                occlusion_query_set: None,
                                multiview_mask: None,
                            });
                            rp.set_pipeline(&self.pipelines[&format!("{}/{}", spec.id, pi)].pipeline);
                            rp.set_bind_group(0, &bind, &[]);
                            rp.draw(0..3, 0..1);
                        }
                        // Intra-effect ping-pong: the previous pass target
                        // is free once this pass consumed it.
                        if let Some(p) = prev {
                            pools.get_mut(&(nw, nh)).unwrap()[p].free = true;
                        }
                        prev = Some(target_idx);
                    }
                    let final_idx =
                        prev.ok_or_else(|| format!("effect {effect_id} has no passes"))?;
                    node_out.insert(id.clone(), pools[&(nw, nh)][final_idx].tex.clone());
                    node_pool.insert(id.clone(), ((nw, nh), final_idx));
                }
                other => return Err(format!("unknown node kind: {other}")),
            }
            // Release producers whose consumers have all run.
            for w in &graph.wires {
                if w.to == *id {
                    if let Some(c) = consumers.get_mut(w.from.as_str()) {
                        *c -= 1;
                        if *c == 0 {
                            if let Some((size, idx)) = node_pool.get(&w.from) {
                                pools.get_mut(size).unwrap()[*idx].free = true;
                            }
                            node_out.remove(&w.from);
                        }
                    }
                }
            }
        }

        if tail_bufs.is_empty() {
            return Err("graph has no output node".into());
        }
        self.queue.submit([encoder.finish()]);

        // Map every tail buffer, then read them all after one wait.
        let mut rxs = Vec::with_capacity(tail_bufs.len());
        for (_, buf, _) in &tail_bufs {
            let (tx, rx) = std::sync::mpsc::channel();
            buf.slice(..).map_async(wgpu::MapMode::Read, move |r| {
                let _ = tx.send(r);
            });
            rxs.push(rx);
        }
        self.device
            .poll(wgpu::PollType::Wait {
                submission_index: None,
                timeout: None,
            })
            .map_err(|e| format!("device poll: {e}"))?;
        let mut tails: HashMap<String, RgbaImage> = HashMap::new();
        for ((id, buf, (ow, oh)), rx) in tail_bufs.into_iter().zip(rxs) {
            rx.recv()
                .map_err(|e| format!("map channel: {e}"))?
                .map_err(|e| format!("map buffer: {e}"))?;
            let bpr = (ow * 4 + 255) & !255;
            let slice = buf.slice(..);
            let data = slice
                .get_mapped_range()
                .map_err(|e| format!("mapped range: {e}"))?;
            let mut pixels = Vec::with_capacity((ow * oh * 4) as usize);
            for row in 0..oh {
                let start = (row * bpr) as usize;
                pixels.extend_from_slice(&data[start..start + (ow * 4) as usize]);
            }
            drop(data);
            buf.unmap();
            let img = RgbaImage::from_raw(ow, oh, pixels)
                .ok_or("readback size mismatch")?;
            tails.insert(id, image::imageops::flip_vertical(&img));
        }
        Ok(tails)
    }
}
