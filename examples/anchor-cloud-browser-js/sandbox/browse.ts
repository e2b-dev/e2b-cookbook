import { agentTask, client, Sessions } from 'anchorbrowser'

// The SDK reads ANCHORBROWSER_API_KEY. The host aliases it from ANCHOR_API_KEY.
client.setConfig({ auth: () => process.env.ANCHORBROWSER_API_KEY })

const session = await Sessions.createSession({
  body: {
    session: {
      timeout: { max_duration: 30, idle_timeout: 10 },
    },
  },
})

const sessionId = session.data?.id
if (!sessionId) {
  throw new Error('Anchor session did not return an id')
}

// cdp_url carries the API key in the query string. Print the live view only.
const liveViewUrl = session.data?.live_view_url
if (liveViewUrl) {
  console.log(`Live view: ${liveViewUrl}`)
} else {
  console.error('Anchor session did not return a live view URL')
}

try {
  const result = await agentTask('Go to example.com and return the page title', {
    sessionId,
    taskOptions: { url: 'https://example.com' },
  })
  const value = result.data?.result
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Anchor task did not return a result: ${JSON.stringify(value)}`)
  }
  console.log(`Result: ${value}`)
} finally {
  try {
    await Sessions.deleteSession({ path: { session_id: sessionId } })
  } catch (error) {
    console.error('Failed to delete Anchor session:', error)
  }
}
