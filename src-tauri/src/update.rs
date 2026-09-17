//! Whether a newer Sojourner has been published.
//!
//! Asked of GitHub's releases API, and only ever when a reader presses the
//! button in Settings → About. That restraint is the whole design: that same
//! page promises this app makes "no network request of its own accord", so
//! nothing in this module runs at launch, on a timer, or in the background.
//! If an automatic check is ever wanted, that sentence has to change first.
//!
//! There is no downloading and no installing here. The reader is handed a
//! link to the release page and installs it themselves -- which is why this
//! file is ninety lines instead of an update framework.

use anyhow::Context;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// The repository releases are published to.
const REPO: &str = "z3r0Colt/sojourner";

/// GitHub answers 403 to an API request that does not say who is asking, so
/// this is not optional politeness.
const USER_AGENT: &str = concat!("Sojourner/", env!("CARGO_PKG_VERSION"));

/// Whole-request budget, connect and read together.
///
/// A reader is watching a spinner for the length of this, so it is short. The
/// case it exists for is not a slow server but a captive-portal network --
/// the hotel wifi that completes the connection and then never answers.
/// Without a global cap that spinner spins forever.
const TIMEOUT: Duration = Duration::from_secs(10);

/// What the page needs in order to say either "you are up to date" or "there
/// is a newer one, here is where to get it".
#[derive(Debug, Serialize, PartialEq)]
pub struct UpdateCheck {
    /// The running build's version, as `tauri.conf.json` declares it.
    pub current: String,
    /// The newest published release's tag, or `None` when there is none to
    /// be read (see [`fetch_latest_release`]).
    pub latest: Option<String>,
    pub update_available: bool,
    /// Where to send the reader: the release's own page when there is one,
    /// the releases listing otherwise.
    pub url: String,
}

/// The two fields of GitHub's release JSON this needs. Serde ignores the
/// other eighty-odd keys.
#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
}

/// The newest published release, or `None` if there is not one to read.
///
/// A 404 is `None` rather than an error, and it covers three situations that
/// GitHub deliberately makes indistinguishable: no release has been published
/// yet, the repository is private, or the name is wrong (GitHub will not
/// confirm that a private repository exists, so it answers all three the
/// same). All three mean the same thing to a reader -- there is nothing here
/// to update to -- and reporting it as a failure would put a red error in
/// front of everyone who pressed the button before the first release was cut.
fn fetch_latest_release(agent: &ureq::Agent) -> anyhow::Result<Option<GithubRelease>> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let mut response = agent
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .call()
        .with_context(|| format!("could not reach {url}"))?;

    let status = response.status().as_u16();
    if status == 404 {
        return Ok(None);
    }
    // 403 with a rate-limit body is the one worth naming: GitHub allows 60
    // unauthenticated requests an hour per IP, which a reader pressing a
    // button by hand will never reach, but a developer testing this will.
    anyhow::ensure!(
        status == 200,
        "GitHub answered {status} (if that is 403, the hourly unauthenticated \
         request limit has been reached; it resets within the hour)"
    );

    let body = response
        .body_mut()
        .read_to_string()
        .context("could not read GitHub's answer")?;
    serde_json::from_str(&body)
        .context("GitHub's answer was not the release JSON this expected")
        .map(Some)
}

/// Whether `latest` is a version worth moving to from `current`.
///
/// A leading `v` on either is ignored, so the tag `v0.2.0` and the version
/// `0.2.0` are the same release.
///
/// When a tag cannot be parsed as a version at all, this falls back to
/// "different means newer". That is deliberate, and it is the less bad of two
/// wrong answers: a tag shaped `release-2` or `0.2` would otherwise leave
/// every reader told they are up to date forever, with nothing anywhere
/// saying why. A spurious "there is an update" gets noticed and fixed within
/// a day; a silent no never does.
pub fn is_newer(current: &str, latest: &str) -> bool {
    let strip = |s: &str| s.trim().trim_start_matches(['v', 'V']).trim().to_string();
    let (current, latest) = (strip(current), strip(latest));
    match (Version::parse(&current), Version::parse(&latest)) {
        (Ok(current), Ok(latest)) => latest > current,
        _ => current != latest,
    }
}

