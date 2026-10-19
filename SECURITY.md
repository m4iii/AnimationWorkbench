# Security

This application is a local, single-user development tool. Keep its listener on
127.0.0.1. Do not expose it through a reverse proxy, public tunnel or LAN binding.
The page receives a local API token; treat a running instance and its data folder
as private. Do not upload runtime folders, workspaces, logs, credentials, model
inputs or outputs to an issue or public repository.

Codex jobs use your local CLI identity and may send selected images and prompts
to the configured model provider. Review inputs and account/billing settings
before starting a job. Dependencies and Codex are installed/configured separately.

For a suspected security issue, contact the repository owner privately using an
available verified channel; do not publish exploit details or secrets in an issue.
Rotate any exposed credentials through their official provider.
