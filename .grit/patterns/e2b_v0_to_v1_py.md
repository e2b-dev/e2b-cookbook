---
tags: [e2b, python, sdk, upgrade]
---

# Upgrade E2B Python SDK from v0 to v1

This pattern upgrades the [E2B Python SDK from v0 to v1](https://e2b.dev/docs/quickstart/migrating-from-v0).

```grit
engine marzano(0.1)
language python

or {
    `Sandbox.create($params)` where {
        $params <: contains `template="$name"` => ., // `timeout_ms=300_000`,
        $params <: contains `cwd="$cwd"` => .
    } => `Sandbox.create(template="$name", $params) # TODO: cwd "$cwd" was removed, it can't be set on sbx anymore`,
    `Sandbox.create($params)` where {
        $params <: contains `template="$name"` => . // `timeout_ms=300_000`
    } => `Sandbox.create(template="$name", $params)`,
    `Sandbox.create($params)` where {
        $params <: contains `cwd="$cwd"` => ., // `timeout_ms=300_000`,
    } => `Sandbox.create($params) # TODO: cwd "$cwd" was removed, it can't be set on sbx anymore`,
    `$sbx.keep_alive($time)` => `$sbx.set_timeout($time)`,
    `Sandbox.reconnect($x)` => `Sandbox.connect($x)`,
    `$sbx.filesystem.write($path, $text)` => `$sbx.files.write($path, $text)`,
    `$sbx.upload_file($file)` => `$sbx.files.write($file)`,
    `$sbx.download_file($path)` => `$sbx.files.read($path)`,
    `$sbx.process.start_and_wait($params)` where {
        $params <: contains `cmd="$cmd"` => .,
    } => `$sbx.commands.run($cmd, $params)`,
    `$sbx.process.start_and_wait` => `$sbx.commands.run`,
    `$sbx.process.start($params)` where {
        $params <: contains `cmd="$cmd"` => .,
    } => `$sbx.commands.run($cmd, $params, background=True)`,
    `watcher = $sbx.filesystem.watch_dir($path)` => `` where {
        $program <: contains `watcher.add_event_listener($body)` => .,
        $program <: contains `await watcher.start()` => `await $sbx.files.watch_dir($path, $body)`
    },
    `$sbx.id` => `$sbx.sandbox_id`,
    `$sbx.file_url` => `$sbx.upload_url`,
    `$sbx.get_hostname` => `$sbx.getHost`,
    `$sbx.close()` => `$sbx.kill()`,
    $msg => `Sandbox` where { $msg <: "CodeInterpreter", $msg <: imported_from(`e2b_code_interpreter`) },
    `$sbx.notebook.exec_cell($params)` => `$sbx.run_code($params)`,
} where or {
    $program <: contains `from e2b import $_`,
    $program <: contains `from e2b_code_interpreter import $_`
}
```
