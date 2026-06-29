import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from content_creator.cost.estimator import estimate_cost
from content_creator.enums import ProviderMode


class TestCostEstimator(unittest.TestCase):
    def test_pixie_account_has_markup(self):
        r = estimate_cost(provider_mode=ProviderMode.PIXIE_ACCOUNT)
        self.assertEqual(r["provider_mode"], "pixie_account")
        self.assertGreater(r["pixie_markup"], 0)
        self.assertGreater(r["final_user_price"], r["estimated_provider_cost"])

    def test_user_account_no_markup_no_charge(self):
        r = estimate_cost(provider_mode=ProviderMode.USER_ACCOUNT)
        self.assertEqual(r["provider_mode"], "user_account")
        self.assertEqual(r["pixie_markup"], 0.0)
        self.assertEqual(r["final_user_price"], 0.0)

    def test_accepts_string_provider_mode(self):
        enum_result = estimate_cost(provider_mode=ProviderMode.PIXIE_ACCOUNT)
        str_result = estimate_cost(provider_mode="pixie_account")
        self.assertEqual(enum_result, str_result)

        enum_user = estimate_cost(provider_mode=ProviderMode.USER_ACCOUNT)
        str_user = estimate_cost(provider_mode="user_account")
        self.assertEqual(enum_user, str_user)

    def test_deterministic(self):
        a = estimate_cost(provider_mode=ProviderMode.PIXIE_ACCOUNT, model="standard")
        b = estimate_cost(provider_mode=ProviderMode.PIXIE_ACCOUNT, model="standard")
        self.assertEqual(a, b)

    def test_credits_formula(self):
        # standard: 8 cps * 15s * (1 + 2*0.5) = 8*15*2 = 240 credits
        r = estimate_cost(
            provider_mode=ProviderMode.PIXIE_ACCOUNT,
            model="standard",
            duration_seconds=15,
            retry_budget=2,
        )
        self.assertEqual(r["estimated_credits"], 240)
        self.assertAlmostEqual(r["estimated_provider_cost"], 2.4, places=4)
        self.assertAlmostEqual(r["pixie_markup"], 0.72, places=4)
        self.assertAlmostEqual(r["final_user_price"], 3.12, places=4)


if __name__ == "__main__":
    unittest.main()
