FROM node:20-slim

# Install Node.js dependencies
RUN mkdir /app

# Install Node.js dependencies
WORKDIR /app

# Initialize a new Node.js project
RUN npm init -y

# Install Playwright Node.js package
RUN npm install playwright

# Install Playwright browsers and dependencies
RUN PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium

# Allow the user "user" to write output files
RUN chmod a+rwX /app