//! Writes the web build's command dispatcher from the desktop app's own
//! command files, so that a new `#[tauri::command]` reaches the web without
//! anyone remembering to add it.
//!
//! Reads every file in `src-tauri/src/commands/` and the command list in
//! `generate_handler![...]` (src-tauri/src/lib.rs), and writes
//! `$OUT_DIR/commands.rs`: one inline module per command file holding the
//! parts of it that can run in a browser, and a `dispatch()` that turns
//! `(name, {camelCaseArgs})` into a call, as Tauri's IPC does.
//!
//! What runs in a browser:
//! - A command that is not `async` and takes nothing from Tauri but
//!   `State<DbState>`: copied with its body unchanged. `tauri::State` becomes
//!   `crate::shim::State`, which derefs to the worker's own `DbState`.
//! - An `async` command whose body lives in a synchronous twin named
//!   `<command>_blocking` (it takes `State<DbState>` and the same arguments;
//!   see `commands::search::search_blocking`): the web calls the twin.
//! - Helper items (functions, consts, types) the kept commands use, unless
//!   they reach for something desktop-only.
//!
//! Everything else -- a command that needs an `AppHandle`, a window, the
//! file dialogs, or a desktop-only module (`crate::backup`, `crate::export`,
//! `crate::pack`...) -- is left out, and listed in `NOT_GENERATED`. Each one
//! needs a hand-written web version or a deliberate "unavailable" in
//! `src/stand_ins.rs`; a test there fails until it has one.
//!
//! `use` items are kept only where something kept refers to what they
//! import, so a desktop-only import never reaches the compiler.

use proc_macro2::{TokenStream, TokenTree};
use quote::{format_ident, quote};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use syn::visit::Visit;
use syn::visit_mut::VisitMut;
use syn::{FnArg, Item, ItemFn, Pat, ReturnType, Type, UseTree};

/// Names whose presence marks an item as desktop-only: Tauri's handles and
/// the app modules that need them.
const DESKTOP_ONLY_NAMES: &[&str] = &[
    "AppHandle",
    "Window",
    "Webview",
    "WebviewWindow",
    "Manager",
    "Emitter",
    "PickedPaths",
    "AppDataDir",
    "async_runtime",
    // Desktop-only crates, which a function may `use` inside its body.
    "winreg",
];

/// `crate::<module>` paths that resolve in the web crate: the core crate's
/// modules, re-exported under the same names, and `commands` itself.
const WEB_CRATE_MODULES: &[&str] = &[
    "citations",
    "color_text",
    "commands",
    "db",
    "error",
    "import",
    "library",
    "models",
    "morph",
    "paths",
    "plain",
    "refparse",
    "text",
];

