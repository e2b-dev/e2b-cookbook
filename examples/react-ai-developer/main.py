from dotenv import load_dotenv

import time
from e2b import Sandbox
load_dotenv()


code = """
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <p>
          Code edited with E2B SDK
        </p>
        <a
          className="App-link"
          href="https://e2b.dev"
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit E2B
        </a>
      </header>
    </div>
  );
}
export default App;
"""

custom_sandbox = "react-template"
with Sandbox(custom_sandbox) as sbx:
  react_dev_server_port = 3000
  react_app_url = sbx.get_hostname(react_dev_server_port)
  print(f"\n== Sandbox is running ===")
  print(sbx.id)
  print(f"https://{react_app_url}")
  print("======================================================")

  print("\n\nUpdating React app in 15 seconds...")
  time.sleep(15)

  sbx.filesystem.write("/home/user/my-app/src/App.js", code)
  print("Code edited")

  time.sleep(3600)
  print("Closing sandbox")



