import unittest
from unittest.mock import patch

from app.api.routes import system


class ProcessorDetailsTests(unittest.TestCase):
    def test_reads_model_socket_physical_and_logical_counts(self):
        cpuinfo = "\n\n".join(
            f"processor : {logical}\n"
            "vendor_id : GenuineIntel\n"
            "model name : Intel(R) Xeon(R) E-2236 CPU @ 3.40GHz\n"
            "physical id : 0\n"
            f"core id : {logical // 2}"
            for logical in range(12)
        )

        with patch.object(system.Path, "read_text", return_value=cpuinfo):
            result = system._processor_details()

        self.assertEqual(result["model"], "Intel(R) Xeon(R) E-2236 CPU @ 3.40GHz")
        self.assertEqual(result["sockets"], 1)
        self.assertEqual(result["physical_cores"], 6)
        self.assertEqual(result["logical_cores"], 12)

    def test_does_not_invent_missing_model_or_physical_core_data(self):
        with patch.object(system.Path, "read_text", return_value="processor : 0\n"):
            result = system._processor_details()

        self.assertIsNone(result["model"])
        self.assertIsNone(result["sockets"])
        self.assertIsNone(result["physical_cores"])
        self.assertEqual(result["logical_cores"], 1)


if __name__ == "__main__":
    unittest.main()
