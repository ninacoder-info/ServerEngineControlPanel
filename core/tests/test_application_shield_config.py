import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.models.application_shield import ApplicationShieldPolicy
from app.services.application_shield_service import ApplicationShieldService


class ApplicationShieldConfigTests(unittest.TestCase):
    def test_custom_block_page_does_not_emit_unsupported_tag_action_directive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = object.__new__(ApplicationShieldService)
            service.service_root = root / "services"
            policy = ApplicationShieldPolicy(
                enabled=True,
                mode="blocking",
                crs_enabled=True,
                block_page_enabled=True,
            )

            with (
                patch.object(ApplicationShieldService, "_ensure_crs_setup"),
                patch.object(ApplicationShieldService, "_write_custom_rules", return_value=None) as custom_rules,
                patch.object(ApplicationShieldService, "_write_geo_rules", return_value=None),
                patch(
                    "app.services.application_shield_service._AUDIT_LOG_PATH",
                    root / "logs" / "audit.log",
                ),
            ):
                service._write_engine_config(policy)

            generated = (service.service_root / "modsecurity/conf/modsecurity.conf").read_text()
            self.assertNotIn("SecRuleUpdateActionByTag", generated)
            custom_rules.assert_called_once_with(service.service_root / "modsecurity", 418)


if __name__ == "__main__":
    unittest.main()
