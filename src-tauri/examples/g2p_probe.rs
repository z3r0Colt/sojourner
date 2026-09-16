// Diagnostic: print the phonemes the neural voice would say for each argument.
// This is the tool for deciding whether a spelling is readable at all -- a
// letter-spelled fallback shows up here as the letters' own phonemes.
//
//   cargo run --example g2p_probe -- "restoreth" "he restoreth my soul"
//   KOKORO_G2P_V11=1 cargo run --example g2p_probe -- "heshbon"
//   KOKORO_G2P_LEXICON=resources/kjv-g2p.tab cargo run --example g2p_probe -- ...

fn main() {
    let v11 = std::env::var("KOKORO_G2P_V11").ok().as_deref() == Some("1");
    for text in std::env::args().skip(1) {
        match kokoro_en::g2p_audit(&text, v11) {
            Ok(a) => println!("{text:?} -> {}", a.phonemes),
            Err(e) => println!("{text:?} -> ERROR {e}"),
        }
    }
}