/// `crate::paths::<name>` items that the core crate has (the rest of the
/// app's `paths` needs an `AppHandle`).
const CORE_PATHS: &[&str] = &["is_reader_import", "safe_child"];

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let app_src = manifest.join("../../src");
    let commands_dir = app_src.join("commands");
    println!("cargo:rerun-if-changed={}", commands_dir.display());
    println!("cargo:rerun-if-changed={}", app_src.join("lib.rs").display());

    let registered = registered_commands(&app_src.join("lib.rs"));

    let mut files: Vec<PathBuf> = fs::read_dir(&commands_dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "rs"))
        .collect();
    files.sort();

    let mut modules = Vec::new();
    let mut root_items = Vec::new();
    let mut arms = Vec::new();
    let mut generated = BTreeSet::new();
    for path in &files {
        let module = path.file_stem().unwrap().to_string_lossy().to_string();
        let source = fs::read_to_string(path).unwrap();
        let file: syn::File = syn::parse_file(&source).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        let out = filter_file(&module, file, &registered);
        if module == "mod" {
            root_items = out.items;
            continue;
        }
        let ident = format_ident!("{}", module);
        let items = out.items;
        let attrs = out.inner_attrs;
        let mut fns = Vec::new();
        for (name, target, sig) in &out.commands {
            let handler = format_ident!("__web_{}", name);
            fns.push(dispatch_fn(&handler, name, target, sig));
            arms.push(quote! { #name => Ok(#ident::#handler(db, args)), });
            generated.insert(name.clone());
        }
        modules.push(quote! {
            pub mod #ident {
                #(#attrs)*
                #![allow(unused_imports, dead_code, clippy::all)]
                #(#items)*
                #(#fns)*
            }
        });
    }

    let generated_names: Vec<&String> = generated.iter().collect();
    let not_generated: Vec<&String> = registered.iter().filter(|n| !generated.contains(*n)).collect();
    let registered_names: Vec<&String> = registered.iter().collect();
    let tokens = quote! {
        #(#root_items)*
        #(#modules)*

        /// Every command the desktop app registers, in `generate_handler!`.
        pub const DESKTOP_COMMANDS: &[&str] = &[#(#registered_names),*];
        /// The commands this file runs, with their desktop bodies.
        pub const GENERATED: &[&str] = &[#(#generated_names),*];
        /// The desktop's commands that need a hand-written web version or a
        /// deliberate "unavailable" (`crate::stand_ins`).
        pub const NOT_GENERATED: &[&str] = &[#(#not_generated),*];

        /// Runs `cmd` with its arguments as the page sent them (an object
        /// with camelCase keys), or gives `args` back if `cmd` is not one of
        /// [`GENERATED`].
        pub fn dispatch(
            db: &crate::db::DbState,
            cmd: &str,
            args: ::serde_json::Value,
        ) -> Result<crate::reply::Reply, ::serde_json::Value> {
            match cmd {
                #(#arms)*
                _ => Err(args),
            }
        }
    };
    let file: syn::File = syn::parse2(tokens).expect("generated code parses");
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("commands.rs");
    fs::write(&out, prettyplease::unparse(&file)).unwrap();
}

/// The names in `tauri::generate_handler![...]`, in order.
fn registered_commands(lib_rs: &Path) -> Vec<String> {
    struct Finder(Vec<String>);
    impl<'ast> Visit<'ast> for Finder {
        fn visit_macro(&mut self, mac: &'ast syn::Macro) {
            if mac.path.segments.last().is_some_and(|s| s.ident == "generate_handler") {
                let paths = mac
                    .parse_body_with(syn::punctuated::Punctuated::<syn::Path, syn::Token![,]>::parse_terminated)
                    .expect("generate_handler! lists paths");
                self.0.extend(paths.iter().map(|p| p.segments.last().unwrap().ident.to_string()));
            }
            syn::visit::visit_macro(self, mac);
        }
    }
    let file = syn::parse_file(&fs::read_to_string(lib_rs).unwrap()).unwrap();
    let mut finder = Finder(Vec::new());
    finder.visit_file(&file);
    assert!(!finder.0.is_empty(), "no generate_handler! in {}", lib_rs.display());
    let unique: BTreeSet<&String> = finder.0.iter().collect();
    assert_eq!(unique.len(), finder.0.len(), "a command is registered twice");
    finder.0
}

struct Filtered {
    inner_attrs: Vec<syn::Attribute>,
    items: Vec<Item>,
    /// (command name, function the web calls, its signature)
    commands: Vec<(String, String, syn::Signature)>,
}

/// One flattened `use` leaf: `use <path>::<name> as <alias>;`, or a glob.
struct UseLeaf {
    vis: syn::Visibility,
    path: Vec<String>,
    name: Option<String>,
    alias: Option<String>,
}

impl UseLeaf {
    /// The name this brings into scope (`None` for a glob).
    fn binding(&self) -> Option<String> {
        match (&self.alias, &self.name) {
            (Some(a), _) => Some(a.clone()),
            (None, Some(n)) if n == "self" => self.path.last().cloned(),
            (None, Some(n)) => Some(n.clone()),
            (None, None) => None,
        }
    }

    /// Whether this resolves in the web crate.
    fn resolves(&self) -> bool {
        let full: Vec<&str> = self.path.iter().map(String::as_str).chain(self.name.as_deref()).collect();
        match full.as_slice() {
            ["tauri", "State"] => true,
            ["tauri", ..] => false,
            [first, ..] if first.starts_with("tauri_") => false,
            ["crate", "paths", name, ..] => CORE_PATHS.contains(name),
            ["crate", "commands", "file_picker", ..] => false,
            ["crate", module, ..] => WEB_CRATE_MODULES.contains(module),
            ["winreg", ..] => false,
            _ => true,
        }
    }

    fn to_item(&self) -> Item {
        let vis = &self.vis;
        let mut path: Vec<proc_macro2::Ident> = self.path.iter().map(|s| format_ident!("{}", s)).collect();
        // `tauri::State` is the shim's.
        if self.path == ["tauri"] && self.name.as_deref() == Some("State") {
            path = vec![format_ident!("crate"), format_ident!("shim")];
        }
        let tail = match (&self.name, &self.alias) {
            (None, _) => quote!(*),
            (Some(n), None) => {
                let n = syn::Ident::new(if n == "self" { "self" } else { n }, proc_macro2::Span::call_site());
                quote!(#n)
            }
            (Some(n), Some(a)) => {
                let (n, a) = (format_ident!("{}", n), format_ident!("{}", a));
                quote!(#n as #a)
            }
        };
        if self.name.as_deref() == Some("self") {
            let alias = self.alias.as_ref().map(|a| {
                let a = format_ident!("{}", a);
                quote!(as #a)
            });
            return syn::parse_quote!(#vis use #(#path)::* #alias;);
        }
        syn::parse_quote!(#vis use #(#path::)* #tail;)
    }
}

fn flatten_use(vis: &syn::Visibility, prefix: &mut Vec<String>, tree: &UseTree, out: &mut Vec<UseLeaf>) {
    match tree {
        UseTree::Path(p) => {
            prefix.push(p.ident.to_string());
            flatten_use(vis, prefix, &p.tree, out);
            prefix.pop();
        }
        UseTree::Name(n) => out.push(UseLeaf { vis: vis.clone(), path: prefix.clone(), name: Some(n.ident.to_string()), alias: None }),
        UseTree::Rename(r) => out.push(UseLeaf {
            vis: vis.clone(),
            path: prefix.clone(),
            name: Some(r.ident.to_string()),
            alias: Some(r.rename.to_string()),
        }),
        UseTree::Glob(_) => out.push(UseLeaf { vis: vis.clone(), path: prefix.clone(), name: None, alias: None }),
        UseTree::Group(g) => {
            for t in &g.items {
                flatten_use(vis, prefix, t, out);
            }
        }
    }
}

/// Every identifier in a token stream, at any depth.
fn idents(tokens: TokenStream, out: &mut BTreeSet<String>) {
    for t in tokens {
        match t {
            TokenTree::Ident(i) => {
                out.insert(i.to_string());
            }
            TokenTree::Group(g) => idents(g.stream(), out),
            _ => {}
        }
    }
}

fn item_idents(item: &Item) -> BTreeSet<String> {
    let mut set = BTreeSet::new();
    idents(quote!(#item), &mut set);
    set
}

fn is_cfg_test(attrs: &[syn::Attribute]) -> bool {
    attrs.iter().any(|a| a.path().is_ident("cfg") && quote!(#a).to_string().contains("test"))
}

fn is_command_attr(a: &syn::Attribute) -> bool {
    let segs: Vec<String> = a.path().segments.iter().map(|s| s.ident.to_string()).collect();
    if segs == ["tauri", "command"] {
        assert!(
            matches!(a.meta, syn::Meta::Path(_)),
            "#[tauri::command(...)] with options is not handled by the web dispatcher yet: {}",
            quote!(#a)
        );
        return true;
    }
    false
}

/// Whether `ty` is `State<DbState>` (or `tauri::State<'_, DbState>`).
fn is_db_state(ty: &Type) -> bool {
    let Type::Path(p) = ty else { return false };
    let Some(last) = p.path.segments.last() else { return false };
    if last.ident != "State" {
        return false;
    }
    let syn::PathArguments::AngleBracketed(args) = &last.arguments else { return false };
    args.args.iter().any(|a| match a {
        syn::GenericArgument::Type(Type::Path(t)) => t.path.segments.last().is_some_and(|s| s.ident == "DbState"),
        _ => false,
    })
}

/// A signature the dispatcher can call: synchronous, and every argument
/// either `State<DbState>` or a plain value named by a simple identifier.
fn callable_on_web(sig: &syn::Signature) -> bool {
    if sig.asyncness.is_some() {
        return false;
    }
    sig.inputs.iter().all(|arg| match arg {
        FnArg::Receiver(_) => false,
        FnArg::Typed(pt) => {
            if !matches!(&*pt.pat, Pat::Ident(_)) {
                return false;
            }
            if is_db_state(&pt.ty) {
                return true;
            }
            let ty = &pt.ty;
            let mut set = BTreeSet::new();
            idents(quote!(#ty), &mut set);
            !set.contains("State") && !DESKTOP_ONLY_NAMES.iter().any(|n| set.contains(*n))
        }
    })
}

fn filter_file(module: &str, file: syn::File, registered: &[String]) -> Filtered {
    let mut uses = Vec::new();
    let mut others: Vec<Item> = Vec::new();
    for item in file.items {
        match item {
            Item::Use(u) => flatten_use(&u.vis, &mut Vec::new(), &u.tree, &mut uses),
            // `pub mod reading;` in commands/mod.rs: the modules are written
            // inline here instead.
            Item::Mod(m) if m.content.is_none() => {}
            Item::Mod(m) if is_cfg_test(&m.attrs) => {}
            Item::Fn(f) if is_cfg_test(&f.attrs) => {}
            other => others.push(other),
        }
    }

    // Names that mark an item as desktop-only: Tauri's own, what an import
    // that cannot resolve here brings in, and (as the loop below finds them)
    // the items left out for those reasons.
    let mut denied: BTreeSet<String> = DESKTOP_ONLY_NAMES.iter().map(|s| s.to_string()).collect();
    denied.extend(uses.iter().filter(|u| !u.resolves()).filter_map(UseLeaf::binding));

    let is_command = |item: &Item| matches!(item, Item::Fn(f) if f.attrs.iter().any(is_command_attr));
    let item_name = |item: &Item| -> Option<String> {
        match item {
            Item::Fn(f) => Some(f.sig.ident.to_string()),
            Item::Const(c) => Some(c.ident.to_string()),
            Item::Static(s) => Some(s.ident.to_string()),
            Item::Struct(s) => Some(s.ident.to_string()),
            Item::Enum(e) => Some(e.ident.to_string()),
            Item::Type(t) => Some(t.ident.to_string()),
            _ => None,
        }
    };

    let mut keep = vec![true; others.len()];
    loop {
        let mut changed = false;
        for (i, item) in others.iter().enumerate() {
            if !keep[i] {
                continue;
            }
            let names = item_idents(item);
            let mut ok = !names.iter().any(|n| denied.contains(n) || n.starts_with("tauri_"));
            if ok {
                if let Item::Fn(f) = item {
                    if is_command(item) && !callable_on_web(&f.sig) {
                        ok = false;
                    }
                }
            }
            // A `tauri::` path other than `tauri::State`.
            if ok {
                struct TauriPaths(bool);
                impl<'ast> Visit<'ast> for TauriPaths {
                    fn visit_path(&mut self, p: &'ast syn::Path) {
                        let segs: Vec<String> = p.segments.iter().map(|s| s.ident.to_string()).collect();
                        if segs.first().is_some_and(|s| s == "tauri") && segs.get(1).is_none_or(|s| s != "State" && s != "command") {
                            self.0 = true;
                        }
                        syn::visit::visit_path(self, p);
                    }
                }
                let mut v = TauriPaths(false);
                v.visit_item(item);
                ok = !v.0;
            }
            if !ok {
                keep[i] = false;
                // What used a left-out helper is left out too. Not so for a
                // command: nothing calls one, and its name is often a query
                // function's too (`morph_search` and `word_study::morph_search`).
                if !is_command(item) {
                    if let Some(n) = item_name(item) {
                        denied.insert(n);
                    }
                }
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    let mut kept: Vec<Item> = others.into_iter().zip(keep).filter(|(_, k)| *k).map(|(i, _)| i).collect();

    // The commands, and the `_blocking` twins standing in for async ones.
    let kept_fns: BTreeMap<String, syn::Signature> = kept
        .iter()
        .filter_map(|i| match i {
            Item::Fn(f) => Some((f.sig.ident.to_string(), f.sig.clone())),
            _ => None,
        })
        .collect();
    let mut commands = Vec::new();
    for name in registered {
        let twin = format!("{name}_blocking");
        if let Some(sig) = kept_fns.get(name) {
            if kept.iter().any(|i| matches!(i, Item::Fn(f) if f.sig.ident == name.as_str() && f.attrs.iter().any(is_command_attr))) {
                commands.push((name.clone(), name.clone(), sig.clone()));
            }
        } else if let Some(sig) = kept_fns.get(&twin) {
            if callable_on_web(sig) && module_declares_command(module, name) {
                commands.push((name.clone(), twin, sig.clone()));
            }
        }
    }

    // Uses: only those that resolve and that something kept refers to.
    let mut used = BTreeSet::new();
    for item in &kept {
        used.extend(item_idents(item));
    }
    let mut items: Vec<Item> = uses
        .iter()
        .filter(|u| u.resolves())
        .filter(|u| u.binding().is_none_or(|b| used.contains(&b)))
        .map(UseLeaf::to_item)
        .collect();

    // Strip `#[tauri::command]`, point `tauri::State` at the shim.
    struct Rewrite;
    impl VisitMut for Rewrite {
        fn visit_path_mut(&mut self, p: &mut syn::Path) {
            let segs: Vec<String> = p.segments.iter().map(|s| s.ident.to_string()).collect();
            if segs.len() >= 2 && segs[0] == "tauri" && segs[1] == "State" {
                let rest: Vec<syn::PathSegment> = p.segments.iter().skip(1).cloned().collect();
                let mut new: syn::Path = syn::parse_quote!(crate::shim);
                new.segments.extend(rest);
                *p = new;
            }
            syn::visit_mut::visit_path_mut(self, p);
        }
        fn visit_item_fn_mut(&mut self, f: &mut ItemFn) {
            f.attrs.retain(|a| !is_command_attr(a));
            syn::visit_mut::visit_item_fn_mut(self, f);
        }
    }
    for item in kept.iter_mut() {
        Rewrite.visit_item_mut(item);
    }
    items.extend(kept);

    let inner_attrs = file.attrs.into_iter().filter(|a| matches!(a.style, syn::AttrStyle::Inner(_))).collect();
    Filtered { inner_attrs, items, commands }
}

/// Whether `commands/<module>.rs` declares `#[tauri::command] ... fn <name>`.
/// (The twin must sit beside the command it stands in for.)
fn module_declares_command(module: &str, name: &str) -> bool {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let path = manifest.join("../../src/commands").join(format!("{module}.rs"));
    let file = syn::parse_file(&fs::read_to_string(path).unwrap()).unwrap();
    file.items
        .iter()
        .any(|i| matches!(i, Item::Fn(f) if f.sig.ident == name && f.attrs.iter().any(is_command_attr)))
}

/// `fn __web_<name>(db, args) -> Reply`: the arguments read the way Tauri
/// reads them (each parameter from the camelCase key of its name; a missing
/// `Option` is `None`), then the call, then the result as the page gets it.
fn dispatch_fn(handler: &proc_macro2::Ident, name: &str, target: &str, sig: &syn::Signature) -> TokenStream {
    let target = format_ident!("{}", target);
    let mut fields = Vec::new();
    let mut call_args = Vec::new();
    for arg in &sig.inputs {
        let FnArg::Typed(pt) = arg else { unreachable!() };
        let Pat::Ident(pi) = &*pt.pat else { unreachable!() };
        if is_db_state(&pt.ty) {
            call_args.push(quote!(crate::shim::State(db)));
        } else {
            let ident = &pi.ident;
            let ty = &pt.ty;
            fields.push(quote!(#ident: #ty));
            call_args.push(quote!(__args.#ident));
        }
    }
    let reply = match &sig.output {
        ReturnType::Default => quote!(crate::reply::unit),
        ReturnType::Type(_, ty) => match &**ty {
            Type::Path(p) if p.path.segments.last().is_some_and(|s| s.ident == "AppResult" || s.ident == "Result") => {
                quote!(crate::reply::result)
            }
            _ => quote!(crate::reply::value),
        },
    };
    quote! {
        #[allow(unused_variables)]
        pub(crate) fn #handler(db: &crate::db::DbState, args: ::serde_json::Value) -> crate::reply::Reply {
            #[derive(::serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct __Args { #(#fields,)* }
            let __args: __Args = match crate::reply::args(#name, args) {
                Ok(a) => a,
                Err(e) => return Err(e),
            };
            #reply(#target(#(#call_args),*))
        }
    }
}
