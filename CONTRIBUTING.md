# Contributing to Storywriter

Thank you for helping improve Storywriter. The project is intentionally lightweight: focused changes, readable code, and practical manual verification are preferred over ceremony.

## Project principles

- Keep novel content local and portable.
- Preserve Markdown and JSON as the source of truth.
- Use only open-source runtime and build dependencies.
- Keep the interface compact and useful rather than promotional.
- Treat pagination, caret behavior, autosave, and file integrity as high-risk areas.
- Do not give AI agents filesystem access beyond explicit validated tools.
- Avoid proprietary project formats or account requirements for non-AI features.

## Development setup

Requirements:

- Node.js 22 or newer
- npm
- Git

Clone and install:

```bash
git clone <repository-url>
cd storywriter
npm ci
npm run dev
```

Electron installs an operating-system-specific executable. Never reuse `node_modules` between Windows and WSL/Linux or copy it between platforms. Reinstall dependencies in the environment where the application runs.

## Repository layout

```text
src/main/                 Electron main process and services
src/preload/              Narrow IPC bridge exposed to the renderer
src/renderer/src/         React application
src/renderer/src/components/
                          Editors and UI panels
src/renderer/src/editor/  Markdown/timeline adapters and Tiptap extensions
src/renderer/src/state/   Redux Toolkit state
build/                    Application icons and packaging resources
.github/workflows/        Multi-platform release workflow
docs/                     User documentation
```

Main-process responsibilities are split by domain:

- `projectService.js`: project structure, tree scanning, document operations
- `settingsService.js`: recent projects and workspace preferences
- `credentialService.js`: API-key lookup and encrypted storage
- `aiService.js`: agents, chat requests, and conversations
- `aiTools.js`: validated agent tools
- `gitService.js`: Git subprocess operations
- `pdfService.js`: story PDF orchestration
- `storage.js`: serialized atomic writes

Keep renderer code away from direct Node.js or filesystem access. Add a narrow preload method and validated main-process handler when a native capability is required.

## Commands

```bash
npm run dev                 # Start Vite and Electron in development mode
npm run check               # Run ESLint
npm run build               # Build main, preload, and renderer bundles
npm run dist:win            # Package Windows x64
npm run dist:mac:arm        # Package macOS ARM64
npm run dist:mac:universal  # Package macOS Universal
npm run dist:linux          # Package Linux x64 AppImage
```

Run platform packaging on its native operating system. In particular, build macOS artifacts on macOS.

## Making changes

1. Create a focused branch.
2. Read the relevant service/component before editing.
3. Preserve unrelated local changes.
4. Keep IPC payloads small, serializable, and validated.
5. Use project-relative paths and pass them through existing containment checks.
6. Use `atomicWrite` for durable project/settings writes.
7. Update user documentation when behavior, project format, shortcuts, AI data flow, or prerequisites change.
8. Run the checks and perform a focused smoke test.

## Code style

- JavaScript ES modules and React functional components.
- Follow the existing ESLint configuration.
- Prefer small domain functions over expanding `src/main/index.js`.
- Keep Electron lifecycle/IPC registration in `index.js` and business logic in services.
- Keep Redux state serializable; editor instances, DOM selection, and layout state belong in components.
- Use MUI for application controls and chrome.
- Keep manuscript typography/layout rules in the editor stylesheet rather than MUI theme overrides.
- Avoid large headers, excessive whitespace, and decorative UI that reduces writing space.
- Comment workarounds with the underlying reason, especially pagination and Windows filesystem behavior.

## Filesystem and project safety

Project files may contain irreplaceable writing. Changes affecting storage must:

- Reject traversal outside the active project.
- Avoid following arbitrary user-supplied paths without normalization.
- Preserve unrelated files.
- Prefer atomic replacement for file content.
- Avoid destructive migration without a backup or explicit confirmation.
- Maintain compatibility with external text editors and Git.

Do not silently normalize or rewrite an entire project merely because it was opened.

## Markdown changes

`markdownAdapter.js` defines the supported round-trip format. When adding Markdown syntax:

