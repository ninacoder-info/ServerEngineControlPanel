import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.models.website import Website
from app.services.website_service import WebsiteService


class WebsiteBlockPageTests(unittest.TestCase):
    def test_nginx_block_page_location_disables_modsecurity_for_internal_redirect(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = object.__new__(WebsiteService)
            service.path = root / "state" / "websites.json"
            service.service_root = root / "services"
            service.log_root = root / "logs"
            service.certificate_root = root / "certificates"
            service.auth_root = root / "auth"
            state = root / "state"
            state.mkdir(parents=True)
            site = Website(
                id="e901d56c-12c6-43b9-9e73-c8c9c8fe0d1f",
                name="Example",
                domain="example.com",
                project_path=str(root / "www" / "example.com"),
                document_root=str(root / "www" / "example.com"),
                created_at="2026-10-16T00:00:00Z",
                updated_at="2026-10-16T00:00:00Z",
                config_path="",
            )
            custom_html = "<main><h1>Request blocked</h1></main>"
            (state / "application-shield.json").write_text(json.dumps({
                "enabled": True,
                "mode": "blocking",
                "block_page_enabled": True,
                "block_page_html": custom_html,
            }))

            with (
                patch("app.services.website_service.nginx_paths", return_value={"root": root / "nginx"}),
                patch.dict(os.environ, {"SE_STATE_DIR": str(state)}),
            ):
                generated = service.configuration(site, "nginx")["content"]

            self.assertIn("error_page 403 418 =403 @server_engine_application_shield_blocked;", generated)
            self.assertIn(
                "location @server_engine_application_shield_blocked {\n"
                "        modsecurity off;\n"
                "        default_type text/html;",
                generated,
            )
            self.assertIn("return 403 \"<main><h1>Request blocked</h1></main>\\n\";", generated)


if __name__ == "__main__":
    unittest.main()
