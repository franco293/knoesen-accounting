"""Independent factual fixtures and release boundaries; no production requests."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ReleaseTests(unittest.TestCase):
    def test_historical_tax_schedule(self):
        # Independently transcribed from SARS individual rates on 21 Sep 2026.
        # https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
        data = json.loads((ROOT / 'data/tax-rates.json').read_text(encoding='utf-8'))
        schedule = data['years']['2025/26']['individual']
        expected = [(0, 237100, 0, .18), (237100, 370500, 42678, .26),
                    (370500, 512800, 77362, .31), (512800, 673000, 121475, .36),
                    (673000, 857900, 179147, .39), (857900, 1817000, 251258, .41),
                    (1817000, None, 644489, .45)]
        self.assertEqual([(b['from'], b['to'], b['base'], b['rate']) for b in schedule['brackets']], expected)
        self.assertEqual(schedule['rebates']['primary'], 17235)

    def test_interest_effective_dates(self):
        data = json.loads((ROOT / 'data/interest-rates.json').read_text(encoding='utf-8'))
        # SARS Tables 1, 2 and 3, checked 21 Sep 2026. Update with source review.
        for key, rate, date in [('tax', '10.50', '1 September 2026'), ('refund', '6.50', '1 September 2026'), ('loan', '8.00', '1 June 2026')]:
            self.assertEqual((data[key]['rate'], data[key]['effective']), (rate, date))

    def test_release_does_not_publish_sources(self):
        import publish
        files = {p.as_posix() for p in publish.selected_files()}
        self.assertIn('contact.html', files)
        self.assertIn('css/no-js.css', files)
        self.assertFalse(any(p.startswith(('.claude/', 'data/', 'content/', 'tests/', 'tools/')) for p in files))
        self.assertNotIn('tools.html', files)
        self.assertNotIn('js/sa-tax-core.js', files)

    def test_inactive_form_is_not_rendered(self):
        config = json.loads((ROOT / 'site.json').read_text(encoding='utf-8'))
        if not config['forms']['web3forms_key']:
            html = (ROOT / 'contact.html').read_text(encoding='utf-8')
            self.assertNotIn('id="contact-form"', html)
            self.assertNotIn('UNCONFIGURED', html)
            self.assertIn('mailto:', html)


if __name__ == '__main__':
    unittest.main()
