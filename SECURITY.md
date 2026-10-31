# Security

Forge 0.2 is an unsigned alpha for macOS Apple Silicon. Renderer isolation, validated IPC, loopback model access, excluded workspace paths, and restricted subprocess execution are independently enforced. The external Ollama process remains a separate trust boundary. Configure it for local-only inference.

Report vulnerabilities through the repository's private security advisory channel when the public repository enables it. A public reporting endpoint has not been configured in this local checkout. Avoid public reports containing private source, logs, or exploit details before contacting the maintainer privately.

Known limits: SQLite data and legacy backups are plaintext; checkpoints contain source text. Filesystem checks cannot eliminate every race with a hostile process modifying the same directories. macOS `sandbox-exec` is a platform-specific backend and needs continued release testing. MLX GPU execution has not been validated with real training weights. No Windows/Linux subprocess fallback is allowed.

Voice input grants microphone access only to the main trusted Forge renderer and requests audio without video. Speech recognition is forced to Chromium's on-device mode; remote recognition fallback is disabled. Audio is used for the live waveform and recognition session and is not saved by Forge. Installing a missing on-device language pack may download model data after the user clicks the microphone.

Do not interpret dependency audit results or a passing smoke suite as a complete security review. Public release additionally requires signing, notarization, clean-install/update verification, and review of execution policy on supported OS versions.

## MCP and local development

MCP is disabled until the user enables a configured profile. Stdio servers run outside the compiler/validation sandbox and can access the account's files and network. HTTP servers receive supplied data; HTTPS is required outside loopback. Server descriptions, schemas and responses remain untrusted. Exact tool allowlists, schema validation, review, output bounds and audit identities are host-enforced. Credentials use environment references; OAuth and keychain-backed storage are not implemented. These controls do not sandbox a third-party stdio server.

Managed package scripts also execute project code outside the isolated validation runner after review. Recovery checks process start/command identity before signaling a saved PID. Local browser sessions deny new windows, permissions and network requests outside approved loopback origins. Screenshots are readable through IPC only from the preview artifact directory.

Disposable databases are distinct from project environment targets. SQLite migration/seed work uses copies; seeds receive no original `.env` files and cannot use network in the macOS sandbox. PostgreSQL SQL runs only in a Forge-labeled disposable Docker container, with dry-runs rolled back. Static migration hints are not a safety guarantee. Representative fixtures, backups and review remain necessary before any separate production workflow.

## Generated product identity

Bundled product starters use a local SQLite database, per-user scrypt password hashes and random session tokens stored only as SHA-256 hashes. Browser sessions use HttpOnly, SameSite=Strict cookies; cookie-authenticated mutations require the configured request origin. Queries enforce owner identity at the data boundary, and generated tests cover password failure, logout, owner isolation, persistence after reopening and cross-origin mutation rejection.

These controls are an application foundation, not a hosted identity service. A deployment must still configure HTTPS, email verification and recovery, abuse and rate limits, secret rotation, monitoring, audit retention and tested database backup/restore. Storefront checkout remains unavailable until a real payment provider and verified webhook flow are configured.

## TypeScript authoring and abuse prevention

Forge's product policy permits TypeScript application code and supporting configuration,
styles, documentation, database schemas and infrastructure files. Built-in source-edit
tools check every proposed artifact before presenting a changeset for approval. Other
language source, JavaScript application files and unsupported extensions are rejected;
JavaScript tooling configuration is allowed. Vue/Svelte script blocks require `lang="ts"`.
Reading other languages for analysis or migration remains available. Generator output
and code executed by dependencies or external tools are not covered by this file gate.

Explicit English/Russian requests to create malware, credential stealers or related
abusive tools are rejected before inference. Clarification answers are checked again.
The model also receives non-optional instructions against abusive code, unauthorized
access and security evasion, including through MCP and SSH. Defensive audits, detection
and vulnerability fixes remain supported.

These checks are a first layer, not a guarantee that malicious software cannot be
produced. Intent matching is heuristic and can miss paraphrases or produce false positives;
file types do not establish what a program does. Allowed configuration files can execute
code. Third-party MCP servers, package scripts and dependencies require separate trust
and review. Existing permission gates and isolation still apply; do not treat this policy
as a malware scanner, complete sandbox, or authorization to run untrusted code.
