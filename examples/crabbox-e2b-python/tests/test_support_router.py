import json
import unittest
from pathlib import Path

from support_router import route_ticket

EXAMPLE_DIRECTORY = Path(__file__).resolve().parents[1]


class SupportRouterTests(unittest.TestCase):
    def test_routes_a_normal_ticket_to_the_standard_queue(self) -> None:
        ticket = {
            "severity": "medium",
            "account_tier": "pro",
            "affected_users": 3,
        }

        self.assertEqual(route_ticket(ticket), "standard")

    def test_routes_a_critical_ticket_to_the_priority_queue(self) -> None:
        ticket = {
            "severity": "critical",
            "account_tier": "free",
            "affected_users": 1,
        }

        self.assertEqual(route_ticket(ticket), "priority")

    def test_regression_fixtures(self) -> None:
        fixtures = sorted(
            (EXAMPLE_DIRECTORY / "fixtures").glob("regression-*.json")
        )
        self.assertTrue(fixtures, "expected at least one regression fixture")

        for fixture in fixtures:
            payload = json.loads(fixture.read_text(encoding="utf-8"))
            with self.subTest(fixture=fixture.name, case=payload["name"]):
                self.assertEqual(
                    route_ticket(payload["ticket"]),
                    payload["expected_queue"],
                )
