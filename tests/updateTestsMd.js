import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths for the results and markdown files
const resultsPath = path.join(__dirname, 'results.json');
const markdownPath = path.join(__dirname, 'Tests.md');

// Read the Jest results
fs.readFile(resultsPath, 'utf8')
    .then((data) => {
        const results = JSON.parse(data);

        // Start constructing the Markdown table
        let markdownContent = `# Test Results\n\n`;
        markdownContent += `| Test Name | Status |\n`;
        markdownContent += `|-----------|--------|\n`;

        // Iterate through each test result and populate the Markdown table
        results.testResults.forEach((test) => {
            const testName = test.assertionResults[0].fullName;
            const status = test.status === 'passed' ? '✅ Passed' : '❌ Failed';
            markdownContent += `| ${testName} | ${status} |\n`;
        });

        // Write the Markdown content to Tests.md
        console.log(markdownContent)
        return fs.writeFile(markdownPath, markdownContent);
    })
    .then(() => {
        console.log('Tests.md updated successfully!');
    })
    .catch((err) => {
        console.error('Error processing test results:', err);
    });
