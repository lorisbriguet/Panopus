//! Error-diffusion dithering for the Dithering node's CPU algos
//! (manifest cpuAlgos). Mirror of src/lib/errorDiffusion.ts — f64
//! arithmetic, identical serpentine traversal and taps, so the parity
//! harness can compare the two engines. Keep the two in lockstep.

struct Kernel {
    div: f64,
    /// (dx, dy, numerator) taps, dy >= 0; dx mirrored on serpentine rows.
    taps: &'static [(i32, i32, f64)],
}

fn kernel(algo: &str) -> Option<Kernel> {
    Some(match algo {
        "floydsteinberg" => Kernel {
            div: 16.0,
            taps: &[(1, 0, 7.0), (-1, 1, 3.0), (0, 1, 5.0), (1, 1, 1.0)],
        },
        "jjn" => Kernel {
            div: 48.0,
            taps: &[
                (1, 0, 7.0),
                (2, 0, 5.0),
                (-2, 1, 3.0),
                (-1, 1, 5.0),
                (0, 1, 7.0),
                (1, 1, 5.0),
                (2, 1, 3.0),
                (-2, 2, 1.0),
                (-1, 2, 3.0),
                (0, 2, 5.0),
                (1, 2, 3.0),
                (2, 2, 1.0),
            ],
        },
        "stucki" => Kernel {
            div: 42.0,
            taps: &[
                (1, 0, 8.0),
                (2, 0, 4.0),
                (-2, 1, 2.0),
                (-1, 1, 4.0),
                (0, 1, 8.0),
                (1, 1, 4.0),
                (2, 1, 2.0),
                (-2, 2, 1.0),
                (-1, 2, 2.0),
                (0, 2, 4.0),
                (1, 2, 2.0),
                (2, 2, 1.0),
            ],
        },
        "burkes" => Kernel {
            div: 32.0,
            taps: &[
                (1, 0, 8.0),
                (2, 0, 4.0),
                (-2, 1, 2.0),
                (-1, 1, 4.0),
                (0, 1, 8.0),
                (1, 1, 4.0),
                (2, 1, 2.0),
            ],
        },
        "sierra" => Kernel {
            div: 32.0,
            taps: &[
                (1, 0, 5.0),
                (2, 0, 3.0),
                (-2, 1, 2.0),
                (-1, 1, 4.0),
                (0, 1, 5.0),
                (1, 1, 4.0),
                (2, 1, 2.0),
                (-1, 2, 2.0),
                (0, 2, 3.0),
                (1, 2, 2.0),
            ],
        },
        // Diffuses only 6/8 of the error by design.
        "atkinson" => Kernel {
            div: 8.0,
            taps: &[
                (1, 0, 1.0),
                (2, 0, 1.0),
                (-1, 1, 1.0),
                (0, 1, 1.0),
                (1, 1, 1.0),
                (0, 2, 1.0),
            ],
        },
        _ => return None,
    })
}

/// Quantize a grayscale field (0..1, row-major w*h) to `levels` levels,
/// diffusing the error. Consumes `gray` as its scratch buffer. Unknown
/// algos quantize without diffusion (never reached: the manifest's
/// cpuAlgos gate what lands here).
pub fn diffuse(gray: &mut [f64], w: usize, h: usize, algo: &str, levels: i32) -> Vec<f64> {
    let k = kernel(algo);
    let l = (levels.max(2) - 1) as f64;
    let mut out = vec![0.0; w * h];
    for y in 0..h {
        let rtl = y % 2 == 1;
        for i in 0..w {
            let x = if rtl { w - 1 - i } else { i };
            let idx = y * w + x;
            let v = gray[idx].clamp(0.0, 1.0);
            let q = (v * l).round() / l;
            out[idx] = q;
            let err = v - q;
            if let Some(k) = &k {
                for &(dx0, dy, num) in k.taps {
                    let dx = if rtl { -dx0 } else { dx0 };
                    let nx = x as i64 + i64::from(dx);
                    let ny = y as i64 + i64::from(dy);
                    if nx < 0 || nx >= w as i64 || ny >= h as i64 {
                        continue;
                    }
                    gray[ny as usize * w + nx as usize] += err * num / k.div;
                }
            }
        }
    }
    out
}

