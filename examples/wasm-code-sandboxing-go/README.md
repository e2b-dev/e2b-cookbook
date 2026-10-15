# WASM-based Code Sandboxing in Go with Monty-Go

This example demonstrates WASM-based Python code sandboxing using [Monty-Go](https://github.com/fugue-labs/monty-go), a Go library that runs Python code in a WebAssembly sandbox using [wazero](https://github.com/tetratelabs/wazero) (pure Go, zero CGO).

## Container vs WASM Sandboxing

E2B and Monty-Go represent two complementary approaches to code sandboxing:

| | E2B (Container-based) | Monty-Go (WASM-based) |
|---|---|---|
| **Environment** | Full OS with filesystem, network, packages | Minimal Python interpreter in WASM |
| **Startup time** | ~150ms (cloud sandbox) | Sub-millisecond (in-process) |
| **Capabilities** | Install packages, run shell commands, access network | Pure computation, external functions via Go callbacks |
| **Isolation** | VM-level isolation in the cloud | WASM memory sandbox, in-process |
| **Best for** | Complex multi-step code execution, data analysis, system tasks | Lightweight expression eval, formula execution, tight Go integration |

### When to Use Each

**Use E2B when you need:**
- Full Python package ecosystem (pandas, numpy, matplotlib)
- File system access, network requests, or shell commands
- Long-running or resource-intensive computations
- Complete OS-level isolation

**Use Monty-Go when you need:**
- Sub-millisecond startup for high-throughput evaluation
- Embedded Python execution inside a Go service
- Deterministic, resource-limited execution with strict memory/time caps
- Zero external dependencies (no containers, no cloud, no CGO)

## Setup

### 1. Install Go

Ensure you have [Go 1.22+](https://go.dev/dl/) installed.

### 2. Clone and run

```bash
cd examples/wasm-code-sandboxing-go
go run main.go
```

No API keys, containers, or external services required.

## How it works

Monty-Go embeds a Python interpreter compiled to WebAssembly. Each `Execute` call creates an isolated WASM instance with its own memory, so multiple executions cannot interfere with each other. Go functions can be exposed to Python code via callbacks, enabling sandboxed Python to interact with your Go backend.

## Next steps

- Combine both approaches: use Monty-Go for fast inline evaluations and E2B for heavy-lift tasks
- See the [Monty-Go documentation](https://github.com/fugue-labs/monty-go) for the full API reference
- See [E2B docs](https://e2b.dev/docs) for cloud sandbox capabilities
