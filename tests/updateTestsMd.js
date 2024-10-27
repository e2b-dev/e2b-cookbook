import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths for the results and markdown files
const resultsPath = path.join(__dirname, 'results.json');
const markdownPath = path.join(__dirname, 'Tests.txt');

// Read the Jest results
fs.readFile(resultsPath, 'utf8')
    .then((data) => {
        var markdownContent = ""
        const results = JSON.parse(data);

        // Iterate through each test result and populate the table
        results.testResults.forEach((test) => {
            test.assertionResults.forEach((assertion) => {
                const testName = assertion.title;
                const status = assertion.status === 'passed' ? '✅ Passed' : '❌ Failed';
                markdownContent += `| ${testName} | ${status} |\n`;
            });
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
