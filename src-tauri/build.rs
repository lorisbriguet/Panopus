fn main() {
  // CoreText linkage for the activation module (CTFontManager* FFI).
  println!("cargo:rustc-link-lib=framework=CoreText");
  tauri_build::build()
}
