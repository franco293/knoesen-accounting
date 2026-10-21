"""Optional font maintenance; not part of the build or deployment runtime.

Install fonttools[woff]==4.60.2 (with brotli 1.2.0, zopfli 0.4.3).
This replaces the old 4.60.1 maintenance pin with the patched release for
GHSA-768j-98cg-p3fv: https://github.com/fonttools/fonttools/security/advisories/GHSA-768j-98cg-p3fv
That advisory affects the varLib CLI with untrusted designspace inputs; this
tool uses bundled WOFF2 files and instantiateVariableFont instead. Neither
FontTools nor this maintenance tool is used by the website build or runtime.
Run from any directory. Retain original fonts as inputs. Output filenames are
distinct because existing font URLs are cached immutable for one year.
Freeze each used weight to reduce measured blocking layout work, preserving
all glyphs and Latin-ext coverage. Current inputs have only the weight axis;
any additional axes in future inputs are left untouched. IBM's reserved font
name is removed from derivatives; original author/copyright/license metadata
is preserved. Distribute the bundled original OFL notices with the results.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'fonts'


def name_sans_derivative(font, weight):
    subfamily = {400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold'}[weight]
    values = {
        1: 'Knoesen Sans', 16: 'Knoesen Sans',
        2: subfamily, 17: subfamily,
        3: f'KnoesenSans-{weight}-site-20261013',
        4: f'Knoesen Sans {subfamily}',
        6: f'KnoesenSans-{weight}', 25: 'KnoesenSans',
    }
    names = font['name']
    for record in list(names.names):
        if record.nameID in values:
            names.setName(values[record.nameID], record.nameID,
                          record.platformID, record.platEncID, record.langID)
    for name_id, text in values.items():
        names.setName(text, name_id, 3, 1, 0x409)


def main():
    families = {
        'ibm-plex-sans': (400, 500, 600, 700),
        'fraunces-normal': (300, 400, 500, 600, 700),
        'fraunces-italic': (300, 400, 500),
    }
    for prefix, weights in families.items():
        for script in ('latin', 'latin-ext'):
            source = ROOT / f'{prefix}-{script}.woff2'
            with TTFont(source) as original:
                for weight in weights:
                    result = instantiateVariableFont(original, {'wght': weight}, inplace=False)
                    if prefix == 'ibm-plex-sans':
                        name_sans_derivative(result, weight)
                    target = ROOT / f'{prefix}-w{weight}-{script}-site.woff2'
                    result.save(target)
                    result.close()
                    with TTFont(target) as saved:
                        assert saved.getBestCmap() == original.getBestCmap(), target.name
                    print(f'{target.name}: {target.stat().st_size} bytes; character coverage retained')

if __name__ == '__main__':
    main()
