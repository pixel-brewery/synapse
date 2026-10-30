# Meeting notes text example

An independent Node.js consumer of publishable Synapse packages. It processes a fixed synthetic meeting transcript into validated JSON containing a summary, decisions and tasks. It does not use Symphony, Electron, Git, microphone capture or audio transcription.

```sh
yarn nx run meeting-notes:build --parallel=1
yarn workspace @pixel-brewery/synapse-meeting-notes-example start --simulate
```

Simulation is explicit and prints a diagnostic that no AI inference occurred. It supplies a declared fixture through the real runtime and JSON-schema validation. Omitting both `--simulate` and `--provider` fails; provider errors never become a hidden deterministic summary.

Real native execution:

```sh
yarn workspace @pixel-brewery/synapse-meeting-notes-example start --provider codex --account personal --login
yarn workspace @pixel-brewery/synapse-meeting-notes-example start --provider claude --account personal
```

`--login` explicitly starts the selected driver's supported native subscription flow. Without it, existing isolated credentials are used; no automatic login or global credential import occurs. Browser/device-code instructions appear on stderr, protected native input is not echoed, and Ctrl+C cancels and drains the operation. `--method` selects an advertised Synapse auth method ID when needed.

Profiles default to a dedicated application directory under the current user's home. `--profile-root /absolute/owned/directory` selects a different application-owned base. Accounts and drivers receive distinct profiles. `--model` passes an explicit native model identifier.

For OpenCode, select `--provider opencode --model provider/model`. Native login additionally requires the real native provider/method selection, e.g. `--opencode-provider <provider-id> --opencode-method '<exact native method label>' --login`. Discover the method label through the installed CLI; this example does not invent or broker OAuth procedures.

Ordinary CI and artifact-consumer verification use `--simulate` with a temporary profile root and require no personal account. Real authentication/inference is an explicitly invoked integration check.
