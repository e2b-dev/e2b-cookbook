"""Build the E2B template that 1-run-code-exec.py runs on: the stock desktop plus PyAutoGUI.

Run it once per E2B team; it takes a few minutes.

    uv run --env-file .env template.py
"""

from e2b import Template, default_build_logger

from code_exec import TEMPLATE

# PyAutoGUI and its dependencies, pinned. python-xlib replaces the python3-Xlib fork PyAutoGUI asks for: the desktop's
# X server listens only on an abstract socket, which python3-Xlib cannot reach.
PACKAGES = [
    "pyautogui==0.9.54", "mouseinfo==0.1.3", "pygetwindow==0.0.9", "pymsgbox==2.0.1", "pyperclip==1.11.0",
    "pyrect==0.2.0", "pyscreeze==1.0.1", "pytweening==1.2.0", "python-xlib==0.33", "six==1.17.0", "pillow==11.3.0",
]

template = (
    Template()
    .from_template("desktop")
    .set_user("root")
    .apt_install(["python3-tk"])  # importing PyAutoGUI exits without tkinter
    .run_cmd("pip install --no-deps " + " ".join(PACKAGES))
    .set_user("user")
    .set_workdir("/home/user")
)

# The same size as the stock desktop template.
Template.build(template, TEMPLATE, cpu_count=8, memory_mb=8192, on_build_logs=default_build_logger())
