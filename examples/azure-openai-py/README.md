1. Install OpenAI and E2B.

```
pip install e2b-code-interpreter openai==1.12.0 jupyter requests pytz pandas tenacity azure-search-documents==11.4.0b8

```


2. Retrieve keys and endpoint
To successfully make a call against Azure OpenAI, you need an endpoint and keys.
Create and assign persistent environment variables for your keys and endpoint.

ENDPOINT

This value can be found in the Keys & Endpoint section when examining your resource from the Azure portal. Alternatively, you can find the value in the Azure OpenAI Studio > Playground > Code View. An example endpoint is: https://docs-test-001.openai.azure.com/.


API-KEY
This value can be found in the Keys & Endpoint section when examining your resource from the Azure portal. You can use either KEY1 or KEY2.

Go to your resource in the Azure portal. The Keys & Endpoint section can be found in the Resource Management section. Copy your endpoint and access key as you'll need both for authenticating your API calls. You can use either KEY1 or KEY2. Always having two keys allows you to securely rotate and regenerate keys without causing a service disruption.

![Image](https://learn.microsoft.com/en-us/azure/ai-services/openai/media/quickstarts/endpoint.png)

E2B_API-KEY

Get your API key [here](https://e2b.dev/docs/getting-started/api-key).


3. Create a new Python application


4. Add functions
In order to use the OpenAI library or REST API with Microsoft Azure endpoints, you need to set your AZURE_OPENAI_ENDPOINT in the config.json file. We've prepopulated the MODEL_NAME and OPENAI_API_VERSION variables for you in the config.json file with default values. You can change these values if you like.

Add OPENAI_API_KEY as variable name and <Your API Key Value> as variable value in the environment variables.

One can get the OPENAI_API_KEY value from the Azure Portal. Go to https://portal.azure.com, find your resource and then under "Resource Management" -> "Keys and Endpoints" look for one of the "Keys" values.

Great example: https://github.com/Azure-Samples/openai/blob/main/Basic_Samples/Functions/working_with_functions.ipynb


Tools (previously called functions) is an optional parameter in the Chat Completion API which can be used to provide function specifications. This allows models to generate function arguments for the specifications provided by the user.

5. Steps for Function Calling with OpenAI:

Call the model with the user query and a set of functions defined in the functions parameter.
The model can choose to call a function; if so, the content will be a stringified JSON object adhering to your custom schema (note: the model may generate invalid JSON or hallucinate parameters).
Parse the string into JSON in your code, and call your function with the provided arguments if they exist.
Call the model again by appending the function response as a new message, and let the model summarize the results back to the user.