/// Asks GitHub, and says what to tell the reader. Blocking; call it off the
/// thread that draws (see [`crate::commands::update::check_for_update`]).
pub fn check(current: &str) -> anyhow::Result<UpdateCheck> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        // A 404 is an answer this code reads, not an error to be raised past
        // it -- see `fetch_latest_release`.
        .http_status_as_error(false)
        .build()
        .into();

    match fetch_latest_release(&agent)? {
        Some(release) => Ok(UpdateCheck {
            current: current.to_string(),
            update_available: is_newer(current, &release.tag_name),
            latest: Some(release.tag_name),
            url: release.html_url,
        }),
        None => Ok(UpdateCheck {
            current: current.to_string(),
            latest: None,
            update_available: false,
            url: format!("https://github.com/{REPO}/releases"),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::is_newer;

    #[test]
    fn a_later_release_is_newer() {
        assert!(is_newer("0.1.0", "0.2.0"));
        assert!(is_newer("0.1.0", "v0.1.1"));
        assert!(is_newer("1.0.0", "1.0.1"));
    }

    #[test]
    fn the_running_version_is_not_an_update_to_itself() {
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "v0.1.0"));
        // A `v` on both sides, and stray whitespace in a hand-typed tag.
        assert!(!is_newer("v0.1.0", " v0.1.0 "));
    }

    #[test]
    fn an_older_release_is_not_offered() {
        assert!(!is_newer("0.2.0", "0.1.0"));
        assert!(!is_newer("1.0.0", "v0.9.9"));
    }

    /// The case a string comparison gets wrong, which is the reason `semver`
    /// is a dependency: "0.10.0" sorts before "0.9.0" alphabetically.
    #[test]
    fn a_two_digit_version_part_is_compared_as_a_number() {
        assert!(is_newer("0.9.0", "0.10.0"));
        assert!(!is_newer("0.10.0", "0.9.0"));
        assert!(is_newer("1.9.0", "1.10.0"));
    }

    /// A prerelease is older than the release it leads to, which is what
    /// semver says and what shipping 0.2.0 after 0.2.0-rc.1 needs.
    #[test]
    fn a_prerelease_precedes_its_release() {
        assert!(is_newer("0.2.0-rc.1", "0.2.0"));
        assert!(!is_newer("0.2.0", "0.2.0-rc.1"));
    }

    /// An unparseable tag falls back to "different means newer" rather than
    /// silently reporting up-to-date forever. See `is_newer`.
    #[test]
    fn a_tag_that_is_not_a_version_still_reports_something() {
        assert!(is_newer("0.1.0", "release-2"));
        assert!(is_newer("0.1.0", "0.2"));
        // ...but an unparseable tag equal to what is running is still not an
        // update, so a mis-shaped tag nags once rather than every time.
        assert!(!is_newer("0.2", "0.2"));
    }

    /// The real request against the real repository. `#[ignore]`d because it
    /// needs the network and spends one of the sixty unauthenticated requests
    /// an hour GitHub allows: run it by hand with
    /// `cargo test --lib update:: -- --ignored --nocapture` after changing
    /// anything about the HTTP call or the 404 handling.
    #[test]
    #[ignore]
    fn the_live_check_answers() {
        let checked = super::check("0.1.0").expect("the check should reach GitHub");
        eprintln!("{checked:?}");
        assert_eq!(checked.current, "0.1.0");
        // Before the first release is cut GitHub answers 404, which is not an
        // error and is not an update. Once one is published this flips to
        // `Some(tag)` -- at which point this assertion is the thing that
        // tells you the happy path works too.
        match &checked.latest {
            None => assert!(!checked.update_available),
            Some(tag) => assert!(checked.url.contains("releases"), "got {tag} at {}", checked.url),
        }
    }
}
