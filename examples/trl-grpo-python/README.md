# Code rewards for TRL GRPO with E2B

Use [Hugging Face TRL](https://huggingface.co/docs/trl/v1.14.2/grpo_trainer) to train a model with GRPO and use E2B to execute its generated Python code. A reward is the fraction of test cases the program passes. TRL owns generation and model updates; E2B supplies isolated code execution. The evaluator compares complete JSON results on your training host, outside the generated program.

See the [E2B TRL/GRPO guide](https://docs.e2b.dev/agents/trl) for an overview of the integration.

The tasks process JSON API-usage records: sum tokens, count requests, and filter successful requests per customer. They cover repeated customers, empty input, zero totals and large values. Separate evaluation tasks ask for input-token totals and error counts.

Use this workflow when correctness can be checked with trusted inputs and expected outputs. E2B keeps generated code off the training host, without requiring a code-execution service on the GPU machine. Remote execution also adds sandbox creation and network overhead; measure the reward stage for your workload before increasing its scale.

## How the example is connected

| File | Responsibility |
| --- | --- |
| `tasks.py` | Conversational prompts and trusted JSON test cases for training and held-out evaluation. |
| `rewards.py` | Native async TRL callback, reusable worker pool and host-side grading. |
| `evaluate.py`, `isolated_run.sh` | Trusted worker supervisor and fresh process/filesystem isolation for each test. |
| `reward_smoke.py` | Fixed correct and incorrect solutions, expected scores and remote cleanup reconciliation. |
| `train.py` | Model generation, GRPO updates, before/after evaluation and checkpoint/metrics output. |

For each prompt, TRL samples multiple candidate solutions, calls `code_reward` with the completions and their `test_cases`, then uses the returned scores to update the model. The callback returns one score per completion in the original order, even if sandbox evaluations finish in a different order. Dataset cases are available to the callback, but only the prompt is given to the model for generation. Expected outputs remain on the evaluator host.

## First reward: no GPU or model download

The commands use Python 3.12; the package supports Python 3.11–3.13. You also need [uv](https://docs.astral.sh/uv/getting-started/installation/) and an [E2B API key](https://docs.e2b.dev/api-key). E2B execution consumes sandbox resources; the evaluator checks at most two candidates concurrently.

```bash
git clone https://github.com/e2b-dev/e2b-cookbook.git
cd e2b-cookbook/examples/trl-grpo-python
uv sync --locked --python 3.12 --no-dev
cp .env.example .env
```

Set `E2B_API_KEY` in `.env`. Keep the file on the evaluator host; the example does not upload it or pass its contents to a sandbox.

```bash
uv run --locked --no-dev --env-file .env python reward_smoke.py
```

The smoke evaluates five fixed candidate programs with the same callback used for training. Expected rewards:

```json
{
  "correct": 1.0,
  "wrong": 0.0,
  "partial": 0.3333333333333333,
  "syntax_error": 0.0,
  "timeout": 0.0
}
```

The partial solution prints `{}` and passes only the empty-input case. Invalid syntax is rejected before sandbox creation. Logs identify created sandboxes and completed cleanup; the smoke also checks that no running or paused sandbox remains for its run. If evaluation or reconciliation fails, the command exits unsuccessfully rather than reporting a successful smoke.

### Trace a candidate

The first task's non-empty input includes records for `acme` with 12 and 8 tokens, plus `beta` with 3. Its expected result is `{"acme": 20, "beta": 3}`. The known correct candidate in `reward_smoke.py` reads the JSON array from stdin, aggregates each customer's tokens and prints one JSON object.

The callback extracts a fenced code block, validates its syntax, borrows a worker from the pool and runs it on every input in fresh isolated processes. The host compares each complete JSON output with the expected value. There are three cases: empty input, repeated customers, and zero/large totals. Passing all three gives `3 / 3 = 1.0`; printing `{}` only passes empty input and gives `1 / 3`. Candidate code never decides its own pass count.

### How the evaluator runs a candidate

Follow these four stages when changing execution or debugging a reward:

1. **Prepare on the host — [rewards.py](rewards.py).** `code_reward` validates the cases and calls `extract_code` to find the fenced program and check its syntax. `_evaluate` borrows a worker exclusively, then uploads the program as `solution.py` and the case inputs as `inputs.json`. Expected outputs remain on the host. Missing fences or invalid syntax score zero without running candidate code.
2. **Supervise on the worker — [evaluate.py](evaluate.py).** One SDK command runs this trusted script for the candidate's whole batch. It writes each case to stdin, launches an isolated runtime and collects exit status, bounded stdout and execution time. It does not determine whether an answer is correct.
3. **Isolate each test — [isolated_run.sh](isolated_run.sh).** The supervisor invokes this script inside fresh Linux namespaces under a remote deadline. It makes the worker filesystem read-only, mounts fresh writable temporary directories and runs Python as an unprivileged user. A separate PID namespace removes descendant processes when the test exits. The worker is reused, but each test's writable files and processes are discarded.
4. **Grade on the host — [rewards.py](rewards.py).** `matches_output` parses and compares complete JSON values with the trusted expectations, preserving value types. A case passes only with a successful exit and matching output; `_evaluate` returns `passed / len(cases)`. `code_reward` returns scores in completion order even when evaluations finish out of order.

For a new JSON-processing task, change prompts and cases in `tasks.py`. Changing the stdin/stdout contract also affects host grading in `rewards.py`; changing the isolation or deadline affects `evaluate.py` and `isolated_run.sh`. Verify those boundaries together before running model training.

## Train with GRPO

### Check baseline rewards

Choose an instruction-tuned coding model with a chat template and enough GPU memory for training. Set `TRAIN_MODEL` in your shell to its Hugging Face model ID or local directory. There is no default model: an untuned sample of `Qwen/Qwen2.5-0.5B-Instruct` gave zero reward on all 24 solutions. Model size alone does not guarantee a useful reward signal. Check your own baseline before spending time on training.

Install the optional training dependencies on your own training machine:

```bash
uv sync --locked --python 3.12 --extra training --no-dev
uv run --locked --extra training --no-dev --env-file .env python train.py \
  --model "$TRAIN_MODEL" --baseline-only
```

The configuration uses your selected model, two generations per prompt, a training batch size of two, eight steps and up to 256 completion tokens. It runs in one process on a CUDA GPU. Model weights download from Hugging Face onto that host; E2B does not host the model or training GPU. No model-provider API key or vLLM service is needed.

`--baseline-only` samples solutions for both the training tasks and held-out tasks without updating weights or saving a checkpoint. It prints sample completions and writes `training_results/baseline.json`, including reward and pool metrics. Inspect `baseline.train_tasks.eval_reward`, `baseline.held_out.eval_reward` and their `eval_frac_reward_zero_std` metrics. This uses your model compute and live E2B resources; it is separate from the fixed-program smoke.

If most prompt groups have equal rewards, inspect the printed programs, task difficulty, input schema, completion length and model capability. A mix of correct and incorrect programs for the same prompt is a useful starting signal. A nonzero mean alone does not ensure GRPO can learn: identical partial scores also give zero variance. Keep generation settings the same when comparing baseline with training.

### Run training

Once the reward signal is useful, run:

```bash
uv run --locked --extra training --no-dev --env-file .env python train.py \
  --model "$TRAIN_MODEL"
```

The short training configuration is a starting point for your experiment: GPU memory and learning results depend on the model, generation settings and tasks. Inspect the reward signal before extending a run. The five small tasks (three for training, two held out) illustrate the workflow; they do not establish broad coding quality.

### Task schema and reward interface

`train.py` owns one `RewardPool` and registers its async `pool.code_reward` directly with `GRPOTrainer`. TRL passes the dataset's `test_cases` column to the callback and uses its returned scores in completion order. No sync/async bridge or separate trainer adapter is required.

The callback signature is `async def code_reward(completions, test_cases, **kwargs)`. The extra keyword arguments accommodate TRL's other trainer fields. `train.py` builds `Dataset.from_list(TRAIN_TASKS)` and `Dataset.from_list(EVAL_TASKS)` and supplies the callback as `reward_funcs=pool.code_reward`, then closes the pool in `finally`. See [TRL's custom reward interface](https://huggingface.co/docs/trl/v1.14.2/grpo_trainer#using-a-custom-reward-function).

| Dataset column | Shape | Consumer |
| --- | --- | --- |
| `task_id` | String identifying the task. | Task organization. |
| `prompt` | List of messages with string `role` and `content`. | Model generation. |
| `test_cases` | List of objects with JSON strings `input` and `output`. | Host callback; `input` is stdin and `output` is the trusted expectation. |

The callback returns one numeric reward in `[0, 1]` per completion, in the same order. Serializing each case's JSON as a string keeps the Hugging Face column schema stable across different customer names.

### Training configuration

| Setting | Default | Change it when |
| --- | --- | --- |
| `--model` | Required | Selecting a model with a suitable chat template and a useful baseline reward signal. |
| `--baseline-only` | Off | Sampling both task splits before training without updating weights. |
| `--max-steps` | `8` | Extending the experiment after rewards and held-out evaluation behave as intended. |
| `--max-completion-length` | `256` | Generated programs or their closing code fences are being truncated. Longer generation also consumes model memory and time. |
| `num_generations` in `train.py` | `2` | Sampling more solutions per prompt; change generation batch settings together to satisfy TRL's grouping requirements. |
| `--sandbox-workers` | `2` | The reward stage is waiting for worker slots and account limits allow more active evaluations. This does not change GPU batch size. |
| `--create-interval` | `1.0 s` | Pacing initial/replacement creation. Use at least 1 second on Hobby or 0.2 seconds on Pro, leaving capacity for other clients. |
| Process deadline / worker TTL | `2 s` / `600 s` | Adapting execution budgets in `rewards.py`, `evaluate.py` and `isolated_run.sh`. TTL is refreshed while the pool is alive. |

The default uses BF16 on supported CUDA devices and otherwise FP32, gradient checkpointing and no vLLM. CLI settings can be passed to `train.py`; generation/batch settings are edited in its `GRPOConfig`. Sandbox settings are separate from model settings.

### Interpret held-out evaluation

The run evaluates the held-out tasks before and after training and saves:

- `training_results/checkpoint/`: model weights, configuration and tokenizer.
- `training_results/metrics.json`: configuration, before/after evaluation metrics, training metrics, log history and pool timing/resource counters.

Compare `before.eval_reward` and `after.eval_reward` in the metrics file. These are mean fractions of passed test cases over sampled completions, not the proportion of completely correct programs. Training reward may increase without improving these held-out tasks. If both generations receive the same reward, GRPO has no relative reward difference to learn from; inspect the task difficulty, completion length and reward definition before running a longer job.

Keep evaluation prompts and cases outside `TRAIN_TASKS`, compare the same generation settings before and after training, and repeat measurements before drawing conclusions from a small change. `history` contains step-level logs for examining training reward.

In those training logs, `frac_reward_zero_std` reports the fraction of prompt groups whose sampled solutions receive equal rewards. Near `1.0`, most groups have no relative reward signal. If scores are all zero, inspect generated programs, the prompt's field names/types, completion length and model capability. If scores are all one, use harder cases. More steps cannot create reward differences that the sampled solutions do not contain.

### CPU diagnostic

For a slower CPU diagnostic that checks the training and checkpoint path:

```bash
uv run --locked --extra training --no-dev --env-file .env python train.py \
  --model "$TRAIN_MODEL" --cpu --max-steps 1 --max-completion-length 64 --skip-eval
```

Short completions can truncate programs and produce zero rewards. Use the full completion budget and held-out evaluation for an actual training experiment.

## Use your own tasks

Edit `tasks.py`:

1. Write an instruction defining the input and output contract. This example reads one JSON array from stdin and prints one JSON object.
2. Add test inputs and trusted expected outputs with `case(records, expected)`. Keep expectations on the host; do not ask the candidate program to report its own score.
3. Put training tasks in `TRAIN_TASKS` and different prompts/test cases in `EVAL_TASKS`.
4. Run `reward_smoke.py` with a known correct solution for the changed task before training. Update its fixed candidates and expected scores when changing the first task.

The JSON strings in `test_cases` keep the Hugging Face dataset schema stable when customer names vary. Changing the input/output format requires updating the evaluator as well as the prompt.

For example, add this `task(...)` call to `TRAIN_TASKS` in `tasks.py`. The import line is only needed when the snippet runs as a separate file:

```python
from tasks import case, task

new_task = task(
    "output-tokens",
    'Sum the integer "output_tokens" field per customer. '
    'Do not add the integer "input_tokens" field.',
    [
        case([], {}),
        case(
            [
                {"customer": "acme", "input_tokens": 50, "output_tokens": 4},
                {"customer": "acme", "input_tokens": 10, "output_tokens": 6},
                {"customer": "beta", "input_tokens": 20, "output_tokens": 0},
            ],
            {"acme": 10, "beta": 0},
        ),
    ],
)
```

The helper supplies the conversational prompt, defines `customer` as a string and serializes each case's `input` and `output`. This instruction adds `output_tokens` and `input_tokens` as integers. Name any additional input fields and their types in the instruction: the model sees only the prompt, not the test cases, so it must not have to guess field names. Repeated customers test aggregation, differing input/output token counts expose summing the wrong field, and a zero total tests whether a customer is incorrectly omitted. Add cases for your intended domain and keep a different instruction, such as the existing error-count task, for held-out evaluation.

## Execution, failures and resource ownership

### Sandbox pool and concurrency

The default pool has two workers, each borrowed exclusively for one candidate. Extra candidates wait in the host queue. One pool belongs to one single-process trainer; distributed training is outside this recipe.

With six valid completions and two workers, the pool evaluates candidates in waves and keeps the same two workers for the next callback. This avoids repeating sandbox creation for each completion. A larger pool can reduce queueing when execution is the bottleneck, but does not accelerate GPU generation or weight updates. It also bills idle worker time while the model runs.

### Isolation and timeouts

Workers persist across callbacks, but each test starts a fresh unprivileged Python runtime in private Linux mount/PID/network/IPC namespaces. Worker files are read-only; `/tmp` and `/dev/shm` are ephemeral. Files and descendant processes do not persist across cases or candidates.

Each test has a two-second remote deadline. The trusted supervisor runs all cases through one SDK command, with a deadline of `2 × case count + 10` seconds. Output is capped at 64 KiB plus one overflow byte; oversized output fails grading.

The key and expected outputs stay on the host. Workers use `secure=True`, disabled outbound internet and a network namespace for each case. These tasks need only Python's standard library.

The default template must support Linux `unshare`, mount namespaces, `setpriv`, Python 3 and GNU `timeout`. Every new worker runs an isolation preflight. Unsupported templates fail rather than run candidates with weaker isolation. The generated program cannot write the trusted supervisor or grade its own output. This is a small example rather than a formally audited adversarial grading platform; validate changes to the template or isolation setup before using them for untrusted workloads.

### Failures and retries

Missing fences, invalid syntax, nonzero candidate exits, runtime limits, invalid JSON and incorrect results score zero. JSON key order is ignored; extra/missing data and mismatched value types fail.

Recoverable transport, unavailable-service, rate-limit and lost-worker errors get one evaluation retry on a replacement worker. Creation itself gets up to two attempts. Auth/configuration or isolation setup failures, exhausted retries and unresolved cleanup abort the run; they never become zero rewards. Candidate errors are not retried. This distinction prevents a service outage from becoming a negative training signal about otherwise valid code.

### Cleanup and cancellation

The owner closes the pool in `finally`, including partial initialization and cancelled evaluation. Shutdown runs on TRL's owning async loop, kills workers and checks run metadata for remaining allocations. Worker TTL is 600 seconds, refreshed every 200 seconds while the pool is alive, including during model generation. Your plan's maximum continuous runtime still applies.

A cancelled host coroutine does not prove the remote process stopped. Cancellation makes the pool unusable for further callbacks; the caller must close it. The per-test deadline stops remote execution; closing the pool terminates its workers. Forced host termination can bypass `finally`; the last renewed TTL is the backstop. Logs include run and sandbox IDs without candidate code or input data. If a creation response is lost, metadata reconciliation also finds workers whose IDs the caller never received; the pool cannot guarantee exactly one worker per creation request.

### Account limits and cost

| Limit | Hobby | Pro baseline |
| --- | --- | --- |
| Concurrent sandboxes | `20` | `100`, with add-ons for more. |
| Sandbox creations per second | `1` | `5` |
| Maximum continuous sandbox runtime | `1 hour` | `24 hours` |

Creation rate and concurrency are separate limits: launching 20 workers on Hobby requires pacing even though they may run together. Limits are shared across your project, so reserve capacity for other workloads. For a Pro workload you can increase `--sandbox-workers` and use `--create-interval 0.2`, subject to that shared capacity. A 100-worker pool can take at least about 20 seconds to create at five creations/second, plus initialization; this example creates workers serially, so actual startup can be longer. This is configuration guidance, not a validated 100-worker benchmark. The SDK also handles HTTP 429 with `Retry-After`.

### Measure your reward stage

`reward_smoke.py` prints pool counters; `train.py` writes them under `pool` in `metrics.json`:

| Metric | Meaning |
| --- | --- |
| `sandbox_create` | E2B creation API round trip, excluding pacing and initialization. |
| `pool_startup` | Full initial pool setup, including pacing, uploads and isolation preflight. |
| `candidate_execution_roundtrip` | One candidate's complete case batch, including SDK/transport overhead. |
| `case_execution_remote` | Worker-side execution time per case, including process/namespace setup. |
| `reward_batch` | Callback wall time, including queueing and initial startup when needed. |
| `worker_seconds_estimate` | Sum of full worker lifetimes, including idle time and cleanup. Starts at the creation request, so it is an estimate rather than an invoice. |

TRL logs `e2b/reward_seconds` and `e2b/worker_seconds_since_previous_reward` in its step history. The latter includes model-generation/update idle time since the preceding reward callback. TRL averages callback metrics within a logging step; these are not exclusive per-step billing allocations. Final pool totals also include time after the last callback. Compare these with total training step time to locate the bottleneck.

#### Example smoke measurements

The reference no-GPU run used two 2-vCPU/512-MiB workers and reused them across two callbacks. The first callback received five fixed candidates: correct, wrong, partial, invalid syntax and an intentional timeout. Four candidates reached execution, each against three cases; invalid syntax was rejected on the host. The second callback evaluated only the correct candidate against the same three cases. Together they executed 15 cases and created only two workers.

| Measurement | Observed |
| --- | --- |
| Sandbox creation API round trip, mean | `0.317 s` |
| Full initial pool setup | `4.75 s` |
| Candidate case batch round trip, mean | `1.92 s` |
| Worker-side case execution, mean | `0.495 s` |
| First callback: five candidates, including setup and intentional timeouts | `13.33 s` |
| Second callback: one correct candidate, pool already initialized | About `1.18 s` |
| Full worker lifetimes, summed estimate | `26.77 worker-seconds` |

The callback workloads differ, so their times do not measure the speedup from pooling. This smoke checks execution, failure handling and worker reuse; its deliberate timeouts also affect the averages. It does not measure GPU training throughput or learning quality. To compare pool sizes or cold and warm performance, use the same candidates and cases and measure your own workload.

Using [current resource prices](https://e2b.dev/pricing), this measured configuration costs approximately `2 × $0.000014 + 0.5 × $0.0000045 = $0.00003025` per worker-second. Its 26.77 worker-seconds estimate is about **`$0.00081`** in sandbox compute. For a training interval, multiply `e2b/worker_seconds_since_previous_reward` by the resource rate; for the whole run use the final pool total. One hundred workers at these exact resources would cost about **`$10.89/hour`** while alive, before the Pro subscription and model/GPU costs. Check your actual template resources, [billing limits](https://docs.e2b.dev/billing) and current prices rather than assuming every template has this configuration.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing key or authentication error | Set `E2B_API_KEY` on the evaluator host and use `--env-file .env`. CLI authentication or a key in another shell does not configure this process. |
| Default training refuses to start | It requires CUDA. Use the CPU command above only as a slower diagnostic. |
| Smoke passes but model rewards are zero | Inspect actual completions and the prompt's exact field names/types, fenced complete code, task difficulty, JSON format and completion length. Debug text on stdout invalidates JSON. |
| `frac_reward_zero_std` stays near `1.0` | Most prompt groups have equal rewards. Check whether tasks are too hard or too easy, then review generation count and task diversity. |
| Out of GPU memory | Reduce model size or sequence length and review TRL batch settings. Lower sandbox concurrency does not reduce model memory. |
| Backend errors or account limits | Fix service/configuration problems and reduce concurrency before retrying. These failures must not become model rewards. |
| Cleanup error or abrupt local termination | Inspect the logged run/sandbox IDs and confirm remote state. The sandbox TTL is the backstop; local termination alone is not proof of cleanup. |
| Better training reward without better held-out reward | Check overfitting and reward shortcuts; improve task/case diversity before simply increasing the number of steps. |

## Offline checks

```bash
uv sync --locked --python 3.12 --group dev
bash -n isolated_run.sh
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked pytest -q
```

These checks mock E2B and require no credentials or live resources. Installing the `training` extra additionally enables a test of the actual training entrypoint with a tiny locally constructed model and synthetic rewards; it performs no download or provider call:

```bash
uv run --locked --extra training pytest -q
```

Validate live rewards with `reward_smoke.py` on the evaluator host, and validate GPU training separately.

## Managed training with Fireworks AI

For GPU compute managed by a provider, see the [Fireworks AI Training API](https://docs.fireworks.ai/fine-tuning/training-api/introduction) and its [reinforcement learning cookbook](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/rl). E2B supplies the code-execution environment; Fireworks supplies model computation through its training API. This cookbook uses TRL on your CUDA host. Combining its evaluator with a Fireworks training loop is a separate integration and requires adapting the API calls.
