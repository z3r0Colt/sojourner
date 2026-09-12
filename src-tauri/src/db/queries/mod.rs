pub mod bookmarks;
pub mod catechism_memory;
pub mod commentary;
pub mod concordance;
pub mod crossrefs;
pub mod doctrine_topics;
pub mod harmony;
pub mod highlights;
pub mod notes;
pub mod prayer_journal;
pub mod prayer_list;
pub mod reading_log;
pub mod reading_position;
pub mod psalter;
pub mod reading_plans;
pub mod red_letter;
pub mod reference;
pub mod resources;
pub mod scripture_memory;
pub mod search;
pub mod settings;
pub mod trash;
pub mod verses;
pub mod versification;
pub mod westminster;

/// The soft-delete filter every list, search, and count over `notes`,
/// `chapter_notes`, or `prayer_entries` must include (see
/// USER_MIGRATION_0011). Prefix with a table alias in joins:
/// `format!("n.{NOT_DELETED}")`.
pub const NOT_DELETED: &str = "deleted_at IS NULL";
