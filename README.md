# Threadboard (macOS)
This folder builds Threadboard.dmg (Apple Silicon and Intel) automatically on GitHub's free macOS machines.
Upload it to a new private GitHub repository, open Actions > Build Threadboard.dmg > Run workflow,
and the finished installers appear under Releases. Nothing needs installing on your Mac.
The app is not notarized by Apple, so the first launch needs right-click > Open.

## Password protection (workspaces and folders)
- Protected workspaces are encrypted (AES-256-GCM) before anything is written to disk. Keys come from your password via PBKDF2-SHA256 (600,000 iterations). Attached files are encrypted too.
- There is **no password recovery**. A forgotten password means the content cannot be opened.
- Workspace and folder *names*, dates, and the number of attached files are not encrypted; note titles, text, links and file contents are.
- References into a locked workspace keep working: only salted hashes of note titles are stored so a typed `@[Workspace/Title]` can still find its target. Clicking it asks for the password.

## Optional local AI assistant
Runs a free open-weight model on your own computer through Ollama (or any OpenAI-compatible local server). The app only talks to `localhost`. Locked workspaces are never read. Speed, quality and how many notes fit are limited by your hardware, the model and its context window.
