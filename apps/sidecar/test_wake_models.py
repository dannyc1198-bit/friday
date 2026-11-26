import unittest
from wake_models import BLOCKED, assert_only_hey_jarvis, models_to_load


class WakeModelTests(unittest.TestCase):
    def test_only_hey_jarvis_is_requested(self):
        self.assertEqual(models_to_load(), ["hey_jarvis"])
        for name in BLOCKED:
            self.assertNotIn(name, models_to_load())

    def test_other_builtin_models_are_refused(self):
        with self.assertRaises(RuntimeError):
            assert_only_hey_jarvis(["hey_jarvis", "alexa"])

    def test_hey_jarvis_alone_is_accepted(self):
        assert_only_hey_jarvis(["hey_jarvis_v0.1"])


if __name__ == "__main__":
    unittest.main()
