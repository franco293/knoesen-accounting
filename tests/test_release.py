"""Independent factual fixtures and release boundaries; no production requests."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile

ROOT = Path(__file__).resolve().parents[1]


class ReleaseTests(unittest.TestCase):
    def test_unreadable_previous_release_is_never_deleted(self):
        import publish
        with tempfile.TemporaryDirectory(prefix='release-test-', dir=ROOT) as folder:
            root = Path(folder)
            output = root / 'dist'
            output.mkdir()
            marker = output / 'index.html'
            marker.write_text('previous release', encoding='utf-8')
            (root / 'release-manifest.json').write_text(json.dumps({'files': {'index.html': 'previous'}}), encoding='utf-8')

            def denied_walk(directory, onerror):
                onerror(PermissionError('Unreadable previous release'))

            with patch.object(publish, 'ROOT', root), patch.object(publish.subprocess, 'run'), patch.object(publish, 'selected_files', return_value=[]), patch.object(publish.os, 'walk', side_effect=denied_walk), patch.object(publish.shutil, 'rmtree') as remove:
                with self.assertRaisesRegex(ValueError, 'Cannot inspect'):
                    publish.main()
                remove.assert_not_called()
            self.assertEqual(marker.read_text(encoding='utf-8'), 'previous release')

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
        # SARS Tables 1, 2 and 3, independently checked 15 Oct 2026.
        # Table 3 is dated October 2026: 8.25% applies from 1 October.
        for key, rate, date in [('tax', '10.50', '1 September 2026'), ('refund', '6.50', '1 September 2026'), ('loan', '8.25', '1 October 2026')]:
            self.assertEqual((data[key]['rate'], data[key]['effective']), (rate, date))
        self.assertEqual((data['loan']['previous_rate'], data['loan']['previous_period']),
                         ('8.00', '1 June–30 September 2026'))
        self.assertEqual((data['loan']['earlier_rate'], data['loan']['earlier_period']),
                         ('7.75', '1 December 2025–31 May 2026'))

    def test_release_does_not_publish_sources(self):
        import publish
        files = {p.as_posix() for p in publish.selected_files()}
        self.assertIn('contact.html', files)
        self.assertIn('css/no-js.css', files)
        self.assertFalse(any(p.startswith(('.claude/', 'data/', 'content/', 'tests/', 'tools/')) for p in files))
        self.assertNotIn('tools.html', files)
        self.assertNotIn('js/sa-tax-core.js', files)
        self.assertIn('assets/fonts/ibm-plex-sans-w400-latin-site.woff2', files)
        self.assertNotIn('assets/fonts/ibm-plex-sans-latin-site.woff2', files)
        for notice in ('OFL-Fraunces.txt', 'OFL-IBM-Plex-Sans.txt', 'OFL-IBM-Plex-Mono.txt'):
            self.assertIn('assets/fonts/' + notice, files)

    def test_inactive_form_is_not_rendered(self):
        config = json.loads((ROOT / 'site.json').read_text(encoding='utf-8'))
        if not config['forms']['web3forms_key']:
            html = (ROOT / 'contact.html').read_text(encoding='utf-8')
            self.assertNotIn('id="contact-form"', html)
            self.assertNotIn('UNCONFIGURED', html)
            self.assertIn('mailto:', html)


if __name__ == '__main__':
    unittest.main()
