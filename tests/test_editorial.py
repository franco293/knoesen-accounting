"""Guard consequential financial and company-administration content qualifiers.

The deadline fixture is independently transcribed from the current CIPC notice
checked on 13 October 2026: https://www.cipc.co.za/?p=21067. Change this fixture
only after reviewing replacement official guidance, not to make a build pass.
"""
import json
from pathlib import Path
import re
import unittest
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]


def plain(markup):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', markup)).strip()


class FAQText(HTMLParser):
    """Read the visible question/answer so metadata cannot hide a qualifier."""
    def __init__(self):
        super().__init__()
        self.active = self.summary = False
        self.question = self.answer = ''
        self.items = {}

    def handle_starttag(self, tag, attrs):
        if tag == 'details':
            self.active = True
            self.question = self.answer = ''
        elif self.active and tag == 'summary':
            self.summary = True

    def handle_endtag(self, tag):
        if tag == 'summary':
            self.summary = False
        elif tag == 'details' and self.active:
            self.items[plain(self.question)] = plain(self.answer)
            self.active = False

    def handle_data(self, text):
        if self.active:
            if self.summary:
                self.question += text
            else:
                self.answer += text


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

    def test_provisional_exclusion_qualifiers_match_visible_and_schema(self):
        # SARS provisional-tax definition: the R30,000 alternative applies to
        # a natural person with no income from carrying on any business.
        # https://www.sars.gov.za/types-of-tax/provisional-tax/
        parser = FAQText()
        parser.feed((ROOT / 'content/service-tax.html').read_text(encoding='utf-8'))
        question = 'Am I a provisional taxpayer?'
        pages = json.loads((ROOT / 'content/pages.json').read_text(encoding='utf-8'))
        page = next(p for p in pages if p['slug'] == 'services/tax')
        schema = next(item['a'] for item in page['faq'] if item['q'] == question)
        self.assertEqual(parser.items[question], schema)
        for qualifier in ('natural person', 'no income from carrying on a business',
                          'total taxable income', 'age-related tax threshold',
                          'taxable income from interest, foreign dividends', 'not more than R30 000'):
            self.assertIn(qualifier, schema)

    def test_cipc_completion_window_keeps_trigger_and_consequence(self):
        # Practice Note 3 of 2025: the 30 business days begin after processing
        # AND payment, not from the incorporation anniversary or first enquiry.
        source = (ROOT / 'content/guide-cipc-reinstatement.html').read_text(encoding='utf-8')
        pages = json.loads((ROOT / 'content/pages.json').read_text(encoding='utf-8'))
        page = next(p for p in pages if p['slug'] == 'resources/cipc-reinstatement')
        answer = next(item['a'] for item in page['faq'] if item['q'] == 'Is the company back in business once the CoR40.5 is processed?')
        for text in (plain(source), answer):
            self.assertIn('within 30 business days after the reinstatement application has been processed and paid', text)
            self.assertIn('previous deregistered status', text)
            self.assertIn('must start again', text)
        self.assertIn('Practice-note-3-of-2025_Government-Gazette-publication-pages-1.pdf', source)
        self.assertNotIn('following Practice Note 1 of 2022', json.dumps(page['faq']))

    def test_vat_cancellation_warning_and_eligible_inputs_survive(self):
        # SARS VAT201/Budget guidance: cancellation is formal, and not all
        # purchases carry standard-rated, deductible input VAT (fuel is one
        # counterexample to the previous universal 15% claim).
        source = (ROOT / 'content/guide-vat.html').read_text(encoding='utf-8')
        text = plain(source)
        self.assertNotIn('Every future purchase becomes 15% more expensive', text)
        self.assertIn('Lost eligible input VAT', text)
        self.assertIn('petrol and diesel as zero-rated', text)
        pages = json.loads((ROOT / 'content/pages.json').read_text(encoding='utf-8'))
        page = next(p for p in pages if p['slug'] == 'resources/vat-registration-threshold')
        answer = next(item['a'] for item in page['faq'] if item['q'] == 'Should I deregister for VAT now that the threshold has increased?')
        for version in (text.lower(), answer.lower()):
            self.assertIn('continue charging vat', version)
            self.assertIn('submitting vat201 returns', version)
            self.assertIn("until sars's formal cancellation takes effect", version)

    def test_fringe_benefits_keep_business_phone_qualification(self):
        # SARS Seventh Schedule guidance includes a no-value rule for mainly
        # business telephone equipment. Do not restore 'all taxable benefits'.
        for filename in ('service-payroll.html', 'guide-payroll.html'):
            text = plain((ROOT / 'content' / filename).read_text(encoding='utf-8'))
            self.assertNotIn('are all taxable benefits', text, filename)
            self.assertIn('telephone equipment used mainly', text, filename)
            self.assertRegex(text, r'no(?: taxable)?[ -]value')


if __name__ == '__main__':
    unittest.main()
