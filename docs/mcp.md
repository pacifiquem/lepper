# Lepper MCP

Lepper exposes an MCP server over stdio so coding agents can record and
retrieve project notes while they work. Install it with `npx` — no global
install is required.

## Install with npx

Use the dedicated `lepper-mcp` binary. `-y` skips the npx prompt, and
`--package=lepper` is what makes npx resolve the binary from this package.

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

Equivalent forms:

```bash
npx -y --package=lepper lepper-mcp
npx -y lepper mcp
```

The server speaks MCP on stdin/stdout as newline-delimited JSON. Older
clients that send `Content-Length` frames still get that framing back. Keep
logs off stdout.

### Cursor

Cursor Settings → MCP → add a server, or merge into
`.cursor/mcp.json` in the project (or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "lepper": {
      "command": "npx",
      "args": ["-y", "--package=lepper", "lepper-mcp"],
      "env": {
        "LEPPER_AGENT": "cursor"
      }
    }
  }
}
```

Cursor starts the server with the workspace as `cwd`, so worktrees work as
long as that workspace is the worktree checkout.

### Claude Desktop

Edit the desktop config (`claude_desktop_config.json`) and add the same
`npx` command. If the app does not start MCP inside the git checkout, set
`LEPPER_ROOT` to the repository (or worktree) path:

```json
{
  "mcpServers": {
    "lepper": {
      "command": "npx",
      "args": ["-y", "--package=lepper", "lepper-mcp"],
      "env": {
        "LEPPER_ROOT": "/absolute/path/to/repo",
        "LEPPER_AGENT": "claude-desktop"
      }
    }
  }
}
```

### Claude Code / Codex / other stdio hosts

```json
{
  "command": "npx",
  "args": ["-y", "--package=lepper", "lepper-mcp"],
  "env": {
    "LEPPER_AGENT": "codex"
  }
}
```

### Local checkout

```bash
yarn compile
node compiled/bin/lepper-mcp.js
```

Or `yarn mcp`.

## Tools

| Tool | Arguments | Purpose |
| --- | --- | --- |
| `record` | `path`, `note`, optional `title`, `tags`, `agent` | Save a note about a directory or file |
| `map` | optional `path` | Overview of recorded notes, optionally focused |
| `find` | `query`, optional `path`, `limit` | Natural-language search, e.g. "where is caching" |
| `codemap` | optional `path`, `symbol` | What calls what, for the languages in the 2025 Stack Overflow top 10 plus Go, Rust, Elixir, and Erlang |
| `blast` | `target`, optional `depth` | What depends on a file or symbol (`path`, `name`, or `path#symbol`) |
| `diary` | `action` (`recall` / `list` / `write`), plus `work`, `well`, `wrong` | Session retrospective shared across agents and clones |
| `todo` | `action` (`add` / `list` / `start` / `done`), plus `title` or `id` | Shared in-progress work |
| `sync` | none | Fetch `refs/lepper/notes`, merge with this clone, and push |

Example: after creating `src/cache`, call `record` with a note that the cache
is in-memory, expires in five minutes, and starts at `store.ts`. Another agent
can `find` "where is caching" and skip reading the implementation. Before
changing `get`, call `blast` with `src/cache.js#get` and read the callers and
importers that would break. `codemap` is the same graph, drawn from the caller
side. At the start of a session, call `diary` with action `recall` and
follow what to keep doing and what to stop. When you finish, `write` one line
of work plus what went well and what went wrong, then `sync`.

## Environment

| Variable | Purpose |
| --- | --- |
| `LEPPER_ROOT` | Git repository or worktree to use when `cwd` is not the project |
| `LEPPER_AGENT` | Name stored on notes, todos, and diary entries you write |

## Git worktrees

Notes are stored in the **shared** git directory (`.git/lepper` on the main
repo), not in `.git/worktrees/<name>/`. Every worktree of a clone reads and
writes the same note store, so agents on different branches still share
context.

`record` and `map` still resolve paths from the current worktree root, so
`src/cache` in a linked worktree is the same `./src/cache` note as in the
primary checkout.

`lepper sync` publishes `refs/lepper/notes` from that shared store.

## Troubleshooting

**`npx` cannot find `lepper-mcp`**
Use `--package=lepper`. `npx lepper-mcp` looks for a package named
`lepper-mcp`; the binary lives on the `lepper` package.

**`Lepper stores notes inside .git`**
The process `cwd` is not a git checkout. Point the MCP client at the
workspace, or set `LEPPER_ROOT`. Legacy clients that advertise roots are
asked for the workspace after initialization.

**Notes written in a worktree do not show up elsewhere**
Update to a build that stores under `git rev-parse --git-common-dir`. Older
builds wrote into the per-worktree git dir.
