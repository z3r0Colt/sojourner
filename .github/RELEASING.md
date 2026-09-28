# Releasing Sojourner

Release installers are built by GitHub Actions, by `.github/workflows/release.yml`, from the source in this repository. Nobody's own computer is in the chain, which is what lets a reader trace an installer back to a commit, and what code signing through the SignPath Foundation requires.

The workflow never publishes anything. It ends with a **draft** release, and a person reads it over and presses *Publish*.

## Cutting a release

1. **Bump the version** in all three places, to the same number: `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. The build stops at once if they disagree, or if the tag does not match them.
2. **Check it locally** before tagging: `npm test`, `npx tsc --noEmit` and `cargo test --manifest-path src-tauri/Cargo.toml`. A local `npm run tauri build` is still the quickest way to try an installer by hand.
3. **Commit and push** to `master`. The runner builds from git alone, so a file that exists only on this machine fails the build half an hour in, after `build:content` has compiled. Commit every new file, `.ts` modules, JSON the frontend imports and `tools/*.d.mts` type files included, then check:

   ```
   git status --porcelain      # nothing but ?? release/ should remain
   ```

   Surer still, check the committed tree in a fresh clone, which finds a missing file in minutes:

   ```
   git clone . "$TEMP/sojourner-check" && cd "$TEMP/sojourner-check" && npm ci && npx tsc --noEmit
   ```

4. **Tag the commit and push the tag:**

   ```
   git tag -a v0.3.4 -m "Sojourner 0.3.4"
   git push origin v0.3.4
   ```

   The tag push starts the Release workflow (the Actions tab, *Release*).
5. **Wait for it.** A build from nothing takes about an hour (see [How long it takes](#how-long-it-takes)).
6. **Try the installer** from the draft on a Windows machine before anything else: install it over the last release, then open a confession, a footnote, the Webster dictionary and the interlinear's parsing, and read a chapter aloud. The runner checks files out with their line endings as committed (LF), where a local Windows checkout has CRLF, so its `content.db` is built from slightly different bytes than a local build's. The importers accept both, but the first builds from CI deserve a look rather than an assumption.
7. **Finish the draft** under Releases: replace "Release notes will follow." with the notes, and publish. The library packs (`.sjpack`) are uploaded by hand, as before; the workflow does not build them.

   **The size and SHA-256 in the notes must be the attached file's.** Copy them from the draft's own generated lines, or from the run's summary (the *Draft release* section; when signing is on, the signed table, not the unsigned one above it). Never take them from a local build: every build is a different file with its own checksum. When the attached installer is signed, leave out the SmartScreen and "not yet code-signed" wording.

## Where things land

- **The run's summary page** gives the unsigned installer's size in MiB, its SHA-256, the size of `content.db` and the commit. When signing is on, the signed file's figures and signer follow beneath; those, and the *Draft release* section at the end, are the ones that belong to the draft.
- **Artifacts** on the same page: `Sojourner-<version>-installer-unsigned`, and once signing is on, `Sojourner-<version>-installer-signed` (a release run) or `-installer-test-signed` (any other run). GitHub hands them out as zip files and keeps them for 30 days.
- **The draft release** for tag `v<version>`, titled "Sojourner: Bible Study Companion", with `Sojourner_<version>_x64-setup.exe` attached. While signing is off, that is the unsigned installer. Once signing is on, it is the signed one or nothing: if the signing request is rejected, times out, or comes back with a signature Windows does not trust, the sign job fails and no draft is made. Fix the cause and re-run the failed jobs. The draft's first body gives the size and SHA-256 of the attached file and links the build log.

Running the workflow again for the same tag replaces the installer on the draft. Each build is a new file with a new SHA-256, so notes still as generated ("Release notes will follow.") are rewritten with the new figures. Notes already written by hand are left as they are, and the run ends with a warning, and a section in its summary, giving the new size and SHA-256 to correct them with. If that release has already been published, the job fails rather than change it.

## Running it by hand

*Actions → Release → Run workflow*. Pick the branch or tag to build from.

- Left unticked, it only builds. When signing is on, such a run is test-signed, never release-signed, so a test build files no request an approver has to answer. A run on `master` is also the only kind of run that saves the Rust build cache: a cache saved under a tag can be read by that tag alone, so tag builds read the `master` cache but never write one. One manual run on `master` before tagging makes the tag build much quicker, and warms the voice model's cache as well.
- With **"Also create or update the draft release"** ticked, it is a release run: it drafts the release for `v<version>`, and when signing is on, it is release-signed. That tag must already exist on GitHub and point at the very commit being built. The build checks this first and stops at once if not, and the release job checks again before it touches the draft. The draft always belongs to the commit that was built.

Only one run at a time works on the drafts, so a tag push and a manual run for the same version cannot make two drafts for one tag.

## What the build fetches

Everything the installer is made from is in git, except three things the runner downloads:

- **The voice model** (`models/`, about 170 MB of Apache-2.0 Kokoro weights) comes from Hugging Face through `npm run fetch:voices`, tried up to three times since shared runners are sometimes turned away, and is checked against `.github/voice-model.sha256` before anything is built. Those are the files every release so far has shipped (Hugging Face revision `1939ad2a`); a different file stops the build. To change the model on purpose, fetch it locally and write the list again:

  ```
  npm run fetch:voices
  (sha256sum models/kokoro/model.onnx; sha256sum models/kokoro/voices/*.bin) | sed 's/ \*/  /' > .github/voice-model.sha256
  ```

- **onnxruntime**, which the voice runs on, is downloaded by the `ort-sys` crate while it compiles, from `cdn.pyke.io`, and checked against the hash the crate carries.
- **NSIS and the WebView2 offline installer** are downloaded by Tauri's bundler. The WebView2 installer is Microsoft's current one on the day of the build.

`content.db` is rebuilt from `bibles/`, `commentaries/`, `reference/` and `library/` on every build, exactly as `npm run tauri build` does locally. Nothing is read from `.cache/`, which only holds the downloads the data tools in `tools/` start from.

Files are checked out with their line endings as committed (`core.autocrlf false`), so the build reads the same bytes on every runner. A local Windows checkout usually has CRLF instead (Git for Windows turns `autocrlf` on), so a CI build and a local build of the same commit are not byte for byte the same: hence step 6 above.

## How long it takes

About an hour from nothing on GitHub's four-core Windows runners: the release profile (`lto = true`, one codegen unit) links twice, once for `build_content_db` and once for the app, then `content.db` is built and NSIS compresses about a gigabyte into the installer. With a warm Rust cache from `master`, expect roughly half that. The build job gives up after three hours.

## Code signing with SignPath

**Status: off.** The *Sign with SignPath* job runs only when the repository variable `SIGNPATH_ORGANIZATION_ID` is set; until then it shows as skipped and the draft carries the unsigned installer.

### What the SignPath Foundation asks of the project

The conditions are at [signpath.org/terms](https://signpath.org/terms); read them there before applying, as they change. At the time of writing:

- **An OSI-approved licence, and no proprietary components.** `LICENSE` (Apache-2.0) is in place. The installer embeds Microsoft's WebView2 offline installer, which is not open source; say so in the application and ask whether it counts as a system library, as it is for other Tauri apps.
- **A "Code signing policy" section** on the project's home page (the README), under that heading. It must carry the attribution sentence, name the people who commit and review and those who approve releases, and either link a privacy policy or state that nothing is sent anywhere without being asked. The README has one; keep its names and its privacy sentence true.
- **Multi-factor authentication** on GitHub and on SignPath for everyone on the team.
- **Product name and version** in every signed file, enforced by the artifact configuration below. Tauri sets the installer's from `tauri.conf.json`: product name "Sojourner", product version the release number. The version resource's ProductVersion string is `0.3.4` (its fixed binary version is `0.3.4.0`); the workflow passes the version being built to SignPath as the `version` parameter, and the configuration requires the file's to match it.
- **Builds on GitHub-hosted runners.** Every job in this workflow runs on one.

### Switching it on

1. **Apply** at [signpath.org](https://signpath.org/). Once accepted, SignPath sets up an organization and a project for Sojourner.
2. In SignPath, **add GitHub.com as a trusted build system** and link it to the project, so it accepts requests that come from this repository's workflow runs.
3. Give the project this **artifact configuration** (as its default). The workflow uploads the installer as a zip, so the zip is the root, and it passes the version being built as the `version` parameter:

   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
     <parameters>
       <parameter name="version" required="true" />
     </parameters>
     <zip-file>
       <pe-file path="Sojourner_*_x64-setup.exe" product-name="Sojourner" product-version="${version}">
         <authenticode-sign />
       </pe-file>
     </zip-file>
   </artifact-configuration>
   ```

   If the first test run is refused over the version, check which of the installer's two version numbers SignPath compares (`0.3.4` or `0.3.4.0`) and write the restriction to match.

