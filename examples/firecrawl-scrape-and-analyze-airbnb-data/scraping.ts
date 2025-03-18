//@ts-ignore
import * as fs from 'fs'
import FirecrawlApp from '@mendable/firecrawl-js'
import 'dotenv/config'
import { config } from 'dotenv'
import { z } from 'zod'

config()

export async function scrapeAirbnb() {
  try {
    // Initialize the FirecrawlApp with your API key
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })

    // Define the URL to crawl
    const listingsUrl =
      'https://www.airbnb.com/s/San-Francisco--CA--United-States/homes'

    const baseUrl = 'https://www.airbnb.com'
    // Define schema to extract pagination links
    const paginationSchema = z.object({
      page_links: z
        .array(
          z.object({
            link: z.string(),
          })
        )
        .describe('Pagination links in the bottom of the page.'),
    })

    const params2 = {
      pageOptions: {
        onlyMainContent: false,
      },
      extractorOptions: { extractionSchema: paginationSchema },
      timeout: 50000, // if needed, sometimes airbnb stalls...
    }

    // Start crawling to get pagination links
    const linksData = await app.scrapeUrl(listingsUrl, params2)
    console.log(linksData.data['llm_extraction'])

    let paginationLinks = linksData.data['llm_extraction'].page_links.map(
      (link) => baseUrl + link.link
    )

    // Just in case is not able to get the pagination links
    if (paginationLinks.length === 0) {
      paginationLinks = [listingsUrl]
    }

    // Define schema to extract listings
    const schema = z.object({
      listings: z
        .array(
          z.object({
            title: z.string(),
            price_per_night: z.number(),
            location: z.string(),
            rating: z.number().optional(),
            reviews: z.number().optional(),
          })
        )
        .describe('Airbnb listings in San Francisco'),
    })

    const params = {
      pageOptions: {
        onlyMainContent: false,
      },
      extractorOptions: { extractionSchema: schema },
    }

    // Function to scrape a single URL
    const scrapeListings = async (url) => {
      const result = await app.scrapeUrl(url, params)
      return result.data['llm_extraction'].listings
    }

    // Scrape all pagination links in parallel
    const listingsPromises = paginationLinks.map((link) => scrapeListings(link))
    const listingsResults = await Promise.all(listingsPromises)

    // Flatten the results
    const allListings = listingsResults.flat()

    // Save the listings to a file
    fs.writeFileSync(
      'airbnb_listings.json',
      JSON.stringify(allListings, null, 2)
    )
    // Read the listings from the file
    const listingsData = fs.readFileSync('airbnb_listings.json', 'utf8')
    return listingsData
  } catch (error) {
    console.error('An error occurred:', error.message)
    throw error;
  }
}
