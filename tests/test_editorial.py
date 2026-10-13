"""Prevent the observed CIPC deadline drift across published content sources.

The deadline fixture is independently transcribed from the current CIPC notice
checked on 13 October 2026: https://www.cipc.co.za/?p=21067. Change this fixture
only after reviewing replacement official guidance, not to make a build pass.
"""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class EditorialTests(unittest.TestCase):
    def test_cipc_deadline_matches_checked_notice(self):
        fact = json.loads((ROOT / 'data/editorial-facts.json').read_text(encoding='utf-8'))['cipc_annual_return']
        self.assertEqual(fact['deadline'], 'within 30 business days after the anniversary of incorporation')
        self.assertEqual(fact['source'], 'https://www.cipc.co.za/?p=21067')
        self.assertRegex(fact['source_checked_on'], r'^\d{4}-\d{2}-\d{2}$')

    def test_cipc_content_and_faq_share_the_same_deadline(self):
        token = '{{cipc_annual_return_deadline}}'
        templates = ['service-company-secretarial.html', 'guide-startup.html', 'guide-deadlines.html']
        for filename in templates:
            markup = (ROOT / 'content' / filename).read_text(encoding='utf-8')
            self.assertIn(token, markup, filename)
        service = (ROOT / 'content/service-company-secretarial.html').read_text(encoding='utf-8')
        self.assertGreaterEqual(service.count(token), 2, 'Both the body and visible FAQ must use the shared deadline')
        pages = json.loads((ROOT / 'content/pages.json').read_text(encoding='utf-8'))
        service_page = next(page for page in pages if page['slug'] == 'services/company-secretarial')
        deadline_faq = next(item for item in service_page['faq'] if item['q'] == 'When is my CIPC annual return due?')['a']
        self.assertIn(token, deadline_faq, 'Structured FAQ must use the same fact as visible content')
        combined = re.sub(r'\s+', ' ', service + ' ' + deadline_faq).lower()
        self.assertNotIn('anniversary month of incorporation and the two months', combined)
        self.assertNotIn('two months following', combined)

    def test_active_payroll_guidance_preserves_sdl_boundary_and_period(self):
        # SARS SDL guidance explicitly exempts an anticipated leviable amount
        # that WON'T EXCEED R500,000 over the NEXT twelve months, including
        # exactly R500,000. Protect that distinction across active copy/FAQ.
        # https://www.sars.gov.za/types-of-tax/skills-development-levy/
        templates = ['guide-startup.html', 'guide-payroll.html', 'service-payroll.html']
        texts = [(name, (ROOT / 'content' / name).read_text(encoding='utf-8')) for name in templates]
        pages = json.loads((ROOT / 'content/pages.json').read_text(encoding='utf-8'))
        payroll = next(page for page in pages if page['slug'] == 'services/payroll')
        answer = next(item for item in payroll['faq'] if item['q'] == 'Does my business have to pay the Skills Development Levy?')['a']
        texts.append(('structured payroll FAQ', answer))
        for label, markup in texts:
            text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', markup)).lower()
            self.assertIn('does not exceed r500 000', text, label)
            self.assertIn('next 12 months', text, label)
            self.assertNotIn('less than r500 000', text, label)
            self.assertNotIn('under r500 000', text, label)


if __name__ == '__main__':
    unittest.main()
