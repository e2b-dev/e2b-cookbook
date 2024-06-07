
This example:
1. Starts an E2B sandbox with custom template
1. Prints the sandbox ID and URL
1. Have a React app running in the sandbox on the previously printed URL
1. Updates the React app's code in 15 seconds


## 1. Install dependencies
```sh
poetry install
```

## 2. Set API keys
Create `.env` fike and set following API keys
```sh
E2B_API_KEY=<your-e2b-api-key>
```

## 3. Run code
```
poetry run python3 main.py
```