/// Full RGBA pipeline: luma -> coarse grid (block-center sample, the GPU
/// snapping rule) -> diffuse -> ink mix; alpha rides through per-pixel.
#[allow(clippy::too_many_arguments)]
pub fn dither_rgba(
    rgba: &[u8],
    w: u32,
    h: u32,
    algo: &str,
    levels: i32,
    texel: u32,
    dark: [u8; 3],
    light: [u8; 3],
) -> Vec<u8> {
    let (w, h) = (w as usize, h as usize);
    let texel = texel.max(1) as usize;
    let cw = w.div_ceil(texel);
    let ch = h.div_ceil(texel);
    let mut gray = vec![0.0f64; cw * ch];
    for cy in 0..ch {
        for cx in 0..cw {
            let sx = (((cx as f64 + 0.5) * texel as f64).floor() as usize).min(w - 1);
            let sy = (((cy as f64 + 0.5) * texel as f64).floor() as usize).min(h - 1);
            let p = (sy * w + sx) * 4;
            gray[cy * cw + cx] = (0.2126 * f64::from(rgba[p])
                + 0.7152 * f64::from(rgba[p + 1])
                + 0.0722 * f64::from(rgba[p + 2]))
                / 255.0;
        }
    }
    let v = diffuse(&mut gray, cw, ch, algo, levels);
    let mix = |d: u8, l: u8, q: f64| -> u8 {
        (f64::from(d) + (f64::from(l) - f64::from(d)) * q).round() as u8
    };
    let mut out = vec![0u8; w * h * 4];
    for y in 0..h {
        let cy = (y / texel) * cw;
        for x in 0..w {
            let q = v[cy + x / texel];
            let o = (y * w + x) * 4;
            out[o] = mix(dark[0], light[0], q);
            out[o + 1] = mix(dark[1], light[1], q);
            out[o + 2] = mix(dark[2], light[2], q);
            out[o + 3] = rgba[o + 3];
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALGOS: [&str; 6] = [
        "floydsteinberg",
        "jjn",
        "stucki",
        "burkes",
        "sierra",
        "atkinson",
    ];

    // Same hand-computed vector as errorDiffusion.test.ts.
    #[test]
    fn floyd_steinberg_2x2_gray_checkerboards() {
        let out = diffuse(&mut [0.5, 0.5, 0.5, 0.5], 2, 2, "floydsteinberg", 2);
        assert_eq!(out, vec![1.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn deterministic_and_in_range() {
        let (w, h) = (17, 13);
        let mut src = vec![0.0; w * h];
        let mut s: i64 = 42;
        for v in &mut src {
            s = (s * 1_103_515_245 + 12_345) & 0x7fff_ffff;
            *v = (s % 1000) as f64 / 999.0;
        }
        for algo in ALGOS {
            let a = diffuse(&mut src.clone(), w, h, algo, 2);
            let b = diffuse(&mut src.clone(), w, h, algo, 2);
            assert_eq!(a, b, "{algo}");
            assert!(a.iter().all(|&v| v == 0.0 || v == 1.0), "{algo}");
        }
    }

    #[test]
    fn full_kernels_preserve_mean() {
        let (w, h) = (64, 64);
        let src = vec![0.37; w * h];
        for algo in ALGOS {
            if algo == "atkinson" {
                continue;
            }
            let out = diffuse(&mut src.clone(), w, h, algo, 2);
            let mean = out.iter().sum::<f64>() / out.len() as f64;
            assert!((mean - 0.37).abs() < 0.05, "{algo}: mean {mean}");
        }
    }

    #[test]
    fn representable_levels_pass_through() {
        let out = diffuse(&mut vec![0.5; 16], 4, 4, "stucki", 3);
        assert_eq!(out, vec![0.5; 16]);
    }

    #[test]
    fn dither_rgba_mixes_inks_and_keeps_alpha() {
        // Mirrors the TS test: texel 2 -> one coarse cell sampled at the
        // block center (white) -> light ink everywhere, alpha per-pixel.
        let rgba: [u8; 16] = [
            0, 0, 0, 255, 255, 255, 255, 200, 255, 255, 255, 10, 255, 255, 255, 77,
        ];
        let out = dither_rgba(
            &rgba,
            2,
            2,
            "floydsteinberg",
            2,
            2,
            [0, 0, 0],
            [255, 32, 64],
        );
        assert_eq!(&out[0..4], &[255, 32, 64, 255]);
        assert_eq!(out[7], 200);
        assert_eq!(out[11], 10);
        assert_eq!(out[15], 77);
    }
}