1. Implement parsing into the Tiptap document model.
2. Implement serialization back to Markdown.
3. Verify nested marks and links.
4. Verify autosave does not alter unrelated supported content.
5. Test page boundaries, copy/paste, undo/redo, and PDF output.
6. Document the newly supported syntax.

Unsupported syntax must not be advertised as preserved.

## Pagination changes

Pagination is especially sensitive to font metrics, zoom, block margins, DOM wrappers, and fractional display scaling. A visually harmless wrapper can change page calculation.

For pagination/editor changes, manually verify:

- A one-page document.
- A paragraph crossing a page boundary.
- Lists and headings near a boundary.
- A multi-page chapter.
- Explicit page breaks.
- 100% and non-100% zoom.
- Caret placement and selection near page gaps.
- Switching documents repeatedly.
- Windows fractional display scaling when available.
- PDF export of the same content.

Do not patch `node_modules` to fix pagination. Implement a repository-owned workaround or replace/update the dependency explicitly.

## AI changes

AI is optional and must not weaken local project safety.

- Never log or send the API key to the renderer beyond configuration status.
- Preserve the environment-variable override and encrypted storage behavior.
- Keep `store: false` unless a documented product decision changes it.
- Validate agent paths and tool arguments in the main process.
- Grant tools only from the allowlist stored in the selected agent.
- Keep story and lore write permissions separate.
- Notify the renderer after tools modify project files.
- Clearly document any new data sent to an external service.
- Treat model output and selected document text as untrusted input.

New tools should have a narrow purpose, strict JSON schema, path containment, bounded output, and an understandable UI permission label.

## Manual verification

There is intentionally no large automated test suite at this stage. Before submitting a change, run:

```bash
npm run check
npm run build
```

Then smoke-test the affected workflow. For general UI or storage changes, a useful minimum is:

1. Create or open a temporary project.
2. Open and edit a chapter.
3. Confirm autosave and reopen the file.
4. Switch between chapter, lore, timeline, and agent documents.
5. Restart the app and confirm recent-project restoration.
6. Exercise the feature you changed and its obvious failure path.

Use synthetic project data in bug reports and tests. Do not commit personal novels, conversations, or API credentials.

## Dependency policy

All dependencies must be genuinely open source. Do not add packages that require a Pro/Team account, license token, paid runtime, source-available agreement, or restricted commercial terms.

Before adding a dependency, check:

- License and transitive license compatibility
- Maintenance status
- Electron/Node compatibility
- Native build requirements on all release platforms
- Bundle and installer impact
- Whether a small repository-owned implementation is clearer

Update `package-lock.json` in the same change.

## Documentation

User-visible behavior belongs in `README.md` or `docs/USER_GUIDE.md`. Keep examples aligned with the current project schema and UI.

Documentation should distinguish:

- Implemented behavior from planned behavior
- Project-portable data from machine-local settings
- Local operations from OpenAI API calls
- Safe defaults from potentially destructive actions
- Editor appearance from exact PDF/Word layout guarantees

## Pull requests

A good pull request contains:

- A concise description of the user-visible outcome.
- The reason for the change.
- Important implementation or compatibility decisions.
- Manual verification performed.
- Screenshots for meaningful visual changes.
- Documentation updates where applicable.

Keep unrelated refactors separate from behavior changes when practical.

## Release workflow

Pushes to `main` trigger the GitHub Actions release workflow. It builds Windows, macOS ARM, macOS Universal, and Linux artifacts. A release and tag are created only after every platform succeeds.

If no semantic version tag exists, the first automatic tag is `v1.0.0`. Otherwise, the workflow increments the highest tag's minor version and resets patch to zero. For example, `v1.4.0` becomes `v1.5.0`; manually creating `v2.0.0` makes the next automatic release `v2.1.0`.

Do not push trivial documentation experiments directly to `main` unless creating a release is intended.

## Reporting bugs

Include:

- Operating system and version
- Storywriter release or commit
- Display scaling and editor zoom for rendering issues
- Minimal project structure or sanitized Markdown that reproduces the issue
- Exact steps and observed behavior
- Relevant terminal/main-process error text
- Screenshot or short recording for layout problems

Never include API keys, private novel text, or unredacted AI conversations.

## License

By contributing, you agree that your contribution will be distributed under the project's [MIT License](LICENSE).
