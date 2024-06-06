# Claude Code Interpreter with Bedrock in JS/TS
This is an example of running LLM-generated code tasks in a secure and isolated cloud environment using the E2B Code Interpreter SDK.

## Techstack
- [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) for running the LLM-generated code
- [Amazon Bedrock](https://aws.amazon.com/bedrock/)
- [Anthropic AI SDK](https://www.npmjs.com/package/@anthropic-ai/sdk) for using Claude as an LLM
- JavaScript/TypeScript


## 1. Prerequisites

- Create an AWS account
- Copy `.env.template`   to `.env`
- Get the [E2B API KEY](https://e2b.dev/docs/getting-started/api-key)
- Get the [ANTHROPIC API KEY](https://console.anthropic.com/settings/keys)
- Set up [access to available Bedrock foundation models ](https://us-east-1.console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess)

## 2. Install packages

Install the E2B Code Interpreter SDK and the Anthropic AI SDK.

```
npm i
```

### Additional setup tips:

Check the version of AWS:
`aws --version`

Make sure you have dotenv module installed:
`npm install dotenv`

Verify the AWS credentials are working:
`aws sts get-caller-identity `

Find your AWS session token:
`aws sts get-session-token`

Install SDK for accessing Bedrock
`npm install @anthropic-ai/bedrock-sdk`

Subscribe to Anthropic models: https://us-west-2.console.aws.amazon.com/bedrock/home?region=us-west-2#/modelaccess

List available models
`aws bedrock list-foundation-models --region=us-west-2 --by-provider anthropic --query "modelSummaries[*].modelId"`


## 3. Run the example

```
npm run start
```


![Example of the output](example.png)

If you encounter any problems, please let us know at our [Discord](https://discord.com/invite/U7KEcGErtQ).

If you want to let the world know about what you're building with E2B, tag [@e2b_dev](https://twitter.com/e2b_dev) on X (Twitter).

## 4. Visit our docs
Check the [documentation](https://e2b.dev/docs) to learn more about how to use E2B.