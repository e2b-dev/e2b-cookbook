import { spawn, exec } from 'child_process';
import path from 'path';
import dotenv from 'dotenv'
import util from 'util'
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// List of all scripts and their respective interpreters
const scripts = [
  
  // Works:
  { name: 'hello-world-js', interpreter: 'npm', file: './examples/hello-world-js/' },
  { name: 'claude-code-interpreter-js', interpreter: 'npm', file: './examples/claude-code-interpreter-js/' },
  { name: 'scrape-and-analyze-airbnb-data-with-firecrawl', interpreter: 'npm', file: './examples/scrape-and-analyze-airbnb-data-with-firecrawl/' },
  { name: 'together-ai-with-code-interpreting-js', interpreter: 'npm', file: './examples/together-ai-with-code-interpreting/together-ai-code-interpreter-js' },
  { name: 'fireworks-code-interpreter-python', interpreter: 'jupyter', file: './examples/fireworks-code-interpreter-python/fireworks_code_interpreter.ipynb' },
  { name: 'llama-3-code-interpreter-python', interpreter: 'jupyter', file: './examples/llama-3-code-interpreter-python/llama_3_code_interpreter.ipynb' },
  { name: 'upload-dataset-code-interpreter', interpreter: 'jupyter', file: './examples/upload-dataset-code-interpreter/llama_3_code_interpreter_upload_dataset.ipynb' },
  { name: 'o1-code-interpreter-python', interpreter: 'jupyter', file: './examples/o1-code-interpreter-python/o1.ipynb' },
  { name: 'codestral-code-interpreter-js', interpreter: 'npm', file: './examples/codestral-code-interpreter-js/' },
  { name: 'gpt-4o-code-interpreter-js', interpreter: 'npm', file: './examples/gpt-4o-code-interpreter-js/' },
  { name: 'codestral-code-interpreter-python', interpreter: 'jupyter', file: './examples/codestral-code-interpreter-python/codestral_code_interpreter.ipynb' },

  // Mostly works:
  { name: 'hello-world-python', interpreter: 'poetry', file: './examples/hello-world-python/' },
  { name: 'llama-3-code-interpreter-js', interpreter: 'npm', file: './examples/llama-3-code-interpreter-js/' },
  { name: 'o1-code-interpreter-js', interpreter: 'npm', file: './examples/o1-code-interpreter-js/' },

  // Doesn't work:
  // TypeError: string indices must be integers, not 'str'
  // { name: 'gpt-4o-code-interpreter', interpreter: 'jupyter', file: './examples/gpt-4o-code-interpreter/gpt_4o.ipynb' },
  // AttributeError: 'Beta' object has no attribute 'tools'
  // { name: 'claude-code-interpreter-python', interpreter: 'jupyter', file: './examples/claude-code-interpreter-python/claude_code_interpreter.ipynb' },
  // TypeError: 'NoneType' object is not subscriptable
  // Note: The LLM is reaching max tokens
  // { name: 'claude-visualize-website-topics', interpreter: 'jupyter', file: './examples/claude-visualize-website-topics/claude-visualize-website-topics.ipynb' },
  
  // Exception: No code interpreter results
  // Note: It looks like the LLM is not writing code, just asking for more info.
  // { name: 'together-ai-with-code-interpreting', interpreter: 'jupyter', file: './examples/together-ai-with-code-interpreting/together-ai-code-interpreter-python/together_with_e2b_code_interpreter.ipynb' },
  // TypeError: Missing required arguments; Expected either ('messages' and 'model')
  // { name: 'e2b_autogen', interpreter: 'poetry', file: './examples/e2b_autogen/' },
  // AttributeError: 'Result' object has no attribute 'raw'
  // { name: 'langchain-python', interpreter: 'poetry', file: './examples/langchain-python/' },
  // AttributeError: 'Result' object has no attribute 'raw'
  // { name: 'langgraph-python', interpreter: 'poetry', file: './examples/langgraph-python/' },

  // Untested:
  // { name: 'nextjs-code-interpreter', interpreter: 'npm', file: './examples/nextjs-code-interpreter/' },
];


// Install example dependencies before running tests
/*
const execPromise = util.promisify(exec);
for (const { name, interpreter, file } of scripts) {
  try {
    console.log(`Running ${name}...`);
    await execPromise(`${interpreter} install`, { cwd: file });
    console.log(`${name} completed.`);
  } catch (error) {
    console.error(`Error running ${name}:`, error);
  }
}
*/

// Test each script dynamically
describe('Integration test for multiple scripts', () => {

  jest.setTimeout(120000); // Set timeout

  scripts.forEach(({ name, interpreter, file }) => {
    it(`should execute ${name} successfully`, (done) => {

      let stdoutData = '';
      let stderrData = '';
      
      // Test example:
      const child = interpreter === "jupyter"
      ? spawn("poetry", ["run", "jupyter", "nbconvert", "--debug", "--to", "markdown", "--execute", "--stdout", file])
      : spawn(interpreter, ["run", "start"], { cwd: file,   env: { ...process.env }  });

      child.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      child.on('error', (error) => {
        done(error);
      });

      child.on('close', (code) => {
        try {
          console.log(`Child process for ${name} exited with code ${code}`);
          
          // If there's an error, log the stderr content
          if (stderrData && code != 0) {
            console.error(`stderr for ${name}:`, stderrData);
          }

          // Expect successful exit code
          expect(code).toBe(0);

          // Optionally, check for specific outputs (commented out but adaptable for individual scripts)
          // expect(stdoutData).toContain('Some expected output');
          
          done();
        } catch (error) {
          done(error);
        }
      });
    });
  });
});
