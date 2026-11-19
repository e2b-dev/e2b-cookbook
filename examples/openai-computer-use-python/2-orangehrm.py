"""Swivel chair: gpt-6-luna copies new hires from an Excel file into OrangeHRM, an HR system with no API in reach, and
writes the IDs it assigns back into the spreadsheet. You watch it live on an E2B desktop.

    uv run --env-file .env 2-orangehrm.py

LibreOffice Calc and OrangeHRM in Chrome share one desktop, and the model drives both through screenshots, mouse and
keyboard. The sandbox can reach only the public OrangeHRM demo. The finished spreadsheet is downloaded to ./output.
"""

from pathlib import Path

from e2b_desktop import Sandbox

from e2b_driver import MODEL, hold_open, live_view, run

ORANGEHRM = "opensource-demo.orangehrmlive.com"  # public demo, reset regularly; sign in as Admin / admin123
SHEET = "/home/user/Desktop/new_hires.xlsx"

TASK = f"""On this desktop, {SHEET} is open in LibreOffice Calc. Each row is a new hire who needs to be added to OrangeHRM at https://{ORANGEHRM} (username Admin, password admin123).

1. Read the rows in Calc.
2. Click Chrome in the taskbar so it is in front, open the OrangeHRM address and sign in.
3. Chrome may now offer to save the password in its own popup. If it is there, dismiss it with "No thanks" (or close it).
4. For each row open PIM > Add Employee, fill in the first, middle and last name, keep the Employee Id OrangeHRM suggests, and save. Note the Employee Id of each one.
5. Bring Calc back to the front, type each Employee Id into the "OrangeHRM Employee Id" column of its row, and save with Ctrl+S, keeping the Excel format.

Finish with a short table: name and OrangeHRM Employee Id."""

desktop = Sandbox.create(
    resolution=(1280, 800),  # screenshots are sent at this size, which fits the model's image limits
    timeout=900,
    network={
        "allow_out": [ORANGEHRM],  # the sandbox can reach only OrangeHRM (enforced by E2B)
        "deny_out": ["0.0.0.0/0"],
    },
)
try:
    live_view(desktop)
    print(f"Task ({MODEL}): {TASK.splitlines()[0]}\n")

    # Seed the desktop: LibreOffice in the sandbox turns the CSV into a real .xlsx on the Desktop.
    print("Seeding new_hires.xlsx on the desktop")
    desktop.files.write("/tmp/new_hires.csv", Path("new_hires.csv").read_text())
    desktop.commands.run("soffice --headless --convert-to xlsx --outdir /home/user/Desktop /tmp/new_hires.csv",
                         timeout=120)

    # Chrome first, Calc after it, so Calc is in front for the model's first screenshot. timeout=0 keeps both
    # running past the 60 seconds a background command otherwise gets.
    print("Opening Chrome and LibreOffice Calc\n")
    desktop.commands.run("google-chrome --user-data-dir=/tmp/chrome --no-first-run --no-default-browser-check "
                         "--window-position=0,0 --window-size=1280,800 about:blank", background=True, timeout=0)
    desktop.commands.run("xdotool search --sync --class chrome", timeout=60)
    desktop.commands.run(f"libreoffice --calc {SHEET}", background=True, timeout=0)
    desktop.commands.run("xdotool search --sync --name new_hires", timeout=60)

    answer = run(desktop, TASK, max_steps=200, time_limit=840)
    print(f"\n{answer}")

    Path("output").mkdir(exist_ok=True)
    Path("output/new_hires.xlsx").write_bytes(desktop.files.read(SHEET, format="bytes"))
    Path("output/2-orangehrm.png").write_bytes(desktop.screenshot())
    print("\nDownloaded the updated spreadsheet to output/new_hires.xlsx, final screen to output/2-orangehrm.png")
    hold_open()
finally:
    desktop.kill()
