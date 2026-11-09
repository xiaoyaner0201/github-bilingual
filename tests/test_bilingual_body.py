import os, subprocess, sys, tempfile, unittest
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "skills", "github-bilingual", "scripts"))
import bilingual_body as bb  # noqa: E402

GOOD = "## Summary\n\nEnglish.\n\nCloses #12\n\n<details>\n<summary>中文说明</summary>\n\n## 概述\n\n中文。\n\n</details>\n"


class Check(unittest.TestCase):
    def test_good(self):
        self.assertEqual(bb.check(GOOD), [])

    def test_no_marker(self):
        self.assertTrue(bb.check("text only")[0].startswith("no marker"))

    def test_legacy_label_flagged(self):
        self.assertIn("not a marker", bb.check(GOOD.replace("中文说明", "中文版"))[0])

    def test_marker_not_last(self):
        body = GOOD + "\n<details>\n<summary>Logs</summary>\n\nx\n\n</details>\n"
        self.assertTrue(any("last" in p for p in bb.check(body)))

    def test_missing_blank_line(self):
        body = GOOD.replace("</summary>\n\n", "</summary>\n")
        self.assertTrue(any("blank line after" in p for p in bb.check(body)))

    def test_closing_keyword_in_fold(self):
        body = GOOD.replace("中文。", "中文。\n\nCloses #12")
        self.assertTrue(any("closing keyword" in p for p in bb.check(body)))

    def test_marker_in_code_fence_ignored(self):
        body = "x\n\n```\n<details>\n<summary>中文说明</summary>\n\ny\n\n</details>\n```\n"
        self.assertTrue(bb.check(body)[0].startswith("no marker"))


class Normalize(unittest.TestCase):
    def test_real_pr_body(self):
        with open(os.path.join(HERE, "fixtures", "legacy-image-fold.md"), encoding="utf-8") as f:
            before = f.read()
        with open(os.path.join(HERE, "fixtures", "legacy-image-fold.normalized.md"), encoding="utf-8") as f:
            after = f.read()
        self.assertEqual(bb.normalize(before), after)
        self.assertEqual(bb.check(after), [])

    def test_relabel_only(self):
        self.assertEqual(bb.normalize(GOOD.replace("中文说明", "中文完整版")), GOOD)


class Swap(unittest.TestCase):
    def test_swap_round_trip(self):
        s = bb.swap(GOOD)
        self.assertEqual(bb.check(s), [])
        self.assertTrue(s.startswith("## 概述"))
        self.assertIn("<summary>English</summary>", s)
        main = s.split("<details>")[0]
        self.assertIn("Closes #12", main)
        fold = s.split("<details>")[1]
        self.assertNotIn("Closes #12", fold)


class Nesting(unittest.TestCase):
    NESTED = ("Main.\n\n<details>\n<summary>中文说明</summary>\n\n中文开头\n\n"
              "<details>\n<summary>Logs</summary>\n\nlog\n\n</details>\n\n中文结尾\n\n</details>\n")

    def test_nested_fold_kept_inside(self):
        self.assertEqual(bb.check(self.NESTED), [])
        s = bb.swap(self.NESTED)
        main = s.split("<summary>English</summary>")[0]
        self.assertIn("中文开头", main)
        self.assertIn("中文结尾", main)
        self.assertIn("<summary>Logs</summary>", main)
        self.assertTrue(main.index("log") < main.index("中文结尾"))
        self.assertEqual(bb.check(s), [])

    def test_closing_in_code_fence_not_moved(self):
        body = ("Example:\n\n```\nCloses #12\n```\n\nCloses #7\n\n<details>\n<summary>中文说明</summary>\n\n中文\n\n</details>\n")
        s = bb.swap(body)
        fold = s.split("<summary>English</summary>")[1]
        self.assertIn("```\nCloses #12\n```", fold)
        main = s.split("<details>")[0]
        self.assertIn("Closes #7", main)
        self.assertNotIn("Closes #12", main)

    def test_closing_example_in_fold_fence_allowed(self):
        body = GOOD.replace("中文。", "中文。\n\n```\nCloses #1\n```")
        self.assertEqual(bb.check(body), [])

    def test_crlf(self):
        self.assertEqual(bb.check(GOOD.replace("\n", "\r\n").replace("\r\n", "\n")), [])


class Cli(unittest.TestCase):
    def test_exit_codes(self):
        script = os.path.join(HERE, "..", "skills", "github-bilingual", "scripts", "bilingual_body.py")
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write(GOOD)
        self.assertEqual(subprocess.run([sys.executable, script, "check", f.name]).returncode, 0)
        with open(f.name, "w", encoding="utf-8") as g:
            g.write("plain")
        self.assertEqual(subprocess.run([sys.executable, script, "check", f.name], capture_output=True).returncode, 1)


if __name__ == "__main__":
    unittest.main()
