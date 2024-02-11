functions = [
    {
        "name": "run_ffmpeg",
        "description": "Runs ffmpeg command in shell inside the cloud environment",
          "parameters": {
            "type": "object",
            "properties": {
                "cmd": {
                    "type": "string",
                    "description": "The command to run",
                },
            },
            "required": ["cmd"],
        },
    },
    {
      "name": "upload_file",
      "description": "Asks user to provide a file from their machine and uploads the file to the cloud environment",
      "parameters": {
        "type": "object",
        "properties": {
          "remote_path": {
            "type": "string",
            "description": "The path to upload the file to inside the cloud environment",
          },
          "description": {
            "type": "string",
            "description": "The description of the file to upload",
          },
        },
        "required": ["remote_path", "description"]
      }
    }
]