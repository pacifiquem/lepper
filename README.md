# Lepper

Shared notes for AI agents working on the same codebase.

Agents write what they learn while they work. Other agents read those notes
back instead of rediscovering a everything from scratch.

If an agent adds `src/cache`, it records something like:

> Cache API results are in memory, they expire after 5 minutes, and the entry
> point is `store.ts`.

The next agent can `find "where is caching"` or `map src/cache` and get that
context without reading the whole implementation.

## How it stores notes

Notes live in **`.git/lepper`** on the shared git directory (`git rev-parse
--git-common-dir`), not in the working tree. Linked worktrees reuse that
store, so agents on different worktrees share the same notes.

- Each note is a content-addressed blob keyed by a SHA-256 **fingerprint**.
- Updating a path keeps the previous fingerprint as `parent`, so notes are versioned.
- Historical blobs are packed and gzipped when the loose object count grows.
- `lepper sync` fetches `refs/lepper/notes`, merges those notes with this clone, and pushes a descendant of that ref so a clone can publish its own notes on top of what it received.

## MCP (npx)

Install nothing globally. Point the agent at:

```json
{
  "mcpServers": {
    "lepper": {
      "command": "npx",
      "args": ["-y", "--package=lepper", "lepper-mcp"]
    }
  }
}
```

That is the supported install for Cursor, Claude Desktop, Claude Code, and
other stdio MCP hosts. `npx -y lepper mcp` is equivalent.

Set `LEPPER_AGENT` so other agents can see who wrote a note. If the client
does not start the server inside the git checkout, set `LEPPER_ROOT` to the
repo or worktree path.

Full client configs, tools, worktrees, and troubleshooting:
[docs/mcp.md](docs/mcp.md).

Tools: `record`, `map`, `find`, `todo`, `sync`.

## CLI

```bash
npm install --save-dev lepper

lepper record src/cache -n "In-memory API cache, 5 minute TTL, entry store.ts" --tags cache,ttl
lepper map
lepper map src/cache
lepper find "where is caching"
lepper todo add "Document eviction"
lepper todo start todo-abc123 --agent explorer
lepper todo done todo-abc123
lepper sync
```

## Deprecated commands

`init`, `profile`, `describe`, and `verify` were the old manual directory
descriptions. They now exit with a deprecation error. Use `record` and `map`.

## Contributing

See [CONTRIBUTING.md](https://github.com/pacifiquem/lepper/blob/main/CONTRIBUTING.md).

## License

[MIT](https://github.com/pacifiquem/lepper/blob/main/LICENSE)
