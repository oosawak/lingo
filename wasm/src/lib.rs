use wasm_bindgen::prelude::*;

fn normalize_lang(code: &str) -> &str {
    match code {
        "ja" => "ja",
        "en" => "en",
        _ => "unknown",
    }
}

fn fallback_translate(text: &str, from: &str, to: &str) -> String {
    match (normalize_lang(from), normalize_lang(to)) {
        ("ja", "en") => format!("[JA→EN] {text}"),
        ("en", "ja") => format!("[EN→JA] {text}"),
        ("ja", "ja") | ("en", "en") => text.to_string(),
        _ => format!("[{from}→{to}] {text}"),
    }
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn translate(text: String, from: String, to: String) -> String {
    fallback_translate(&text, &from, &to)
}
