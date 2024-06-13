1. Install OpenAI and E2B.

```
pip install openai e2b-code-interpreter
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