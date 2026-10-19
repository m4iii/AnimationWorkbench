# Contributing

Use Python 3.12, Node.js 22 and FFmpeg. Install backend/requirements.txt in a virtual
environment, then run `python scripts/check.py`. Tests use synthetic assets and
model test doubles; never invoke paid/model jobs as part of CI.

Edit files in frontend/, then run `python build_frontend.py`; commit the rebuilt
AnimationWorkbench.html and FRONTEND_FUNCTIONS.md with source changes. New
behavior should have regression tests. Do not add credentials, runtime data,
private screenshots or artwork without redistribution rights.

VERSION is the source of the project version. For a release, update VERSION and
CHANGELOG.md, run all checks, review the staged file list and create a matching
vMAJOR.MINOR.PATCH tag after the commit is published. Do not move published tags.

No project-wide license has been selected yet. Discuss reuse and contributions
with the owner before assuming license terms; vendored components retain their
own licenses.
