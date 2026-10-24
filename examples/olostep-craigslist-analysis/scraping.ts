import 'dotenv/config'

interface CraigslistListing {
  title: string
  price: number
  location: string
  bedrooms?: number
  bathrooms?: number
  square_feet?: number
  posting_date?: string
  url: string
}

// Helper function to extract listings from HTML using Gemini
async function extractListingsFromHTML(htmlContent: string, sourceUrl: string): Promise<CraigslistListing[]> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required for HTML parsing')
  }

  const extractionPrompt = `
Parse this Craigslist page and extract real estate listings from the JSON-LD structured data.

LOOK FOR: <script type="application/ld+json" id="ld_searchpage_results"> containing itemListElement array.

For each item in itemListElement, extract:
- name/title from item.name
- price from title (look for $X, $X/month, $X sq.ft patterns) or item.price
- location from item.address.addressLocality  
- bedrooms from item.numberOfBedrooms
- bathrooms from item.numberOfBathroomsTotal  
- square_feet from title (look for "X sq.ft" or "X sqft") or other fields
- property_type from item.@type (Apartment, House, Place, etc)

Extract numbers from price strings: "$250 sq.ft." → 250, "$3500/month" → 3500

Return JSON format:
{
  "listings": [
    {
      "title": "extracted name",
      "price": extracted_number_or_null,
      "location": "addressLocality", 
      "bedrooms": number_or_null,
      "bathrooms": number_or_null,
      "square_feet": number_or_null,
      "posting_date": null,
      "url": null,
      "property_type": "@type_value"
    }
  ]
}

Limit to first 25 listings to avoid truncation.

HTML Content:
${htmlContent.substring(0, 25000)}
`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: extractionPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          }
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = await response.json()
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    console.log('🔍 Gemini response preview:', textResponse.substring(0, 300))
    
    // Extract JSON from the response - handle both complete and truncated JSON
    let jsonMatch = textResponse.match(/\{[\s\S]*\}/)
    
    if (!jsonMatch) {
      // Try to find partial JSON if the response was truncated
      const partialMatch = textResponse.match(/\{[\s\S]*"listings":\s*\[[\s\S]*/)
      if (partialMatch) {
        // Try to fix truncated JSON by closing brackets
        let jsonStr = partialMatch[0]
        if (!jsonStr.includes('}]')) {
          // Count open objects and arrays to close them properly
          const openBraces = (jsonStr.match(/\{/g) || []).length
          const closeBraces = (jsonStr.match(/\}/g) || []).length
          const openArrays = (jsonStr.match(/\[/g) || []).length
          const closeArrays = (jsonStr.match(/\]/g) || []).length
          
          // Add missing closing characters
          for (let i = 0; i < openBraces - closeBraces; i++) {
            jsonStr += '}'
          }
          for (let i = 0; i < openArrays - closeArrays; i++) {
            jsonStr += ']'
          }
        }
        jsonMatch = [jsonStr]
      }
    }
    
    if (jsonMatch) {
      try {
        const extractedData = JSON.parse(jsonMatch[0])
        if (extractedData.message) {
          console.log('ℹ️ Gemini message:', extractedData.message)
        }
        console.log(`✅ Successfully parsed ${extractedData.listings?.length || 0} listings`)
        return extractedData.listings || []
      } catch (parseError) {
        console.log('⚠️ Failed to parse JSON:', parseError.message)
        console.log('Raw JSON attempt:', jsonMatch[0].substring(0, 300))
        
        // Try to extract individual listings even if full JSON failed
        const listingMatches = textResponse.match(/"title":\s*"[^"]*"/g)
        if (listingMatches && listingMatches.length > 0) {
          console.log(`📋 Found ${listingMatches.length} partial listings in truncated response`)
          // Return simple extracted listings
          return listingMatches.slice(0, 10).map((match, i) => {
            const title = match.match(/"title":\s*"([^"]*)"/)?.[1] || `Listing ${i + 1}`
            return {
              title,
              price: null,
              location: 'Unknown',
              bedrooms: null,
              bathrooms: null,
              square_feet: null,
              posting_date: null,
              url: `https://sfbay.craigslist.org/listing${i + 1}.html`
            }
          })
        }
        
        return []
      }
    }
    
    console.log('⚠️ No valid JSON found in Gemini response')
    console.log('Full response:', textResponse.substring(0, 500))
    return []
  } catch (error) {
    console.log('⚠️ Error extracting with Gemini:', error.message)
    return []
  }
}

