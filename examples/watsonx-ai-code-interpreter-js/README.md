# Code Interpreter with IBM WatsonX AI

This example shows how to add code interpreting using the [Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) to an LLM running on IBM's WatsonX AI inference platform.

## Setup Instructions

1. **Clone the repository**
```bash
git clone https://github.com/e2b-dev/e2b-cookbook/
cd e2b-cookbook/examples/watsonx-ai-code-interpreter-js/
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env.local` file in the root directory based on the provided `.env.template`:

```env
# Get your credentials at dataplatform.cloud.ibm.com:
# - Under developer access, select the default project
# - Get the project ID
# - Get the wastonxai URL
# - Create an API key
WATSONX_PROJECT_ID = "project_id"
WATSONX_URL = "https://region.ml.cloud.ibm.com"
WATSONX_API_KEY = "your_api_key"

# Get your API key at e2b.dev:
E2B_API_KEY = "your_api_key"
```

4. **Start the development server**
```bash
npm run dev
```
