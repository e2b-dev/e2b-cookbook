import { Sandbox } from '@e2b/code-interpreter'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import open from 'open'
import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator'
import 'dotenv/config'

// Configuration from environment variables
const PORT_IN_SANDBOX = process.env.PORT_IN_SANDBOX ? parseInt(process.env.PORT_IN_SANDBOX) : 8000
const PROXY_PORT = process.env.PORT ? parseInt(process.env.PORT) : 80

// Start sandbox
const sandbox = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY,
})
console.log(`Sandbox created: ${sandbox.sandboxId}`)


// Start python file serving server inside of the sandbox
await sandbox.commands.run(
    `python3 -m http.server ${PORT_IN_SANDBOX}`,
    { background: true, cwd: '/', user: 'root' }
)
console.log(`Python HTTP server started on port ${PORT_IN_SANDBOX} inside sandbox`)


// Start express proxy to proxy requests to the sandbox
// Map custom subdomains to sandbox IDs - users can customize these subdomains however they want.
const customSubdomain = uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: '-',
    length: 3,
})
const sandboxCustomSubdomains: Record<string, string> = {
    [customSubdomain]: sandbox.sandboxId,
}

const app = express()

// Proxy middleware that maps custom subdomains to sandbox IDs
app.use((req, res, next) => {
    const host = req.headers.host || ''
    const subdomain = host.split('.')[0]

    // Check if this is a subdomain request (has at least one dot)
    if (!host.includes('.')) {
        return res.status(400).send('Please use subdomain format: <custom-subdomain>.<domain>')
    }

    // Look up sandbox ID by custom subdomain
    const sandboxId = sandboxCustomSubdomains[subdomain]

    if (!sandboxId) {
        return res.status(404).send(`Sandbox with subdomain "${subdomain}" not found`)
    }

    // Get the sandbox hostname for proxying
    const sandboxHost = sandbox.getHost(PORT_IN_SANDBOX)

    // Create proxy middleware dynamically
    const proxy = createProxyMiddleware({
        target: `https://${sandboxHost}`,
        changeOrigin: true,
        secure: true,
    })

    return proxy(req, res, next)
})

app.listen(PROXY_PORT, () => {
    console.log(`Proxy server running on http://localhost:${PROXY_PORT}`)
    console.log(`Sandbox ${sandbox.sandboxId} accessible via custom subdomain: "${customSubdomain}"`)
    console.log(`Access via: http://${customSubdomain}.localhost:${PROXY_PORT}/`)
})

// Open browser pointing to the custom subdomain
await open(`http://${customSubdomain}.localhost:${PROXY_PORT}/`)

// Keep process alive and handle cleanup
process.on('SIGINT', async () => {
    console.log('\nShutting down...')
    await sandbox.kill()
    process.exit(0)
})
