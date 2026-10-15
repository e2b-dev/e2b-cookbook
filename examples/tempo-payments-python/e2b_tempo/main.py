import os
from pathlib import Path
from dotenv import load_dotenv
from e2b import Sandbox, Template

load_dotenv()

KEYS_TOML = Path.home() / ".tempo" / "wallet" / "keys.toml"


def build_template():
    """Build a custom sandbox template with Tempo pre-installed."""
    template = (
        Template()
        .from_python_image("3.12")
        .apt_install(["curl", "ca-certificates"])
        .run_cmd("curl -fsSL https://tempo.xyz/install | bash")
        .run_cmd("/home/user/.tempo/bin/tempo add request")
        .pip_install(["pympp"])
    )

    info = Template.build(
        template,
        "e2b-tempo",
        on_build_logs=lambda log: print(log.message, end=""),
    )

    print(f"\nTemplate built: {info.template_id}")
    return info.template_id


def main():
    template_id = os.environ.get("E2B_TEMPO_TEMPLATE_ID")
    if not template_id:
        print("No E2B_TEMPO_TEMPLATE_ID found, building template...")
        template_id = build_template()

    tempo_private_key = os.environ.get("TEMPO_PRIVATE_KEY")

    sandbox = Sandbox.create(template=template_id)
    print(f"Sandbox started: {sandbox.sandbox_id}")

    try:
        if tempo_private_key:
            # Use private key directly via --private-key flag
            key_flag = f"--private-key {tempo_private_key}"
        elif KEYS_TOML.exists():
            # Fallback: copy local keys.toml into the sandbox
            keys_content = KEYS_TOML.read_text()
            sandbox.files.write("/home/user/.tempo/wallet/keys.toml", keys_content)
            key_flag = ""
        else:
            raise RuntimeError(
                "Set TEMPO_PRIVATE_KEY in .env or run 'tempo wallet login' first"
            )

        # Make a paid API call from inside the sandbox
        result = sandbox.commands.run(
            'export PATH="$HOME/.tempo/bin:$PATH" && '
            f"tempo request {key_flag} "
            '-X POST --json \'{"query":"latest AI news"}\' '
            "https://parallelmpp.dev/api/search"
        )
        print("Search results:", result.stdout)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        sandbox.kill()
        print("Sandbox destroyed.")


if __name__ == "__main__":
    main()
