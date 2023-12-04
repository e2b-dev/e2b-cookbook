import os
from dotenv import load_dotenv
from e2b import Sandbox
load_dotenv()

def prompt_user_for_github_repo():
     github_repo_url = input("Please provide the URL of your public GitHub repository: ")
     repo_url = github_repo_url
     return repo_url

repo_url = prompt_user_for_github_repo()

