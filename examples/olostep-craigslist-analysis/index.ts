import * as fs from 'fs'
import 'dotenv/config'
import { Sandbox, Execution } from '@e2b/code-interpreter'
import { Buffer } from 'buffer'
import { MODEL_NAME, SYSTEM_PROMPT, tools } from './model'
import { codeInterpret } from './codeInterpreter'
import { scrapeCraigslist } from './scraping'

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string
        functionCall?: {
          name: string
          args: Record<string, any>
        }
      }>
    }
    finishReason: string
  }>
}

async function chatWithGemini(
  codeInterpreter: Sandbox,
  userMessage: string
): Promise<Execution | undefined> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required')
  }

  console.log('🤖 Waiting for Gemini...')

  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: userMessage
          }
        ]
      }
    ],
    tools: [
      {
        functionDeclarations: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema
        }))
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: ["execute_python"]
      }
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify(requestBody),
      }
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`)
    }

    const data: GeminiResponse = await response.json()
    
    console.log(`\n${'='.repeat(50)}\nGemini response:\n${'='.repeat(50)}`)
    
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0]
      const parts = candidate.content?.parts || []

      // Look for function calls
      const functionCall = parts.find(part => part.functionCall)
      if (functionCall?.functionCall) {
        const toolName = functionCall.functionCall.name
        const toolArgs = functionCall.functionCall.args

        console.log(`\n${'='.repeat(50)}\nUsing tool: ${toolName}\n${'='.repeat(50)}`)

        if (toolName === 'execute_python') {
          const code = toolArgs.code
          return await codeInterpret(codeInterpreter, code)
        }
      }

      // If no function call, just print the text response
      const textParts = parts.filter(part => part.text)
      if (textParts.length > 0) {
        textParts.forEach(part => console.log(part.text))
      }
    }

    return undefined
  } catch (error) {
    console.error('❌ Error calling Gemini:', error.message)
    throw error
  }
}

async function run() {
  console.log('🏠 Craigslist Housing Analysis with Olostep + Gemini\n')

  // Load or scrape Craigslist data
  let data: string
  
  const readDataFromFile = (): string | null => {
    try {
      return fs.readFileSync('craigslist_listings.json', 'utf8')
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.log('📄 File not found, scraping fresh data...')
        return null
      } else {
        throw err
      }
    }
  }

  const fetchData = async () => {
    data = readDataFromFile()
    if (!data || data.trim() === '[]') {
      console.log('📄 File is empty or contains no data, scraping...')
      data = await scrapeCraigslist()
    }
  }

  await fetchData()

  // Parse and validate the data
  const listings = JSON.parse(data)
  console.log(`\n📊 Loaded ${listings.length} Craigslist listings`)

    // Create the analysis prompt
    const userMessage = `
Analyze this Craigslist housing data from the San Francisco Bay Area and create insightful visualizations. 

IMPORTANT: Only analyze listings that have price data. Filter out listings without prices before creating price-related charts.

Key analyses to perform:
1. Property type distribution (pie chart)
2. Location frequency analysis (bar chart of top 10 locations)
3. For listings WITH prices: Price distribution histogram
4. Bedroom/bathroom distribution analysis
5. Property features summary

Create clean, publication-ready visualizations with proper titles, labels, and colors. Save charts as PNG files.

Listing data: ${JSON.stringify(listings)}
`

  // Create code interpreter and run analysis
  const codeInterpreter = await Sandbox.create()
  
  try {
    const codeOutput = await chatWithGemini(codeInterpreter, userMessage)
    
    if (!codeOutput) {
      console.log('❌ No code output generated')
      return
    }

    // Log any console output
    if (codeOutput.logs) {
      console.log('\n📋 Code execution logs:')
      console.log(codeOutput.logs)
    }

    // Handle results
    if (codeOutput.results.length === 0) {
      console.log('❌ No visualization results')
      return
    }

    // Save any generated charts
    codeOutput.results.forEach((result, index) => {
      if (result.text) {
        console.log(`\n📊 Analysis result ${index + 1}:`)
        console.log(result.text)
      }

      if (result.png) {
        const pngData = Buffer.from(result.png, 'base64')
        const filename = `craigslist_analysis_${index + 1}.png`
        fs.writeFileSync(filename, pngData)
        console.log(`✅ Saved chart to ${filename}`)
      }
    })

  } catch (error) {
    console.error('❌ Analysis error:', error.message)
  } finally {
    await codeInterpreter.kill()
    console.log('\n🏁 Analysis complete!')
  }
}

// Handle uncaught errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})

run().catch(console.error)