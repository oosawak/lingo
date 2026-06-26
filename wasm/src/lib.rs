use wasm_bindgen::prelude::*;

fn normalize_lang(code: &str) -> &str {
    match code {
        "ja" => "ja",
        "en" => "en",
        _ => "unknown",
    }
}

fn translate_ja_to_en(text: &str) -> String {
    let normalized = text.trim();
    let exact = [
        ("こんにちは", "Hello"),
        ("こんばんは", "Good evening"),
        ("おはよう", "Good morning"),
        ("ありがとう", "Thank you"),
        ("お願いします", "Please"),
        ("はじめまして", "Nice to meet you"),
        ("元気ですか", "How are you?"),
        ("了解", "Understood"),
        ("助かります", "That helps a lot"),
        ("よろしく", "Best regards"),
    ]
    .into_iter()
    .find_map(|(ja, en)| (normalized == ja).then_some(en));

    if let Some(translated) = exact {
        return translated.to_string();
    }

    normalized
        .replace("こんにちは", "Hello")
        .replace("ありがとう", "Thank you")
        .replace("お願いします", "Please")
        .replace("ですか", "?")
        .replace("です", " is")
        .replace("ます", "")
}

fn translate_en_to_ja(text: &str) -> String {
    let normalized = text.trim().to_lowercase();
    let exact = [
        ("hello", "こんにちは"),
        ("good evening", "こんばんは"),
        ("good morning", "おはよう"),
        ("thank you", "ありがとう"),
        ("please", "お願いします"),
        ("nice to meet you", "はじめまして"),
        ("how are you?", "元気ですか"),
        ("understood", "了解"),
        ("that helps a lot", "助かります"),
        ("best regards", "よろしく"),
    ]
    .into_iter()
    .find_map(|(en, ja)| (normalized == en).then_some(ja));

    if let Some(translated) = exact {
        return translated.to_string();
    }

    normalized
        .replace("good evening", "こんばんは")
        .replace("good morning", "おはよう")
        .replace("thank you", "ありがとう")
        .replace("please", "お願いします")
        .replace("hello", "こんにちは")
        .replace("how are you?", "元気ですか")
        .replace("understood", "了解")
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn translate(text: String, from: String, to: String) -> String {
    match (normalize_lang(from.as_str()), normalize_lang(to.as_str())) {
        ("ja", "en") => translate_ja_to_en(&text),
        ("en", "ja") => translate_en_to_ja(&text),
        ("ja", "ja") | ("en", "en") => text,
        _ => text,
    }
}
