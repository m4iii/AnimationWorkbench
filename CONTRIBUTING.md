# Contributing

## Local checks

Use Python 3.12, Node.js 22 and FFmpeg. Install `backend/requirements.txt` in a
virtual environment, then run `python scripts/check.py`. This is the aggregate
check: generate synthetic test media, rebuild the frontend, validate the static
bundle, run every `tests/*.cjs` regression suite once, and run backend and public
release checks. `tests/check_bundle.py` alone checks the bundle, not regression
behavior or browser rendering. Tests use synthetic assets and model test doubles;
never invoke paid/model jobs as part of CI.

Edit files in `frontend/`, then run `python build_frontend.py`; commit the rebuilt
`AnimationWorkbench.html` and `FRONTEND_FUNCTIONS.md` with source changes. New
behavior should have regression tests. For UI changes, also check the running
loopback UI manually; passing unit tests does not prove browser rendering works.
Do not add credentials, runtime data, private screenshots or artwork without
redistribution rights.

## Private assets and runtime data

Keep personal media outside the repository. Unicorn Overlord artwork, sprites,
screenshots, extracted frames and animations must never be uploaded to this
repository, PRs or release packages. Personal learning use does not establish
redistribution rights. If a temporary local material directory is unavoidable,
use ignored `media-assets/`, `materials/` or `test-assets/`; never force-add it.
Runtime, cache, authentication, uploads and backup data must stay untracked.
The public-release check rejects tracked material/runtime paths and raster/video
files; tests generate synthetic video locally. Ignore rules do not untrack files
already committed. Review `git diff --cached --name-only` before every push. If
private content was previously published, stop and assess removal with the owner;
do not silently rewrite history or move a release tag.

## Single-maintainer pull request flow

1. Start a focused `feat/`, `fix/` or `chore/` branch from current `main`.
2. Make a small change, run the aggregate check, inspect `git diff` and the staged
   file list, and commit only intended files. Open a draft pull request to `main`.
3. Describe the change, risks and test evidence in the PR template. Review the
   final diff yourself. An independent code review (human or an available code
   review tool) is recommended; resolve substantive findings before merging.
   Automated review supplements tests and maintainer judgment, and must not be
   claimed unless it actually ran. An external review service is optional.
4. Mark the PR ready when it is reviewable. Wait for the `test` job in the `CI`
   workflow to pass on the latest PR revision. After any change, rerun checks and
   review the new diff. If `main` changed, bring it into the branch and recheck.
5. Squash merge the passing PR and remove the completed feature branch. Keep the
   PR as the record of intent, review and verification. Fix regressions through a
   new PR; do not rewrite published history.

The recommended `main` protection requires a pull request and the `test` CI check,
blocks force pushes and branch deletion, and requires zero human approvals so a
sole maintainer is not locked out. Repository settings are managed separately;
this document does not enable or attest to those protections.

CI runs for PRs targeting `main`, pushes to `main`, version-tag pushes (`v*`), and
manual dispatches. Feature-branch pushes alone do not run a second copy of PR CI.
New runs on the same ref cancel stale checks. Keep the CI job name stable if it is
configured as a required check. CI has read-only repository permissions and does
not deploy, publish releases, or call real models. Deployment is a separate,
explicit operation.

## Releases

`VERSION` is the source of the project version. For a release, update `VERSION`
and `CHANGELOG.md` in a PR, run all checks, and merge it. Create the matching
`vMAJOR.MINOR.PATCH` tag on that verified `main` commit, wait for its CI, and then
publish release notes. Never move or overwrite published tags, including `v0.0.1`.
Workflow/documentation-only changes do not need a release or version bump.

No project-wide license has been selected yet. Discuss reuse and contributions
with the owner before assuming license terms; vendored components retain their
own licenses.
