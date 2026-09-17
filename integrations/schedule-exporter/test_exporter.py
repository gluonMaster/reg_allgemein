"""Synthetic regression: no Office reader, PDF renderer, GUI or network is invoked."""
import contextlib
import importlib
import io
import json
import os
from pathlib import Path
import re
import runpy
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'visualiser'))
import enhanced_export_manager_html as html_export


def ordinary_entrypoint():
    # Isolate non-HTML dependencies, retaining the real main -> manager -> mixin path.
    names = {
        'pandas': {}, 'reportlab': {}, 'reportlab.lib': {},
        'reportlab.lib.pagesizes': {'A3': (1, 1), 'landscape': lambda v: v},
        'reportlab.lib.colors': {'Color': object}, 'reportlab.pdfgen': {'canvas': None},
        'reportlab.pdfbase': {'pdfmetrics': None}, 'reportlab.pdfbase.ttfonts': {'TTFont': None},
        'data_processor': {'load_data': None, 'process_schedule_data': None, 'filter_by_lesson_type': None},
        'enhanced_layout_manager': {'EnhancedScheduleLayout': lambda *_: None},
        'teacher_exporter': {'export_teacher_schedules': None},
        'group_exporter': {'export_group_schedules': None},
        'enhanced_export_manager_extra': {'convert_from_path': None, 'ExtraExportMixin': type('ExtraExportMixin', (), {})},
    }
    modules = {}
    for name, attributes in names.items():
        module = types.ModuleType(name)
        module.__dict__.update(attributes)
        modules[name] = module
    with patch.dict(sys.modules, modules):
        return importlib.import_module('schedule_visualizer_enhanced')


def fixture():
    return json.loads((ROOT.parents[1] / 'tests/fixtures/trial-intake/catalog-v1.json').read_text('utf-8'))


def source(lesson):
    return {**lesson, 'start_time': lesson['start'], 'end_time': lesson['end'],
            'start_time_mins': int(lesson['start'][:2]) * 60 + int(lesson['start'][3:]), 'lesson_type': 'group'}


def read_catalog(html):
    return json.loads(re.search(r'<script type="application/json" id="trial-intake-catalog">(.*?)</script>', html, re.S)[1])


def export_synthetic(main, output, schedule):
    with patch.object(main, 'load_data', return_value=object()), \
         patch.object(main, 'filter_by_lesson_type', side_effect=lambda data, _: data), \
         patch.object(main, 'process_schedule_data', return_value=(list(schedule), schedule)), \
         patch.object(main, 'create_pdf'), contextlib.redirect_stdout(io.StringIO()):
        main.main('SYNTHETIC-NO-OFFICE', str(output.with_suffix('.pdf')), export_html=True)
    return output.read_text('utf-8')


