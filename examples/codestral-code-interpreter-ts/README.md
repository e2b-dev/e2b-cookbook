# AI Code Execution with Mistral's Codestral

This project tests capabilities of the new Mistral's model on data analysis tasks, using the [Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) by E2B. Codestral doesn't support using tools for code execution yet, so in this Python example, we added the code interpreting capabilities. We are going to build an AI agent that performs data analysis tasks on provided data, in a form of a csv file.


# Installation

First, cone the E2B Cookbook repository, and navigate to the correct directory.


## Install dependencies

Ensure all dependencies are installed via `npm install`.

- `@mistralai/mistralai`
- `@e2b/code-interpreter`
- `dotenv`


## Set up environment variables

Create a `.env` file in the project root directory and add your API keys:

- Copy `.env.template`   to `.env`
- Get the [E2B API KEY](https://e2b.dev/docs/getting-started/api-key)
- Get the [MISTRAL API KEY](https://console.mistral.ai/api-keys/)

# Usage

Ensure you have the `city_temperature.csv` dataset file in the project root directory.


## Run the program:

    npm run start


The script performs the following steps:
    
- Loads the API keys from the environment variables.
- Uploads the `city_temperature.csv` dataset to the E2B sandboxed cloud evnironment.
- Sends a prompt to the Codestal model to generate Python code for analyzing the dataset.
- Executes the generated Python code using the E2B Code Interpreter SDK.
- Saves any generated visualization as PNG file.