# How to Build and Run Docker in E2B Sandbox

This example shows you how to build your own E2B [sandbox template](https://e2b.dev/docs/sandbox-template) that supports running Docker containers inside an E2B sandbox.

## Prerequisites

- Node.js installed on your machine
- [E2B API key](https://e2b.dev/docs/getting-started/api-key)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up `.env` file

Create a `.env` file with your E2B API key:

```bash
E2B_API_KEY=your_api_key_here
```

## Build Your Docker Template

Before you can run Docker containers in E2B, you need to build a custom sandbox template with Docker installed.

### Development Template (recommended for testing)

Build a development template with the alias `e2b-with-docker-dev`:

```bash
npm run e2b:build:dev
```

This will:
1. Create a new E2B sandbox template based on Ubuntu 24.04 LTS
2. Install latest Docker CE, Docker CLI, containerd, Docker Buildx, and Docker Compose
3. Configure Docker to run with sudo
4. Register the template with the alias `e2b-with-docker-dev`

The build process takes about 30-60 seconds. You'll see detailed logs showing each step.

### Production Template (for long-term use)

For production use, build with the alias `e2b-with-docker`:

```bash
npm run e2b:build:prod
```

Then update `index.ts` to use `"e2b-with-docker"` instead of `"e2b-with-docker-dev"`.

## Run the Example

After building your template, run the example:

```bash
npm start
```

This will:
1. Create a sandbox using your custom template
2. Verify Docker is installed by running `docker --version`
3. Pull and run the `hello-world` Docker container
4. Display the output from the container
5. Clean up the sandbox

## What's in the Template?

The custom template (defined in `template/template.ts`) includes:

- **Base Image**: Ubuntu 24.04 LTS (latest LTS release)
- **Docker CE**: Latest version with CLI tools
- **Containerd**: Latest container runtime
- **Docker Buildx**: Modern build toolkit (supports multi-platform builds)
- **Docker Compose**: Container orchestration tool
- **Configuration**: Proper GPG keys and repository setup using modern keyrings directory
- **Start Command**: Runs Docker daemon on sandbox startup

## How It Works

The template builder:
1. Starts with a base Ubuntu 24.04 LTS image
2. Installs required dependencies (curl, gnupg, ca-certificates, etc.)
3. Adds Docker's official GPG key to the modern keyrings directory
4. Sets up the Docker repository with automatic architecture detection
5. Installs latest Docker CE, CLI tools, containerd, Buildx, and Compose plugins
6. Configures the sandbox to start the Docker daemon automatically

## Customization

You can customize the template by editing `template/template.ts`:

- Change the base image (e.g., use `e2bdev/code-interpreter` for Python support)
- Install additional packages
- Modify Docker configuration
- Change the Docker version

After making changes, rebuild your template:

```bash
npm run e2b:build:dev
```

## Template Aliases

- **Development**: `e2b-with-docker-dev` - Use this for testing and development
- **Production**: `e2b-with-docker` - Use this for production applications

You can have multiple templates with different configurations by changing the `alias` in the build files.

## Troubleshooting

### Template build fails

Make sure you have:
- A valid E2B API key in your `.env` file
- Internet connectivity
- Sufficient account credits

### Docker commands fail in sandbox

If Docker commands fail:
- Ensure you're using `sudo` when running Docker commands
- Wait for the Docker daemon to start (handled by `sleep 20` in the template)
- Check the template built successfully

### Sandbox creation fails with "Template not compatible with secured access"

This means you need to rebuild your template with the latest E2B SDK. Run:

```bash
npm run e2b:build:dev
```

## Learn More

- [E2B Documentation](https://e2b.dev/docs)
- [Sandbox Templates Guide](https://e2b.dev/docs/sandbox-template)
- [E2B Code Interpreter](https://github.com/e2b-dev/code-interpreter)
