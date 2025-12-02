# Mistral's Codestral with Code Interpreting and Dataset Analysis

**Powered by open-source [Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) by [E2B](https://e2b.dev/docs)**

This project demonstrates using Mistral's Codestral model with E2B's code interpreter to analyze temperature datasets. E2B's code interpreter SDK quickly creates a secure cloud sandbox powered by [Firecracker](https://github.com/firecracker-microvm/firecracker). Inside this sandbox is a running Jupyter server that the LLM can use.

Read more about Mistral's new Codestral model [here](https://mistral.ai/news/codestral/).

## Features

- Integration with Mistral's Codestral model for intelligent code generation
- Secure code execution in E2B sandboxed environment
- Automatic dataset analysis and visualization
- Temperature data analysis across multiple cities and regions

## Prerequisites

- Python 3.11 or higher
- Poetry (for dependency management)
- Mistral API key ([Get it here](https://console.mistral.ai))
- E2B API key ([Get it here](https://e2b.dev/docs))

## Installation

1. Clone this repository or navigate to the project directory:
```bash
cd codestral-code-interpreter-python
```

2. Install dependencies using Poetry:
```bash
poetry install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Add your API keys to the `.env` file:
```
MISTRAL_API_KEY=your_mistral_api_key_here
E2B_API_KEY=your_e2b_api_key_here
```

## Usage

Run the main script:
```bash
poetry run python main.py
```

The script will:
1. Upload the temperature dataset to the E2B sandbox
2. Generate and execute Python code to analyze the data
3. Save visualizations to the `./output/` directory
4. Download the generated plot from the sandbox to your local machine

Output files will be saved in the `./output/` directory (created automatically).

## Dependencies

This project uses the latest versions of:
- **mistralai** (^1.9.11) - Mistral AI Python SDK
- **e2b-code-interpreter** (^2.4.1) - E2B Code Interpreter SDK
- **python-dotenv** (^1.2.1) - Environment variable management

## Dataset Information

The project includes a temperature dataset (`city_temperature.csv`) with the following columns:
- `Region`: Geographic region (e.g., "North America", "Europe")
- `Country`: Country name (e.g., "Iceland")
- `State`: State name (can be null)
- `City`: City name (e.g., "Prague")
- `Month`: Month name (e.g., "June")
- `Day`: Day of month (1-31)
- `Year`: Year (e.g., 2002)
- `AvgTemperature`: Average temperature in Celsius

## How It Works

1. **Dataset Upload**: The temperature dataset is uploaded to the E2B sandbox
2. **LLM Interaction**: User sends a query to Codestral (e.g., "Plot average temperature over the years in Algeria")
3. **Code Generation**: Codestral generates Python code to analyze the data and save visualizations
4. **Execution**: The code is executed in the secure E2B sandbox
5. **File Download**: Generated visualizations are saved in the sandbox and downloaded to `./output/` directory
6. **Results**: The local path to the downloaded file is returned

## Customization

You can modify the analysis by changing the user message in `main.py`:

```python
code_results = chat(
    sandbox,
    client,
    "Your custom question here"  # Change this to your desired analysis
)
```

## Project Structure

```
.
├── main.py                      # Main application script
├── pyproject.toml              # Poetry configuration and dependencies
├── poetry.lock                 # Locked dependency versions
├── city_temperature.csv        # Temperature dataset
├── output/                     # Generated visualizations (created automatically)
│   └── *.png                   # Downloaded plots and charts
├── .env                        # Environment variables (create from .env.example)
├── .env.example                # Example environment variables
├── .gitignore                  # Git ignore file
└── README.md                   # This file
```

## License

This project is part of the [E2B Cookbook](https://github.com/e2b-dev/cookbook).

## Support

- [E2B Documentation](https://e2b.dev/docs)
- [Mistral AI Documentation](https://docs.mistral.ai)
- [Report Issues](https://github.com/e2b-dev/e2b-cookbook/issues)
