# 🏠 Craigslist Housing Analysis with Olostep + Gemini + E2B

This example demonstrates how to scrape and analyze Craigslist housing data using the **Olostep API** for web scraping, **Google Gemini 2.0 Flash** for AI-powered data extraction, and **E2B Code Interpreter** for data analysis and visualization.

## 🎯 What it does

1. **🕷️ Web Scraping**: Uses Olostep API to fetch raw HTML content from Craigslist housing pages
2. **🤖 AI Extraction**: Feeds HTML to Gemini AI to extract structured JSON data from JSON-LD schemas
3. **🧹 Data Cleaning**: Processes and filters extracted data, removing null fields and duplicates
4. **📊 Analysis**: Uses E2B's Python sandbox to analyze housing data with pandas, matplotlib, and seaborn
5. **📈 Visualization**: Generates publication-ready charts and insights about SF Bay Area housing market

## 🚀 Features

- **Real-time scraping** of Craigslist housing data across multiple Bay Area regions
- **AI-powered extraction** of property details from JSON-LD structured data
- **Smart data processing** that only shows fields with actual values (no null clutter)
- **Rich visualizations** including property type distribution, location analysis, and market insights
- **Robust error handling** for API failures and data validation
- **Clean output** with structured JSON data and multiple visualization charts

## 📋 Prerequisites

- Node.js 18+ installed
- TypeScript support
- API Keys for:
  - **Olostep API** (get from [Olostep](https://olostep.com))
  - **Google Gemini API** (get from [Google AI Studio](https://makersuite.google.com/app/apikey))
  - **E2B API** (get from [E2B](https://e2b.dev))

## 🔧 Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the project root:
   ```bash
   OLOSTEP_API_KEY=your_olostep_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   E2B_API_KEY=your_e2b_api_key_here
   ```

3. **Run the analysis:**
   ```bash
   npm run start
   ```

## 📊 Generated Outputs

The analysis creates several files:

### 📄 Data Files
- `craigslist_listings.json` - Structured property data extracted from Craigslist (generated after running)
- `sample_craigslist_listings.json` - Sample output data to show expected format

### 📈 Visualization Charts
When you run the analysis, it generates multiple PNG files with visualizations:
- Property type distribution (pie chart)
- Location frequency analysis (bar chart) 
- Price distribution histogram (when price data is available)
- Bedroom/bathroom distribution analysis
- Property features breakdown
- Market insights and trends

## 🔍 How It Works

### 1. Web Scraping with Olostep
```typescript
// Scrapes multiple Craigslist regions
const searchUrls = [
  'https://sfbay.craigslist.org/search/rea#search=2~gallery~40', // Real estate
  'https://sfbay.craigslist.org/search/eby/apa#search=2~gallery~56', // Apartments
]

const response = await fetch('https://api.olostep.com/v1/scrapes', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OLOSTEP_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    formats: ["markdown", "html"],
    wait_before_scraping: 3000,
    url_to_scrape: searchUrl
  })
})
```

### 2. AI-Powered Data Extraction with Gemini
```typescript
// Extracts structured data from HTML using Gemini AI
const extractionPrompt = `
Parse this Craigslist page and extract real estate listings from JSON-LD structured data.
LOOK FOR: <script type="application/ld+json" id="ld_searchpage_results">
Extract: name, price, location, bedrooms, bathrooms, square_feet, property_type
`

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: extractionPrompt }] }]
    })
  }
)
```

### 3. Data Analysis with E2B
```typescript
// Creates Python sandbox for data analysis
const codeInterpreter = await Sandbox.create()

// Analyzes data and generates visualizations
const analysisCode = `
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Load and analyze housing data
df = pd.DataFrame(listings)
# Generate charts and insights...
`

const result = await codeInterpreter.runCode(analysisCode)
```

## 📈 Sample Analysis Results

The analysis provides insights such as:

- **Property Distribution**: 67.3% Apartments, 22.4% Houses, 10.2% Places
- **Top Locations**: Hayward (8 listings), Oakland (4 listings), San Lorenzo (2 listings)
- **Bedroom Analysis**: Average 1.8 bedrooms, range 1-3 bedrooms
- **Bathroom Analysis**: Average 1.5 bathrooms, range 1-3 bathrooms
- **Market Insights**: Price trends, location preferences, property features

## 🔧 Configuration

### Scraping Targets
Modify `searchUrls` in `scraping.ts` to target different Craigslist regions or categories:

```typescript
const searchUrls = [
  'https://sfbay.craigslist.org/search/rea',     // Real estate for sale
  'https://sfbay.craigslist.org/search/apa',     // Apartments for rent
  'https://losangeles.craigslist.org/search/rea', // LA real estate
]
```

### Analysis Parameters
Adjust analysis in `index.ts` by modifying the user message:

```typescript
const userMessage = `
Analyze this housing data and create:
1. Custom analysis type
2. Specific visualizations
3. Market insights
`
```

## 🛠️ File Structure

```
olostep-craigslist-analysis/
├── index.ts              # Main orchestration file
├── scraping.ts           # Olostep scraping logic
├── model.ts              # Gemini AI configuration
├── codeInterpreter.ts    # E2B sandbox setup
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── README.md             # This file
├── .env                  # Environment variables (create this)
└── Generated outputs:
    ├── craigslist_listings.json     # Structured data
    └── craigslist_analysis_*.png    # Visualization charts
```

## 🚨 Error Handling

The application includes robust error handling for:

- **API Rate Limits**: Automatic delays between requests
- **Data Validation**: Filters invalid or incomplete listings
- **JSON Parsing**: Handles truncated responses from Gemini
- **Network Issues**: Graceful fallbacks for failed requests
- **Price Extraction**: Smart parsing of various price formats

## 🎯 Use Cases

This example is perfect for:

- **Real Estate Analysis**: Market research and price trends
- **Investment Research**: Property investment opportunities
- **Market Intelligence**: Housing market insights
- **Data Pipeline Demos**: Showcasing web scraping + AI + analysis workflows
- **Academic Research**: Housing market studies and urban planning

## 🔄 Development

### Available Scripts

```bash
npm run start    # Run the full analysis pipeline
npm run dev      # Run with file watching for development
npm run build    # Compile TypeScript
npm run clean    # Remove generated files
```

### Debugging

Enable detailed logging by modifying the console output in each file. The application provides comprehensive logging for:

- Scraping progress and results
- AI extraction success/failure
- Data cleaning statistics
- Analysis execution status

## 📝 License

MIT License - feel free to use this example as a starting point for your own projects!

## 🤝 Contributing

This is part of the E2B Cookbook examples. Contributions and improvements are welcome!

---

**Built with ❤️ using Olostep + Gemini + E2B**