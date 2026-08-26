#!/opt/ofscraper/bin/python
"""Perform a read-only OnlyFans authentication check through OF-Scraper."""

from importlib.metadata import version
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: easyx-ofscraper-auth-test <config-json>", file=sys.stderr)
        return 2

    config_file = sys.argv[1]
    sys.argv = [
        "ofscraper",
        "--config",
        config_file,
        "--profile",
        "main_profile",
        "--output",
        "low",
        "--no-live",
        "--auth-quit",
    ]

    try:
        from ofscraper.main.open import load

        load.systemSet()
        load.settings_loader()
        load.setdate()
        load.readConfig()
        load.setLogger()

        import ofscraper.managers.manager as manager

        manager.Manager = manager.mainManager()
        from ofscraper.data.api.init import getstatus

        if getstatus() != "UP":
            print("OnlyFans could not verify the imported session. Import a fresh auth.json and try again.", file=sys.stderr)
            return 1
        print(f"OnlyFans authentication succeeded with OF-Scraper {version('ofscraper')}.")
        return 0
    except Exception:
        print("OnlyFans authentication could not be verified. Import a fresh auth.json and try again.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
