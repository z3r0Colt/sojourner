use crate::db::queries::{bookmarks, highlights, notes, trash};
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{Backlink, Bookmark, ChapterNote, Highlight, Note, NoteKind, NoteRefInput, TrashContents, TrashKind};
use tauri::State;

// Trash: soft-deleted notes, chapter notes, and prayer entries in one
// listing, with per-item restore and permanent delete.

#[tauri::command]
pub fn list_trash(db: State<DbState>) -> AppResult<TrashContents> {
    let conn = db.0.lock().unwrap();
    Ok(trash::list(&conn)?)
}

#[tauri::command]
pub fn restore_trash_item(db: State<DbState>, kind: TrashKind, id: i64) -> AppResult<bool> {
    let conn = db.0.lock().unwrap();
    Ok(trash::restore(&conn, kind, id)?)
}

#[tauri::command]
pub fn purge_trash_item(db: State<DbState>, kind: TrashKind, id: i64) -> AppResult<bool> {
    let conn = db.0.lock().unwrap();
    Ok(trash::purge(&conn, kind, id)?)
}

#[tauri::command]
pub fn list_highlights(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<Highlight>> {
    let conn = db.0.lock().unwrap();
    Ok(highlights::list_for_chapter(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn list_all_highlights(db: State<DbState>) -> AppResult<Vec<Highlight>> {
    let conn = db.0.lock().unwrap();
    Ok(highlights::list_all(&conn)?)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn create_highlight(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    char_start: Option<i64>,
    char_end: Option<i64>,
    color: String,
    style: String,
    translation_id: Option<i64>,
) -> AppResult<Highlight> {
    let conn = db.0.lock().unwrap();
    Ok(highlights::create(
        &conn,
        highlights::NewHighlight {
            book_id,
            chapter,
            verse_start,
            verse_end,
            char_start,
            char_end,
            color,
            style,
            translation_id,
        },
    )?)
}

#[tauri::command]
pub fn update_highlight(db: State<DbState>, id: i64, color: String, style: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(highlights::update_color(&conn, id, color, style)?)
}

#[tauri::command]
pub fn delete_highlight(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(highlights::delete(&conn, id)?)
}

#[tauri::command]
pub fn list_notes_for_chapter(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<Note>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_for_chapter(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn list_all_notes(db: State<DbState>) -> AppResult<Vec<Note>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_all(&conn)?)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn create_note(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    body: String,
    highlight_id: Option<i64>,
    refs: Option<Vec<NoteRefInput>>,
) -> AppResult<Note> {
    let conn = db.0.lock().unwrap();
    Ok(notes::create(&conn, book_id, chapter, verse_start, verse_end, body, highlight_id, refs)?)
}

#[tauri::command]
pub fn update_note(db: State<DbState>, id: i64, body: String, refs: Option<Vec<NoteRefInput>>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::update(&conn, id, body, refs)?)
}

// Backlinks (F2.2): the references a note mentions, kept per save, and the
// reverse lookup for a chapter.

#[tauri::command]
pub fn set_note_refs(db: State<DbState>, kind: NoteKind, id: i64, refs: Vec<NoteRefInput>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::set_refs(&conn, kind, id, &refs)?)
}

#[tauri::command]
pub fn list_backlinks(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<Backlink>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_backlinks(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn delete_note(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::delete(&conn, id)?)
}

#[tauri::command]
pub fn list_chapter_notes(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<ChapterNote>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_chapter_notes(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn list_all_chapter_notes(db: State<DbState>) -> AppResult<Vec<ChapterNote>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_all_chapter_notes(&conn)?)
}

#[tauri::command]
pub fn create_chapter_note(db: State<DbState>, book_id: i64, chapter: i64, body: String, refs: Option<Vec<NoteRefInput>>) -> AppResult<ChapterNote> {
    let conn = db.0.lock().unwrap();
    Ok(notes::create_chapter_note(&conn, book_id, chapter, body, refs)?)
}

#[tauri::command]
pub fn update_chapter_note(db: State<DbState>, id: i64, body: String, refs: Option<Vec<NoteRefInput>>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::update_chapter_note(&conn, id, body, refs)?)
}

#[tauri::command]
pub fn delete_chapter_note(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::delete_chapter_note(&conn, id)?)
}

#[tauri::command]
pub fn add_note_tag(db: State<DbState>, note_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::add_tag(&conn, note_id, tag)?)
}

#[tauri::command]
pub fn remove_note_tag(db: State<DbState>, note_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::remove_tag(&conn, note_id, tag)?)
}

#[tauri::command]
pub fn list_all_note_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_all_tags(&conn)?)
}

#[tauri::command]
pub fn list_all_note_tags_by_note(db: State<DbState>) -> AppResult<Vec<(i64, String)>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_all_tags_by_note(&conn)?)
}

#[tauri::command]
pub fn add_chapter_note_tag(db: State<DbState>, chapter_note_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::add_chapter_note_tag(&conn, chapter_note_id, tag)?)
}

#[tauri::command]
pub fn remove_chapter_note_tag(db: State<DbState>, chapter_note_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::remove_chapter_note_tag(&conn, chapter_note_id, tag)?)
}

#[tauri::command]
pub fn list_all_chapter_note_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_all_chapter_note_tags(&conn)?)
}

#[tauri::command]
pub fn list_all_chapter_note_tags_by_note(db: State<DbState>) -> AppResult<Vec<(i64, String)>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_all_chapter_note_tags_by_note(&conn)?)
}

#[tauri::command]
pub fn list_bookmarks(db: State<DbState>) -> AppResult<Vec<Bookmark>> {
    let conn = db.0.lock().unwrap();
    Ok(bookmarks::list_all(&conn)?)
}

#[tauri::command]
pub fn create_bookmark(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
    label: Option<String>,
) -> AppResult<Bookmark> {
    let conn = db.0.lock().unwrap();
    Ok(bookmarks::create(&conn, book_id, chapter, verse, label)?)
}

#[tauri::command]
pub fn delete_bookmark(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(bookmarks::delete(&conn, id)?)
}
