"""Optional font maintenance; not part of the build or deployment runtime.

Install fonttools[woff]==4.60.1 (tested with brotli 1.2.0, zopfli 0.4.3).
Run from any directory. Retain original fonts as inputs. Output filenames are
distinct because existing font URLs are cached immutable for one year.
Only trim unused weight ranges; preserve all glyphs and Latin-ext coverage.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'fonts'

def main():
    for source in sorted(ROOT.glob('*.woff2')):
        if 'mono' in source.name or '-site.' in source.name:
            continue
        limits = ((300, 500) if 'italic' in source.name else
                  (300, 700) if 'fraunces' in source.name else (400, 700))
        original = TTFont(source)
        result = instantiateVariableFont(original, {'wght': limits}, inplace=False)
        target = source.with_name(source.stem + '-site.woff2')
        result.save(target)
        assert TTFont(target).getBestCmap() == original.getBestCmap()
        print(f'{target.name}: {source.stat().st_size} -> {target.stat().st_size} bytes')

if __name__ == '__main__':
    main()