export async function scrapeCraigslist(): Promise<string> {
  try {
    const OLOSTEP_API_KEY = process.env.OLOSTEP_API_KEY
    if (!OLOSTEP_API_KEY) {
      throw new Error('OLOSTEP_API_KEY is required')
    }

    // Scrape multiple Craigslist regions for more apartment data
    const searchUrls = [
      'https://sfbay.craigslist.org/search/rea#search=2~gallery~40',  // SF apartments
      'https://sfbay.craigslist.org/search/eby/apa#search=2~gallery~56',  // East Bay apartments 
    ]
    
    let allListings: CraigslistListing[] = []

    for (const [index, searchUrl] of searchUrls.entries()) {
      console.log(`🔄 Step 1: Scraping HTML from Craigslist (${index + 1}/${searchUrls.length}): ${searchUrl}`)
      
      // Step 1: Get HTML content from Olostep - use simple payload like your example
      const payload = {
        formats: ["markdown", "html"],
        wait_before_scraping: 3000,
        remove_css_selectors: "none",
        url_to_scrape: searchUrl
      }

      try {
        const response = await fetch('https://api.olostep.com/v1/scrapes', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OLOSTEP_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          console.log(`⚠️ Failed to scrape ${searchUrl}: ${response.status} ${response.statusText}`)
          continue
        }

        const data: any = await response.json()
        console.log(`✅ HTML scraped successfully. Status: ${data.result?.page_metadata?.status_code || 'unknown'}`)
        
        // Step 2: Extract HTML content from Olostep response
        let htmlContent = ''
        if (data.result?.html_content) {
          htmlContent = data.result.html_content
        } else if (data.result?.content) {
          htmlContent = data.result.content
        } else if (data.html_content) {
          htmlContent = data.html_content
        } else {
          console.log('⚠️ No HTML content found in response')
          console.log('Available fields:', Object.keys(data.result || data))
          continue
        }

        console.log(`📄 Got HTML content (${htmlContent.length} chars)`)
        
        // Step 3: Use Gemini to extract structured data from HTML
        console.log(`🤖 Step 2: Extracting listings from HTML using Gemini AI...`)
        const pageListings = await extractListingsFromHTML(htmlContent, searchUrl)
        console.log(`📋 Extracted ${pageListings.length} listings from this page`)
        
        if (pageListings.length > 0) {
          allListings = [...allListings, ...pageListings]
        }

        // Add delay between requests to be respectful
        if (index < searchUrls.length - 1) {
          console.log('⏱️ Waiting 3 seconds before next request...')
          await new Promise(resolve => setTimeout(resolve, 3000))
        }

      } catch (error) {
        console.log(`❌ Error scraping ${searchUrl}:`, error.message)
        continue
      }
    }

    console.log(`📈 Total raw listings collected: ${allListings.length}`)

    console.log('📋 Sample raw listings:')
    allListings.slice(0, 3).forEach((listing, i) => {
      console.log(`${i + 1}. "${listing.title}" - ${listing.location} - $${listing.price}`)
    })

    // Clean and validate the data - more lenient filtering
    const cleanedListings = allListings
      .filter(listing => {
        // More lenient filtering - just need title and location
        const hasTitle = listing.title && listing.title.length > 3
        const hasLocation = listing.location && listing.location.length > 1
        const validLocation = listing.location !== 'Unknown'
        
        if (!hasTitle) console.log(`❌ Filtered out: No title - "${listing.title}"`)
        if (!hasLocation) console.log(`❌ Filtered out: No location - "${listing.location}"`)
        if (!validLocation) console.log(`❌ Filtered out: Unknown location - "${listing.location}"`)
        
        return hasTitle && hasLocation && validLocation
      })
      .map(listing => {
        // Create clean listing object without null/undefined values
        const cleanListing: any = {
          title: listing.title,
          location: String(listing.location || '').trim(),
          property_type: listing.property_type
        }
        
        // Only add fields that have actual values
        if (listing.price && listing.price > 0) {
          cleanListing.price = Math.round(Number(listing.price))
        }
        
        if (listing.bedrooms && listing.bedrooms > 0) {
          cleanListing.bedrooms = listing.bedrooms
        }
        
        if (listing.bathrooms && listing.bathrooms > 0) {
          cleanListing.bathrooms = listing.bathrooms
        }
        
        if (listing.square_feet && listing.square_feet > 0) {
          cleanListing.square_feet = listing.square_feet
        }
        
        if (listing.posting_date && listing.posting_date.trim() !== '') {
          cleanListing.posting_date = listing.posting_date
        }
        
        // Add URL if it exists and is not default
        if (listing.url && !listing.url.includes('/search/apa')) {
          cleanListing.url = listing.url.startsWith('http') ? listing.url : 
                            listing.url.startsWith('/') ? `https://sfbay.craigslist.org${listing.url}` : 
                            listing.url
        }
        
        return cleanListing
      })
      .filter(listing => {
        // Allow listings without prices - many real estate listings don't show prices
        return !listing.price || (listing.price >= 100 && listing.price <= 50000)
      })
      // Remove duplicates based on title and price
      .filter((listing, index, self) => 
        index === self.findIndex(l => 
          l.title.toLowerCase() === listing.title.toLowerCase() && 
          l.price === listing.price
        )
      )

    console.log(`🧹 Final cleaned listings: ${cleanedListings.length}`)

    if (cleanedListings.length === 0) {
      console.log('⚠️ No valid listings found after cleaning and validation')
      console.log('   - Check if JSON-LD data exists in HTML')
      console.log('   - Verify extraction prompt is working correctly')
      console.log('   - May need to adjust filtering criteria')
      throw new Error('No valid listings extracted from any page')
    }

    // Save to file
    const fs = await import('fs')
    fs.writeFileSync('craigslist_listings.json', JSON.stringify(cleanedListings, null, 2))
    
    console.log(`💾 Saved ${cleanedListings.length} listings to craigslist_listings.json`)
    return JSON.stringify(cleanedListings)
    
  } catch (error) {
    console.error('❌ Scraping error:', error.message)
    throw error
  }
}