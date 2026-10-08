# Warp a live OpenCode session into an E2B sandbox, fix a bug there, bring the fix home.
#
# Render with:  vhs demo.tape        (needs `vhs`, an E2B_API_KEY in .env, and a
#                                     provider you are logged into with `opencode auth login`)
#
# The tape drives the real OpenCode TUI inside demo-project/ (a small WIP library with
# one red test). Waits are conditioned on what appears on screen, so it stays in sync
# with the live sandbox create and the model.
#
# Record from a clean git tree: with uncommitted changes, `/warp` first asks whether to
# move them with the session, and the tape does not answer that dialog.

Output readme-assets/demo.mp4
Output readme-assets/demo.gif

Set Shell bash
Set FontSize 20
Set Width 1180
Set Height 760
Set Theme "Catppuccin Mocha"
Set TypingSpeed 65ms
Set PlaybackSpeed 1.0
Set Framerate 30
Set Padding 20

# Start straight in the TUI, inside the WIP project
Hide
Type "npm run tui" Enter
Wait+Screen@60s /Ask anything/
Sleep 2s
Show

# 1. Local: what is this project, and what is left to do?
Sleep 1.5s
Type "Read the README. What is this project and what is still open?" Enter
Wait+Screen@120s /▣.*·.*\d+(\.\d+)?s/
Sleep 6s

# 2. The next step means installing dependencies and running the suite.
#    Not on my laptop — /warp the session into an E2B sandbox.
Type@180ms "/warp" Sleep 1.2s Enter
Wait+Screen@20s /E2B.?Sandbox/
Sleep 2.5s
Down Sleep 1.2s Enter
Wait+Screen@420s /Warped to|Workspace e2b-/
Sleep 4s

# 3. Same session, now in the sandbox: install, run the tests, fix what is red.
Type "Run `hostname` so we know where we are. Then install dependencies with `npm ci`, run the test suite, and fix the failing test. Run the suite again to confirm." Enter
Wait+Screen@300s /e2b\.local/
Wait+Screen@300s /Tests\s+\d+ passed|\d+ passed \(\d+\)/
Sleep 6s
# Make the fix itself visible before we leave
Type "Show me `git diff -- src/` so I can see the fix." Enter
Wait+Screen@120s /\+.*VOLUME_THRESHOLD|>= VOLUME_THRESHOLD/
Sleep 7s

# 4. /warp → None: come back to the laptop and move the fix with the session
Type@180ms "/warp" Sleep 1.2s Enter
Wait+Screen@20s /None/
Sleep 2.5s
Down Sleep 900ms Down Sleep 900ms Enter
Wait+Screen@30s /File Changes Found/
Sleep 4s
# "yes" is the default: the diff is exactly what the agent changed in the sandbox
Enter
Wait+Screen@90s /Warped to/
Sleep 3s
Type "Run `hostname` and `git diff --stat`. Start your answer with: Back home on" Enter
Wait+Screen@120s /[Bb]ack home on/
Sleep 8s
