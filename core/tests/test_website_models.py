import unittest

from pydantic import ValidationError

from app.models.website import WebsiteDirectoryRequest


class WebsiteDirectoryRequestTests(unittest.TestCase):
    def test_allows_spaces_between_name_characters(self):
        for name in ("Untitled Folder", "My Website 2"):
            with self.subTest(name=name):
                request = WebsiteDirectoryRequest(path="/server-engine/www", name=name)
                self.assertEqual(request.name, name)

    def test_rejects_path_separators_and_unsafe_dot_names(self):
        for name in ("/", "\\", ".", ".."):
            with self.subTest(name=name):
                with self.assertRaises(ValidationError):
                    WebsiteDirectoryRequest(path="/server-engine/www", name=name)


if __name__ == "__main__":
    unittest.main()
