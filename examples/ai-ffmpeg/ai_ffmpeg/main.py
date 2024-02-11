from typing import List
import asyncio
from dotenv import load_dotenv
from e2b import Session
import openai
import json
from functions import functions

load_dotenv()
session: Session

custom_backend = """
from matplotlib.backend_bases import Gcf
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.backend_bases import FigureManagerBase

FigureCanvas = FigureCanvasAgg

class FigureManager(FigureManagerBase):
    def show(self):
        self.canvas.figure.savefig('/tmp/figure.png')

def show(*args, **kwargs):
    for num, figmanager in enumerate(Gcf.get_all_fig_managers()):
        figmanager.canvas.figure.savefig(f"/tmp/figure_{num}.png")
"""
plot_code = """
import matplotlib.pyplot as plt
plt.plot([1, 2, 3, 4])
plt.ylabel('some numbers')
plt.show()
"""
plot_code = """
import matplotlib.pyplot as plt; plt.plot([1, 2, 3, 4]); plt.ylabel('some numbers'); plt.show()
"""


async def write_matplotlibrc():
  global session
  matplotlibrc = """
  backend: module://e2b_matplotlib_backend
  """
  await session.filesystem.write("/home/user/matplotlibrc", matplotlibrc)

async def create_matplolib_backend():
  await session.filesystem.write("/usr/lib/python3.10/e2b_matplotlib_backend.py", custom_backend)

async def plot_chart():
  global session

  # Print sys.path in python
  # proc = await session.process.start("python3 -c 'import sys; print(sys.path)'")
  # await proc
  # content = await session.filesystem.list("/usr/lib/python3.10")
  # for item in content:
  #   print(item.name)
  # exit()

  # Install matplotlib
  # install_matplotlib = await session.process.start("pip3 install matplotlib")
  # await install_matplotlib

  # await write_matplotlibrc()
  # await create_matplolib_backend()

  await session.filesystem.write("/tmp/plot.py", plot_code)
  print("RUNNING PLOT")
  run_proc = await session.process.start("python3 plot.py", cwd="/tmp")
  await run_proc

  content = await session.filesystem.list("/tmp")
  for item in content:
    print(item.name)
    if item.name == "figure_0.png":
      file_bytes = await session.filesystem.read_bytes("/tmp/figure_0.png")
      # Save file_bytes to a local file
      with open("./figure_0.png", "wb") as f:
        f.write(file_bytes)

messages = [
  {"role": "system", "content": "You are a proffesional ffmpeg operator. You help the user with any video and image editing prompts using ffmpeg. You work in a cloud environment with ffmpeg installed. You can run ffmpeg commands by calling the run_ffmpeg function and let user upload files by calling the upload_file function."},
    {"role": "user", "content": "Extract audio from the video file",},
    {"role": "assistant", "name": "upload_file" ,"content": '{"remote_path": "/tmp/video.mp4", "description": "The local path to video file to upload and extract audio from"}'},
    {"role": "assistant", "name": "run_ffmpeg" ,"content": '{"cmd": "ffmpeg -i /tmp/video.mp4 -vn -acodec copy /tmp/audio.aac"}'},

    # {"role": "user", "content": "Convert the video to gif"},
]

async def upload_file(remote_path: str, description: str):
  global session
  path_to_file = input(f"{description}: ")
  await session.filesystem.write_bytes(remote_path, open(path_to_file, "rb").read())

async def run_ffmpeg(cmd: str):
  global session
  ffmpeg = await session.process.start(cmd)
  out = await ffmpeg
  return out

async def start_session():
  global session
  session = await Session.create(
    # id="Python3",
    id="YI58BPyX5KrK",
    on_stdout=lambda output: print("[INFO] ", output.line),
    on_stderr=lambda output: print("[ERROR] ", output.line),
    env_vars={"MATPLOTLIBRC": "/home/user/matplotlibrc"}
  )

  await plot_chart()
  exit()

  # fix_date = await session.process.start("sudo apt-get -y install ntp")
  # await fix_date
  # await asyncio.sleep(1)

  # detect_display = await session.process.start("echo DISPLAY: $DISPLAY")
  # await detect_display

  # install_ffmpeg = await session.process.start("sudo apt -y update && sudo apt -y install ffmpeg")
  # await install_ffmpeg

  # print("====")
  # ffmpeg_version = await session.process.start("date")
  # ffmpeg_version = await session.process.start("ffmpeg -version")
  # await ffmpeg_version

def chat():
  response = openai.ChatCompletion.create(
      model="gpt-4",
      messages=messages,  # Use the updated messages list
      functions=functions,
      # function_call="auto",  # auto is default, but we'll be explicit
      # max_tokens=1024
  )
  return response

async def main():
  global session
  await start_session()
  finished_reasoning = True

  while True:
    if finished_reasoning:
      user_input = input("> ")

    messages.append({"role": "user", "content": user_input})
    response = chat()
    print(response)

    content = response["choices"][0]["message"]

    if content.get("function_call"):
      function_name = content["function_call"]["name"]
      function_args = json.loads(content["function_call"]["arguments"])
      print(function_args)

      if function_name == "upload_file":
        finished_reasoning = False
        remote_path = function_args.get("remote_path")
        description = function_args.get("description")
        await upload_file(remote_path, description)
        messages.append({"role": "user", "content": f"File uploaded to {remote_path}"})
      elif function_name == "run_ffmpeg":
        cmd = function_args.get("cmd")
        output = await run_ffmpeg(cmd)
        print(output.stdout)
        print(output.stderr)

        bytes_data = await session.filesystem.read_bytes("/tmp/output.gif")
        # Save bytes_data to a local file
        with open("./output.gif", "wb") as f:
          f.write(bytes_data)

        # if output.stderr:
        #   messages.append({"role": "user", "content": f"I got the following error: {output.stderr}"})
        #   finished_reasoning = False
        # elif output.stdout:
        #   messages.append({"role": "user", "content": output})
        #   finished_reasoning = True

asyncio.run(main())

