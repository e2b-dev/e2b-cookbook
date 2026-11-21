package main

import (
	"context"
	"fmt"
	"log"
	"time"

	montygo "github.com/fugue-labs/monty-go"
)

func main() {
	// Create a WASM-sandboxed Python runner.
	// The WASM module is compiled once and reused across Execute calls.
	runner, err := montygo.New()
	if err != nil {
		log.Fatal(err)
	}
	defer runner.Close()

	ctx := context.Background()

	// Example 1: Execute Python code with resource limits
	result, err := runner.Execute(ctx,
		`
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

result = [fibonacci(i) for i in range(10)]
result
`,
		nil, // no inputs
		montygo.WithLimits(montygo.Limits{
			MaxDuration:       5 * time.Second,
			MaxMemoryBytes:    10 * 1024 * 1024, // 10MB
			MaxRecursionDepth: 100,
		}),
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Fibonacci sequence: %v\n", result)

	// Example 2: Pass inputs from Go into Python
	result2, err := runner.Execute(ctx,
		`
total = sum(values)
f"Processed {len(values)} items, total = {total}"
`,
		map[string]any{
			"values": []int{10, 20, 30, 40, 50},
		},
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Result: %v\n", result2)

	// Example 3: Expose Go functions to Python via external function callbacks
	result3, err := runner.Execute(ctx,
		`
data = fetch_data("users")
len(data)
`,
		nil,
		montygo.WithExternalFunc(
			func(ctx context.Context, call *montygo.FunctionCall) (any, error) {
				// In production, this would call your Go backend, database, or API
				return []map[string]any{
					{"name": "Alice", "age": 30},
					{"name": "Bob", "age": 25},
				}, nil
			},
			montygo.Func("fetch_data", "endpoint"),
		),
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("User count: %v\n", result3)
}