4. Note the **signing policy slugs** the Foundation provides (usually `test-signing` and `release-signing`). Release signing waits for an approver to approve each request in SignPath; the job waits up to five hours for that. The workflow sends release runs to the policy in `SIGNPATH_SIGNING_POLICY_SLUG` and every other run to `test-signing`, so the test policy must carry that name.
5. Create an **API token** for a CI user in SignPath that may submit to both policies.
6. In GitHub, *Settings → Secrets and variables → Actions*:
   - **Secret** `SIGNPATH_API_TOKEN`: the API token.
   - **Variable** `SIGNPATH_PROJECT_SLUG`: the project's slug.
   - **Variable** `SIGNPATH_SIGNING_POLICY_SLUG`: `release-signing`. Only release runs use it.
   - **Variable** `SIGNPATH_ORGANIZATION_ID`: the organization's id. Set this one last: it is the switch.
7. **Try it** with a manual run on `master`, draft box unticked, which is test-signed. The job submits the unsigned artifact, waits, downloads the signed installer, checks it with Windows' own `Get-AuthenticodeSignature`, and uploads it as `Sojourner-<version>-installer-test-signed`. A test certificate is self-signed, so Windows reports `UnknownError` (a root it does not know) and the run warns rather than fails; a missing or broken signature still fails it. Then tag the next release. That run is release-signed and must come back `Valid`, or no draft is made; a test-signed file is never attached to a draft.

Once releases are signed, the README's Download section can drop its SmartScreen note (reputation for a new certificate still builds up over the first downloads, so SmartScreen may warn for a while).

**What is not signed yet:** only the installer is. `Sojourner.exe` inside it is not, and neither is the uninstaller NSIS writes, because SignPath cannot open an NSIS installer to sign what is inside. The Foundation's terms currently allow unsigned files only when they come from upstream open-source projects, and these two are the project's own, so raise it when applying rather than leave it for later. Signing all three means splitting the build: `npm run tauri build -- --no-bundle`, sign the app, then `npx tauri bundle` around the signed file, and sign the finished installer as now. Ask the Foundation whether that plan, with the installer alone signed meanwhile, is acceptable.