class ExportTests(unittest.TestCase):
    def test_editor_launcher_reports_failure_to_prevent_copying_an_old_html(self):
        from unittest.mock import Mock
        main = Mock()
        modules = {
            'schedule_visualizer_enhanced': types.SimpleNamespace(main=main),
            'reportlab.pdfbase.ttfonts': types.SimpleNamespace(TTFont=lambda *_: None),
            'reportlab.pdfbase': types.SimpleNamespace(pdfmetrics=types.SimpleNamespace(registerFont=lambda *_: None)),
        }
        with patch.dict(sys.modules, modules), patch.object(sys, 'argv', ['example_usage_enhanced.py', '--lesson-type', 'group']), \
             patch('os.path.exists', return_value=True), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            runpy.run_path(str(ROOT / 'visualiser/example_usage_enhanced.py'), run_name='__main__')
            self.assertTrue(main.call_args.kwargs['export_html'])
            self.assertEqual(main.call_args.kwargs['lesson_type_filter'], 'group')
            main.side_effect = RuntimeError('synthetic incomplete context')
            with self.assertRaises(SystemExit) as raised:
                runpy.run_path(str(ROOT / 'visualiser/example_usage_enhanced.py'), run_name='__main__')
            self.assertEqual(raised.exception.code, 1)

    def test_normal_export_repeat_and_persisted_settings(self):
        main = ordinary_entrypoint()
        expected = fixture()
        schedule = {'Do': [source(expected['lessons'][0])], 'Sa': [source(expected['lessons'][1])]}
        with tempfile.TemporaryDirectory(prefix='intake-export-') as folder:
            root = Path(folder)
            config = root / 'config.json'
            config.write_text(json.dumps({'unrelated_setting': 'preserved', 'trial_intake': {'portal_origin': 'https://portal.example.test', 'cta_enabled': False}}), 'utf-8')
            with patch.object(html_export, '__file__', str(root / 'visualiser' / 'enhanced_export_manager_html.py')):
                output = root / 'schedule.html'
                first = export_synthetic(main, output, schedule)
                self.assertEqual(read_catalog(first), expected)
                self.assertNotIn('class="trial-intake-link" href=', first)
                cfg = json.loads(config.read_text('utf-8'))
                cfg['trial_intake']['cta_enabled'] = True
                config.write_text(json.dumps(cfg), 'utf-8')
                enabled = export_synthetic(main, output, schedule)
                self.assertIn('https://portal.example.test/probestunde?lesson=' + expected['lessons'][0]['id'], enabled)
                schedule['Do'][0]['room'] = 'R3'
                repeated = export_synthetic(main, output, schedule)
                updated = read_catalog(repeated)['lessons'][0]
                self.assertEqual(updated['room'], 'R3')
                self.assertNotEqual(updated['id'], expected['lessons'][0]['id'])
                self.assertIn('https://portal.example.test/probestunde?lesson=' + updated['id'], repeated)
                self.assertNotIn(expected['lessons'][0]['id'], repeated)
                self.assertEqual(json.loads(config.read_text('utf-8')), cfg)
                self.assertIn(html_export.html_lib.escape(html_export.ORGANIZATION_NAME), repeated)
                self.assertIn('data-building="Kolibri"', repeated)
                # The full name belongs to the header alone; the card keeps the short building marker.
                self.assertEqual(repeated.count(html_export.html_lib.escape(html_export.ORGANIZATION_NAME)), 1)
                self.assertIn('<div class="lesson-location">R3, Kolibri</div>', repeated)
                self.assertIn('<div class="lesson-location">R2, Villa</div>', repeated)
                # Optional synthetic artifact for the TypeScript portal-reader round trip.
                if os.environ.get('TRIAL_EXPORT_TEST_OUTPUT'):
                    Path(os.environ['TRIAL_EXPORT_TEST_OUTPUT']).write_text(repeated, 'utf-8')

    def test_subcolumns_escaping_visibility_and_context(self):
        main = ordinary_entrypoint()
        lesson = source(fixture()['lessons'][1])
        unsafe = {**lesson, 'subject': 'Cafe\u0301 </script><img src=x onerror="bad()">', 'group': '<b>&"Group', 'teacher': '<svg onload="bad()">', 'room': 'A&B'}
        rows = [lesson, unsafe, {**lesson, 'lesson_type': 'individual', 'group': 'Private'}, {**lesson, 'hidden': True, 'group': 'Hidden'}]
        manager = main.EnhancedExportManager(['Sa'], {'Sa': rows})
        manager.blocks_per_page = manager.max_pages_per_column = 1
        with tempfile.TemporaryDirectory(prefix='intake-export-') as folder:
            root = Path(folder)
            output = root / 'schedule.html'
            (root / 'config.json').write_text(json.dumps({'trial_intake': {'portal_origin': 'https://portal.example.test', 'cta_enabled': True}}), 'utf-8')
            with patch.object(html_export, '__file__', str(root / 'visualiser' / 'enhanced_export_manager_html.py')), contextlib.redirect_stdout(io.StringIO()):
                self.assertTrue(manager.export_to_html(str(output)))
                html = output.read_text('utf-8')
                catalog = read_catalog(html)['lessons']
                self.assertEqual(len(catalog), 2)
                self.assertTrue(all(l['weekday'] == 6 for l in catalog))
                self.assertIn('Samstag (1/4)', html)
                self.assertIn('Samstag (2/4)', html)
                self.assertNotIn('<img src=x', html)
                self.assertNotIn('<svg onload=', html)
                self.assertIn('\\u003c/script>', html)
                self.assertIn('Café', html)
                self.assertNotIn('Hidden', html)
                self.assertEqual(html.count('class="trial-intake-link" href='), 2)
                self.assertIn('searchBox.addEventListener', html)
                self.assertIn('themeToggle', html)
                manager.schedule_by_day['Sa'] = [lesson, lesson]
                self.assertTrue(manager.export_to_html(str(output)))
                self.assertEqual(len(read_catalog(output.read_text('utf-8'))['lessons']), 1)
                before = output.read_bytes()
                manager.schedule_by_day['Sa'] = [{**lesson, 'subject': ''}]
                self.assertFalse(manager.export_to_html(str(output)))
                self.assertEqual(output.read_bytes(), before)
                with self.assertRaises(RuntimeError):
                    export_synthetic(main, output, {'Sa': [{**lesson, 'subject': ''}]})
                for day in (None, 'Samstag (2/2)'):
                    with self.assertRaises(ValueError): html_export.catalog_lesson(lesson, day)

    def test_cta_is_tinted_to_its_card_and_stays_readable(self):
        for bg, border in [(fill, outline) for fill in ('#ccffcc', '#ccf2ff', '#ffffcc', '#ffffff')
                           for outline in ('#2db223', '#8a23b2')]:
            chip, line, label = html_export.cta_palette(bg, border)
            source = bg if bg != '#ffffff' else border
            for tone in (chip, line, label):
                self.assertRegex(tone, r'^#[0-9a-f]{6}$')
                self.assertAlmostEqual(html_export.colorsys.rgb_to_hsv(*html_export._hex_to_rgb(tone))[0],
                                       html_export.colorsys.rgb_to_hsv(*html_export._hex_to_rgb(source))[0], places=2)
            contrast = lambda first, second: html_export._contrast_ratio(
                html_export._hex_to_rgb(first), html_export._hex_to_rgb(second))
            # The label reads on the chip, and the chip edge stays visible on the card.
            self.assertGreaterEqual(contrast(chip, label), 4.5)
            self.assertGreaterEqual(contrast(bg, line), 3.0)

    def test_link_carries_the_card_palette_and_both_label_lines(self):
        main = ordinary_entrypoint()
        lesson = source(fixture()['lessons'][1])
        with tempfile.TemporaryDirectory(prefix='intake-export-') as folder:
            root = Path(folder)
            (root / 'config.json').write_text(json.dumps({'trial_intake': {'portal_origin': 'https://portal.example.test', 'cta_enabled': True}}), 'utf-8')
            with patch.object(html_export, '__file__', str(root / 'visualiser' / 'enhanced_export_manager_html.py')):
                output = root / 'schedule.html'
                html = export_synthetic(main, output, {'Sa': [lesson, {**lesson, 'group': 'Kunst Sa 1'}]})
        self.assertIn('<span class="cta-de">Probestunde anfragen /</span><span class="cta-ru">Запросить пробное</span></a>', html)
        self.assertEqual(html.count('class="trial-intake-link" href='), 2)
        chips = re.findall(r'background-color: (#[0-9a-f]{6});[^"]*--cta-bg: (#[0-9a-f]{6}); --cta-line: (#[0-9a-f]{6}); --cta-fg: (#[0-9a-f]{6});', html)
        self.assertEqual(len(chips), 2)
        for card, chip, line, label in chips:
            self.assertEqual((chip, line, label), html_export.cta_palette(card, '#8a23b2'))
        self.assertNotEqual(chips[0][1], chips[1][1])
        self.assertIn('var(--cta-bg', html)
        self.assertNotIn('background: #176b54', html)

    def test_invalid_configuration_never_creates_a_link(self):
        with tempfile.TemporaryDirectory(prefix='intake-export-') as folder:
            root = Path(folder)
            with patch.object(html_export, '__file__', str(root / 'visualiser' / 'enhanced_export_manager_html.py')):
                for origin in ('', 'http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'javascript:alert(1)'):
                    (root / 'config.json').write_text(json.dumps({'trial_intake': {'cta_enabled': True, 'portal_origin': origin}}), 'utf-8')
                    with self.assertRaises(ValueError): html_export.trial_intake_settings()


if __name__ == '__main__':
    unittest.main()
