import io
import os
import unittest
from unittest.mock import patch

from app.api.routes import system


class PublicReleaseCheckTests(unittest.TestCase):
    def test_release_metadata_uses_public_github_request_without_auth(self):
        class FakeResponse(io.BytesIO):
            def geturl(self):
                return "https://github.com/ninacoder-info/ServerEngineControlPanel/releases/tag/v0.1.66"

        page = b'<meta property="og:description" content="v0.1.66 release notes">'
        response = FakeResponse(page)

        with (
            patch.dict(os.environ, {"SE_GITHUB_TOKEN": "stale-token"}),
            patch.object(system.urllib.request, "urlopen", return_value=response) as urlopen,
        ):
            result = system._github_release()

        request = urlopen.call_args.args[0]
        self.assertIsNone(request.get_header("Authorization"))
        self.assertEqual(result["tag_name"], "v0.1.66")
        self.assertEqual(result["body"], "v0.1.66 release notes")
        self.assertIn("github.com/", request.full_url)
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 10)

    def test_changelog_fetch_uses_public_github_request_without_auth(self):
        response = io.BytesIO(b"## v0.1.66\n\n- Release notes\n")

        with (
            patch.dict(os.environ, {"SE_GITHUB_TOKEN": "stale-token"}),
            patch.object(system.urllib.request, "urlopen", return_value=response) as urlopen,
        ):
            content = system._github_changelog("v0.1.66")

        self.assertIn("v0.1.66", content)
        request = urlopen.call_args.args[0]
        self.assertIsNone(request.get_header("Authorization"))
        self.assertEqual(
            request.full_url,
            "https://raw.githubusercontent.com/ninacoder-info/ServerEngineControlPanel/v0.1.66/CHANGELOG.md",
        )

    def test_failed_release_check_returns_support_diagnostic_and_logs_exception(self):
        system._update_cache = None
        failure = OSError("certificate verify failed")
        with (
            patch.object(system, "_github_release", side_effect=failure),
            self.assertLogs(system._LOGGER, level="ERROR") as captured,
        ):
            result = system.check_for_panel_update(refresh=True, user={})

        self.assertFalse(result["checked"])
        self.assertIn("OSError", result["diagnostic"])
        self.assertIn("certificate verify failed", result["diagnostic"])
        self.assertTrue(any("GitHub release check failed" in line for line in captured.output))


if __name__ == "__main__":
    unittest.main()
