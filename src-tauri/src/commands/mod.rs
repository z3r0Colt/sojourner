/// A limit the page asked for, held to something the app can actually draw.
/// A negative LIMIT means "no limit" in SQLite, so this is not only a guard
/// against a silly number but against an unbounded query.
///
/// Every `limit` below arrives from the webview and goes into `LIMIT ?`
/// unexamined. `LIMIT -1` returns every matching row -- every verse of every
/// installed translation, for a query loose enough -- built into result
/// structs and then serialized across the IPC boundary one by one.
pub fn clamp_limit(limit: i64) -> i64 {
    limit.clamp(1, 500)
}

#[cfg(test)]
mod tests {
    use super::clamp_limit;

    /// The case this exists for. SQLite reads a negative LIMIT as "no limit",
    /// so a page asking for -1 rows is a page asking for all of them.
    #[test]
    fn a_negative_limit_does_not_mean_every_row() {
        assert_eq!(clamp_limit(-1), 1);
        assert_eq!(clamp_limit(i64::MIN), 1);
        assert_eq!(clamp_limit(0), 1);
    }

    #[test]
    fn an_unreasonable_limit_is_brought_back_to_something_drawable() {
        assert_eq!(clamp_limit(i64::MAX), 500);
        assert_eq!(clamp_limit(100_000), 500);
    }

    #[test]
    fn the_limits_the_app_actually_asks_for_pass_through_unchanged() {
        for asked in [1, 10, 12, 20, 30, 50, 200, 500] {
            assert_eq!(clamp_limit(asked), asked, "the app asks for {asked}");
        }
    }
}

pub mod annotations;
pub mod backup;
pub mod catechism_memory;
pub mod diagnostics;
pub mod export;
pub mod file_picker;
pub mod harmony;
pub mod library;
pub mod prayer_journal;
pub mod prayer_list;
pub mod reading;
pub mod reading_plans;
pub mod red_letter;
pub mod reference;
pub mod resources;
pub mod scripture_memory;
pub mod search;
pub mod sermons;
pub mod settings;
pub mod study;
pub mod tts;
pub mod update;
