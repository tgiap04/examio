import unittest

from rebrand import rename_text


class RuleOrderTest(unittest.TestCase):
    def test_hosts(self):
        self.assertEqual(rename_text("https://api.examio.vn/api/v1/auth"), "https://kmaedu.fayedark.com/api/v1/auth")
        self.assertEqual(rename_text("host: 'api.examio.top'"), "host: 'kmaedu.fayedark.com'")
        self.assertEqual(rename_text("domain=.examio.top"), "domain=.kmaedu.fayedark.com")
        self.assertEqual(rename_text("admin@examio.vn"), "admin@kmaedu.fayedark.com")
        self.assertEqual(rename_text("https://r2.examio.com/x"), "https://r2.kmaedu.fayedark.com/x")
        self.assertEqual(rename_text("cdn.examio.test"), "cdn.kmaedu.test")

    def test_images_and_repo(self):
        self.assertEqual(rename_text("ghcr.io/cychipo/examio-auth:main"), "ghcr.io/tgiap04/kmaedu-auth:main")
        self.assertEqual(rename_text("github.com/tgiap04/examio.git"), "github.com/tgiap04/kmaedu.git")

    def test_cases(self):
        self.assertEqual(rename_text("ExamioApp"), "KMAEduApp")
        self.assertEqual(rename_text("ExamIO"), "KMAEdu")
        self.assertEqual(rename_text("HTTPS://CDN.EXAMIO.TEST"), "HTTPS://CDN.KMAEDU.TEST")
        self.assertEqual(rename_text("@examio/common"), "@kmaedu/common")
        self.assertEqual(rename_text("examio_dot_ai_dot_v1"), "kmaedu_dot_ai_dot_v1")
        self.assertEqual(rename_text("package examio.auth.v1;"), "package kmaedu.auth.v1;")

    def test_idempotent(self):
        once = rename_text("Examio examio.vn @examio/x")
        self.assertEqual(rename_text(once), once)


if __name__ == "__main__":
    unittest.main()
