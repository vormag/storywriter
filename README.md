# Storywriter

Storywriter is a local-first desktop application for writing novels with structured Markdown chapters, lore, and timelines. It combines a paginated word-processor-style editor with Git-friendly project files and configurable OpenAI-powered writing assistants.

> **Development disclosure:** Storywriter was designed and implemented with substantial assistance from [OpenAI Codex](https://developers.openai.com/). The project maintainer is responsible for reviewing and maintaining the resulting code. Storywriter is an independent open-source project and is not an official OpenAI product.

Storywriter is currently an early-stage, single-user application. Keep your project under version control or maintain another backup while using it for important work.

## Highlights

- Plain Markdown files remain the source of truth.
- A4 or Letter pages with visible margins, page numbers, zoom, and explicit page breaks.
- Project-wide typography with bundled Literata and installed system fonts.
- Structured lore folders without a prescribed lore-page schema.
- A timeline with date/time pickers, chronological sorting, and a readable view mode.
- Configurable AI agents with per-agent prompts, models, reasoning levels, and tool permissions.
- Persistent local AI conversations and cached file summaries.
- Built-in Git pull, commit, and push actions.
- Story-only PDF export with chapter boundaries, page numbers, and PDF outline markers.
- Recent-project, workspace, zoom, panel, timeline-mode, and conversation restoration.
- Light and dark application themes.

## Platforms

The release workflow produces:

- Windows x64 installer (`.exe`)
- macOS Apple Silicon (`.dmg` and `.zip`)
- macOS Universal (`.dmg` and `.zip`)
- Linux x64 AppImage

macOS builds are currently unsigned and not notarized. macOS will therefore display a security warning and may require the application to be opened explicitly from Finder or allowed in Privacy & Security settings.

## Installation

### Download a release

Download the appropriate package from the repository's **Releases** page.

- On Windows, run the installer.
- On macOS, open the DMG and copy Storywriter to Applications. The first launch requires acknowledging the unsigned-app warning.
- On Linux, mark the AppImage executable if necessary and run it:

  ```bash
  chmod +x Storywriter-*.AppImage
  ./Storywriter-*.AppImage
  ```

### Run from source

Requirements:

- Node.js 22 or newer
- npm
- Git, if using the built-in Git actions

```bash
npm ci
npm run dev
```

Do not share one `node_modules` directory between Windows and WSL/Linux. Electron installs platform-specific binaries; install dependencies from the same operating system that will run the application.

## Quick start

1. Start Storywriter and choose **+ New**.
2. Select a dedicated folder and give the project a title.
3. Storywriter creates the project marker, initial chapter, lore and agent folders, timeline, and AI index directories.
4. Use **+** above the project tree to add chapters, lore categories, lore pages, or agents.
5. Select a chapter or lore page and begin writing. Changes autosave after a short pause.
6. Optionally initialize the project folder as a Git repository for history and remote backups.

Opening a normal folder without `.storywriter_project.json` adopts that folder as a Storywriter project and creates the missing initial structure. Use a dedicated folder and review its contents first.

For detailed instructions, see the [User Guide](docs/USER_GUIDE.md).

## Project format

A typical project looks like this:

```text
My Novel/
├── .storywriter_project.json
├── TIMELINE.md
├── story/
│   ├── chapter_001.md
│   └── chapter_002.md
├── lore/
│   ├── characters/
│   │   └── mara.md
│   └── places/
│       └── bellhaven.md
├── agents/
│   └── lorekeeper.json
└── .aiindex/
    ├── conversations/
    └── summaries/
```

### Story

Story files must be named `story/chapter_<number>.md`. Their numeric suffix controls chapter order; the first level-one heading is the title shown in the tree.

### Lore

Lore can use any nested folder organization. Each folder is displayed as a category, and each Markdown file is an independent lore page.

### Timeline

`TIMELINE.md` is a constrained Markdown table:

```markdown
| Date | Time | Event | Lore |
| --- | --- | --- | --- |
| 2050-03-17 | 08:30 | Mara reaches Bellhaven | [Bellhaven](lore/places/bellhaven.md) |
```

Date identifies each event, time and lore are optional, and **Rearrange** sorts rows by date and time. AI timeline tools require a date and sort automatically.

### Project marker

`.storywriter_project.json` contains portable project metadata such as title, page format, margins, and typography. Machine-specific UI state is stored in Electron's application-data directory rather than the novel folder.

## AI assistants

AI support is optional and requires an OpenAI API key. Either:

- Set `STORYWRITER_OPENAI_APIKEY` before starting the application; or
- Use **Add OpenAI key** in the Assistant panel. The key is encrypted using Electron's operating-system-backed secure storage.

The environment variable takes precedence over a stored key.

Agents are JSON files under `agents/`. Each agent defines:

- `name`
- `systemPrompt`
- `model`
- `reasoning`
- `tools`

The configured model must be available to the OpenAI account associated with the API key. API usage may incur charges from OpenAI.

Every request tells the selected agent which project file is open and includes selected editor text, if any. Messages, recent conversation history, the agent prompt, and content returned by enabled read/summary tools are sent to the OpenAI API. Tool-enabled agents can modify project files. Review tool permissions and keep backups.

See [AI assistants and tools](docs/USER_GUIDE.md#ai-assistants) for the full permission list and data-handling notes.

## PDF export

The **PDF** action exports all files in `story/` as one document in numeric chapter order. It:

- Starts every chapter on a new page.
- Uses project page size, margins, font, and base size.
- Justifies body paragraphs in the PDF only.
- Uses a 1.5 line height.
- Includes page numbers and chapter outline markers.
- Excludes lore, timeline, agents, and AI history.

PDF pagination uses Chromium's print engine, while the editor uses an interactive pagination extension. The result is intended to closely match the editor, but exact line breaks can still differ because the two layout engines are not identical.

## Markdown compatibility

The editor currently round-trips a focused Markdown subset:

- Headings
- Paragraphs
- Bold and italic
- Inline code and code blocks
- Ordered and unordered lists
- Blockquotes
- Links
- Hard breaks and horizontal rules
- Storywriter page breaks (`<!-- pagebreak -->`)

Images, general Markdown tables, footnotes, task lists, embedded HTML, and other extensions are not fully supported by the document editor. The timeline table is handled separately. Commit externally edited files before opening and saving them in Storywriter if they contain unsupported Markdown.

## Development commands

```bash
npm run dev                 # Electron development mode
npm run check               # ESLint
npm run build               # Production application bundle
npm run dist:win            # Windows x64 installer
npm run dist:mac:arm        # Apple Silicon DMG and ZIP
npm run dist:mac:universal  # Universal macOS DMG and ZIP
npm run dist:linux          # Linux x64 AppImage
```

Native packages should be built on their corresponding operating system. macOS packaging requires macOS.

## Architecture

```text
React + MUI renderer
  ├── Redux Toolkit workspace state
  ├── Tiptap Markdown editor
  ├── Timeline and agent editors
  └── narrow preload API
              │
Electron main process
  ├── project and settings services
  ├── OpenAI agent service and tools
  ├── credential storage
  ├── Git integration
  └── PDF export
              │
Local project folder
```

The renderer has no direct Node.js access. Electron context isolation and sandboxing are enabled, and filesystem operations are exposed through validated IPC methods.

## Current limitations

- Early-stage software; project backups are strongly recommended.
- No DOCX export yet.
- No automatic updater.
- macOS builds are unsigned and not notarized.
- Interactive and printed pagination may have small differences.
- The paginated editor can still have edge cases around unusual or unsupported document structures.
- No real-time collaboration or multi-user locking.
- No conflict-resolution UI for simultaneous external edits.
- AI calls are not available offline and depend on the configured model/account.
- AI output and edits can be incorrect; review changes before committing them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, repository conventions, checks, and pull-request guidance.

## License

Storywriter is licensed under the [MIT License](LICENSE).

The bundled Literata font is distributed under the SIL Open Font License; its license is included with the font assets and packaged application.
