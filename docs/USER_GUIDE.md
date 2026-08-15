# Storywriter User Guide

This guide covers installation, project organization, writing, lore, timelines, AI assistants, Git, PDF export, local data, backups, and troubleshooting.

## Contents

- [Core concepts](#core-concepts)
- [Installing Storywriter](#installing-storywriter)
- [Creating and opening projects](#creating-and-opening-projects)
- [The workspace](#the-workspace)
- [Writing and formatting](#writing-and-formatting)
- [Lore](#lore)
- [Timeline](#timeline)
- [AI assistants](#ai-assistants)
- [Conversation history](#conversation-history)
- [Git integration](#git-integration)
- [PDF export](#pdf-export)
- [Project and application data](#project-and-application-data)
- [Backups and safe usage](#backups-and-safe-usage)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## Core concepts

Storywriter is local-first. A project is an ordinary folder, and its Markdown and JSON files are the authoritative data. There is no proprietary manuscript database and no Storywriter account.

The application adds editing, navigation, pagination, AI, and export features over those files. You can inspect them with any text editor, commit them to Git, copy them between computers, and recover them without Storywriter.

Storywriter is designed for one person editing a local project. Do not open and edit the same project simultaneously in multiple Storywriter windows or on multiple machines without coordinating changes through Git.

## Installing Storywriter

### Windows

Download the Windows `.exe` release and run it. Windows may display a reputation warning for a new or unsigned build; inspect the release source and proceed only if you trust it.

### macOS

Choose the Apple Silicon build for an ARM Mac or the Universal build for compatibility with both ARM and Intel Macs. Copy Storywriter from the DMG into Applications.

Releases are unsigned and not notarized. On first launch, macOS may block the application. Use Finder's explicit **Open** action or the operating system's Privacy & Security controls if you trust the downloaded build.

### Linux

Download the AppImage, make it executable, and launch it:

```bash
chmod +x Storywriter-*.AppImage
./Storywriter-*.AppImage
```

Desktop integration varies by distribution and is not currently installed automatically.

### From source

Install Node.js 22 or newer and npm, then run:

```bash
npm ci
npm run dev
```

Electron downloads a platform-specific executable during installation. If moving between Windows, WSL, Linux, or macOS, remove `node_modules` and reinstall dependencies from the operating system that will run Storywriter.

## Creating and opening projects

### New project

Choose **+ New**, enter a title, and select a dedicated folder. Storywriter creates:

- `.storywriter_project.json`
- `story/chapter_001.md`
- `lore/`
- `agents/`
- `TIMELINE.md`
- `.aiindex/conversations/`
- `.aiindex/summaries/`

### Open an existing project

Choose **Open folder…** or select a recent project. A valid project contains `.storywriter_project.json` with a supported schema.

If the selected folder has no project marker, Storywriter adopts it and creates a new project structure inside it. Existing unrelated files are not shown in the project tree, but using a dedicated folder avoids mixing project data with other files.

If a marker already exists, `story/`, `lore/`, and `TIMELINE.md` must still exist. Storywriter reports an error rather than silently rebuilding those parts of a damaged existing project; a missing `agents/` directory is recreated.

### Recent projects

The welcome screen remembers up to twelve recent projects. Storywriter restores the last document, page, project-wide zoom, panel layout, timeline mode, and AI conversation when possible.

Moving or deleting a project outside Storywriter can leave a stale recent entry. Opening that entry will report that the folder no longer exists.

## The workspace

### Top toolbar

The top toolbar shows the project and active file and provides:

- PDF export
- Git pull, commit, and push
- Light/dark theme toggle
- New/open/close project actions
- Project-tree and Assistant-panel toggles

### Project tree

The left panel contains Story, Timeline, Lore, and Agents. Use:

- **+** to add a chapter, lore page, lore category, or agent.
- **↻** to rescan the project after external filesystem changes.
- **⋮** to rename or delete the selected item.

Renaming a chapter changes its heading but preserves its numbered filename and ordering. Renaming lore items changes filesystem names to lowercase underscore-separated slugs and updates direct project-relative Markdown links where supported.

Deleting a lore category recursively deletes its contents. This is a filesystem deletion; commit or back up the project first.

### Resizing panels

Drag the narrow separators between panels. Double-click a separator to restore its default width. Panel visibility and widths are remembered per project.

### Theme

The light/dark toggle changes application chrome. Manuscript pages remain white to preserve the paper view. Theme preference is remembered for the application.

## Writing and formatting

### Autosave

Storywriter autosaves roughly half a second after editing stops. The toolbar displays the current save state. Before switching documents, running Git operations, exporting, or sending an AI message, Storywriter saves pending changes.

Writes use a temporary file and replacement operation to reduce the risk of partial files. This does not replace backups or version control.

### Page view

Chapters and lore pages use a vertically stacked paper view. Project page settings currently support A4 and Letter data, with margins stored in `.storywriter_project.json`.

The page footer shows a page number. Page count and current page appear in the editor toolbar.

### Typography

Font family and base size are project-wide settings. They are saved in the project marker and affect every chapter and lore page.

- Literata is bundled and is the default at 16px.
- Installed system fonts appear in a searchable, previewed font selector.
- Heading sizes are derived from the base size.
- Zoom is project-wide and does not change the saved font size or intended pagination.

If a system font is unavailable on another computer, the editor falls back to an available serif font. Use bundled Literata when consistent cross-device appearance matters.

### Toolbar and shortcuts

- **B** or `Ctrl+B` / `Cmd+B`: bold
- **I** or `Ctrl+I` / `Cmd+I`: italic
- **H1**, **H2**, **H3**: toggle headings
- **↶**, **↷**: undo and redo
- **↵**: insert an explicit page break
- **−**, **+**, **1:1**: zoom controls

An explicit page break is stored as:

```markdown
<!-- pagebreak -->
```

### Links

Relative Markdown links to `story/`, `lore/`, or `TIMELINE.md` navigate inside Storywriter. HTTP, HTTPS, and mail links open through the operating system. Unsafe or unsupported URL schemes are rejected.

### Selecting text for AI

Select text in the document before moving to the Assistant input. Storywriter preserves a visible highlight and includes the selected text as context in the next AI request. Opening another file invalidates the previous selection context.

## Lore

Lore pages are Markdown files beneath `lore/`. Storywriter does not enforce page templates or category names.

Typical categories include:

```text
lore/
├── characters/
├── places/
├── events/
├── factions/
└── systems/
```

Nested folders are supported. The first `# Heading` is used as the tree label where possible.

When adding a lore page, choose the target category. If no category exists, Storywriter can create the page under `lore/notes`.

## Timeline

The timeline is stored in `TIMELINE.md` as a four-column Markdown table:

```markdown
| Date | Time | Event | Lore |
| --- | --- | --- | --- |
| 2050-03-17 | 08:30 | Mara reaches Bellhaven | [Bellhaven](lore/places/bellhaven.md) |
| 2050-03-17 |  | The northern gate closes |  |
```

### View mode

View mode groups events by date and displays the weekday:

```text
2050-03-17 (Thursday)
 • (08:30) Mara reaches Bellhaven (source)
 • The northern gate closes
```

The source link opens the associated lore page.

### Edit mode

Edit mode provides:

- A calendar date picker
- An optional time picker
- Event text
- An optional lore-page selector
- Per-row deletion
- **+ Event** and **Rearrange** actions

**Rearrange** sorts by date, then time, while preserving original order when both are equal. Timeline mode is remembered per project.

AI add/edit timeline tools rearrange events automatically. If the timeline is open when an AI tool changes it, the view refreshes.

## AI assistants

AI is optional. Normal writing, lore, timeline, Git, and PDF features do not require an API key.

### Configure an API key

You can provide a key in either of two ways.

Environment variable:

```text
STORYWRITER_OPENAI_APIKEY=your-key
```

Or choose **Add OpenAI key** in the Assistant panel. Storywriter encrypts the stored value through Electron's operating-system-backed secure-storage facility and writes only the encrypted value to its application-data directory.

The environment variable has priority. Do not commit API keys to a project, repository, agent JSON file, shell script, or screenshot.

### Create an agent

Use **+ → Agent** in the project tree. Select the new agent to edit:

- **Name:** display name in the Assistant selector.
- **System Prompt:** persistent role, behavior, and project instructions.
- **Model:** OpenAI model identifier available to your account.
- **Reasoning:** `none`, `low`, `medium`, `high`, `xhigh`, or `max`.
- **Tools:** explicit capabilities granted to the agent.

Example:

```json
{
  "name": "Lorekeeper",
  "systemPrompt": "Maintain established canon and distinguish revealed facts from author-only lore.",
  "model": "gpt-5.6-terra",
  "reasoning": "medium",
  "tools": ["list", "find", "read", "write_lore", "get_summary"]
}
```

The Assistant input remains disabled until an API key and agent are selected.

### Chat controls

- `Enter`: send message
- `Shift+Enter`: insert newline
- `Ctrl+Enter`: insert newline
- **+**: start a new conversation
- **◷**: browse saved conversations

Assistant responses render Markdown. Supported project links can be clicked to navigate.

### Automatic editor context

Every request contains the active project-relative file path. If document text is selected, that text is also included. Selected text is labeled as document content rather than an instruction.

The agent does not automatically receive the complete active file. It must have and use `read` or `get_summary` if it needs more content.

### Tools and permissions

Tools are granted per agent:

| Tool | Capability |
| --- | --- |
| `list` | List files and folders under `story/` or `lore/`. |
| `find` | Search literal text across story and lore files. |
| `read` | Read up to 500 lines from a requested line range; returns total line count. |
| `write_story` | Create chapters or replace whole/ranged content in story files. |
| `write_lore` | Create lore pages or replace whole/ranged content in lore files. |
| `add_timeline_event` | Add and sort a timeline event. |
| `remove_timeline_event` | Remove the single event matching an exact event name. |
| `edit_timeline_event` | Edit an exact event and sort the result. |
| `select_range` | Open a story/lore file and select an exact visible text occurrence. |
| `get_summary` | Generate or return a cached file summary. |

Write tools are constrained to their respective project folders. Story files created by AI must follow `story/chapter_<number>.md`. File paths are validated against traversal outside the project.

After a write tool runs, the project tree refreshes. If the changed file is open, the editor reloads it. Unsaved local changes are saved before sending a message, but you should still review and commit before broad AI editing tasks.

### Summaries

`get_summary` uses a faster OpenAI model and stores summaries under `.aiindex/summaries`. A checksum ties each cache entry to its source file; changed files are summarized again automatically.

### Data and cost considerations

Depending on the request and enabled tools, Storywriter sends the following to OpenAI:

- Agent system prompt, model, and reasoning configuration
- Your message and recent conversation history
- Active project-relative file path
- Selected text
- File contents read or summarized by tools
- Tool results required to complete the response

Requests use `store: false`, but OpenAI's handling of API data is governed by your OpenAI account and applicable API policies. API calls can incur charges. Storywriter does not calculate or cap spending.

AI responses may invent facts, damage prose, or make overly broad changes. Use narrow tool permissions, inspect diffs, and keep Git history.

## Conversation history

Conversations are saved as JSON files under `.aiindex/conversations` after a successful assistant response. They contain messages and agent metadata but not the API key.

The history dialog lists the most recently updated conversation first. You can open or remove conversations. Storywriter restores the remembered conversation when reopening the project and falls back to the most recently updated saved conversation if necessary.

Starting a new conversation clears the panel but does not delete older conversation files. Use the remove action in history to delete one.

Conversation history can contain project excerpts and sensitive prompts. Consider excluding `.aiindex/` from Git:

```gitignore
.aiindex/
```

## Git integration

Storywriter delegates to the `git` executable installed on the computer. It does not provide Git hosting, credentials, merge resolution, or repository initialization.

Initialize a repository from a terminal if needed:

```bash
cd /path/to/your/project
git init
git add .
git commit -m "Initial Storywriter project"
```

Built-in actions:

- **Pull:** runs `git pull --ff-only`. Diverged branches are not merged automatically.
- **Commit:** runs `git add --all` and commits every project change with the entered message—not only the active document.
- **Push:** runs `git push` using the configured branch, remote, and credentials.

Review `git status` and `git diff` externally when precise staging or conflict handling is needed.

Recommended project `.gitignore`:

```gitignore
.aiindex/
*.pdf
```

Whether to version conversations or exported PDFs is ultimately a project choice.

## PDF export

Choose **PDF** and select an output filename. Storywriter exports only numbered chapter files from `story/`, in numeric order.

The export uses:

- Project page format and margins
- Project font and base size
- Derived heading sizes
- 1.5 line height
- Justified body paragraphs
- Explicit page breaks
- A forced page break between chapters
- Page numbers
- Chapter headings as PDF outline/navigation entries where supported by the viewer

Lore, timeline, agents, AI conversations, and summaries are excluded.

For portable output, use bundled Literata. A system font may work on the current computer but be unavailable on another build machine.

## Project and application data

### Project data

Portable content belongs in the project folder:

- `.storywriter_project.json`: project identity, page settings, typography
- `story/`: chapters
- `lore/`: lore pages and categories
- `agents/`: AI agent configurations
- `TIMELINE.md`: timeline table
- `.aiindex/conversations/`: local conversation history
- `.aiindex/summaries/`: generated summary cache

### Machine-local application data

Recent projects, per-project workspace preferences, and encrypted credentials are stored in Electron's user-data directory. Typical locations are:

- Windows: `%APPDATA%\storywriter`
- macOS: `~/Library/Application Support/storywriter`
- Linux: `~/.config/storywriter`

Files include `settings.json` and, when configured through the UI, encrypted `credentials.json`. The actual location can vary with operating-system configuration.

## Backups and safe usage

Recommended practice:

1. Use one dedicated folder per novel.
2. Initialize Git before substantial work.
3. Commit before large imports, external edits, or AI write operations.
4. Push to a private remote or maintain another backup.
5. Close Storywriter before large filesystem reorganizations.
6. Avoid syncing and editing the same project concurrently on two machines.
7. Keep API keys out of the project folder.

Markdown makes recovery easier, but it does not prevent accidental deletion or unsupported-format loss.

## Troubleshooting

### Electron reports “Electron uninstall”

The installed Electron binary does not match the current environment or was not downloaded correctly.

1. Close Storywriter development processes.
2. Remove `node_modules`.
3. Run `npm install` or `npm ci` from the operating system that will run the app.
4. Do not reuse Windows dependencies from WSL or vice versa.

Do not patch files inside `node_modules`.

### The app opens to an empty or gray window

Run from a terminal and inspect the renderer/main-process error. For source builds, verify that `npm ci` and `npm run build` succeed. If switching operating systems, reinstall dependencies natively.

### A project folder is rejected

If `.storywriter_project.json` exists, verify that it is valid JSON with `schemaVersion: 1` and a non-empty title. Existing marked projects must contain `story/`, `lore/`, and `TIMELINE.md`; a missing `agents/` directory is recreated.

### A page flickers or the scrollbar changes size

Switch to another document and back, then restart Storywriter if necessary. Unusually structured or unsupported Markdown can destabilize the community pagination engine. Preserve the source file and report a minimal example when possible.

### A newly installed font is listed but not rendered

Restart Storywriter after installing the font. Some fonts expose family or face names differently across operating systems. Use Literata to confirm that bundled-font rendering works.

### Git actions fail

Verify from a terminal that:

- `git --version` works.
- The project is a Git repository.
- User name/email are configured for commits.
- A remote and upstream branch exist for pull/push.
- Authentication works without an interactive prompt Storywriter cannot display.

### The Assistant input is disabled

Both an API key and a selected agent are required. If the key exists, create or select an agent and ensure its JSON is valid.

### An OpenAI request fails

Check the model name, account access, API-key validity, network connection, and account limits. Tool-enabled requests can take longer and may perform several model/tool steps.

### macOS will not open the application

Current releases are unsigned. Use macOS's explicit open/allow flow only after verifying that you trust the downloaded artifact. There is currently no notarized build.

## Known limitations

- No DOCX export.
- No automatic updater.
- Unsigned macOS releases.
- Limited Markdown subset in the paginated editor.
- Interactive and PDF layout engines can produce slightly different line breaks.
- No collaborative editing, file locking, or merge-conflict interface.
- No in-app Git status, diff, branch, remote, or selective staging UI.
- No AI streaming response display.
- Conversation history is project-local but has no search or export UI.
- API usage and cost are not estimated in the application.
- AI edits are not automatically reviewed or reverted.
