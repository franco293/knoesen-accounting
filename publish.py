"""Build and select the exact static release; never publish the source tree."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent


def selected_files():
    import build
    selected = {build.outfile_for(p['slug']).relative_to(ROOT) for p in build.PAGES}
    selected.update(Path(x) for x in ('_headers', '_redirects', 'robots.txt', 'sitemap.xml', 'manifest.json', 'css/styles.css', 'css/no-js.css', 'js/main.js'))
    if build.TRACKING_ON:
        selected.update(Path(x) for x in ('js/consent.js', 'js/tags.js'))
    for page in build.PAGES:
        selected.update(Path('js') / name for name in page.get('scripts', []))
    # Only public media formats belong in assets; no editor/config/archive files.
    selected.update(p.relative_to(ROOT) for p in (ROOT / 'assets').rglob('*')
                    if p.is_file() and p.suffix.lower() in {'.woff2', '.png', '.svg', '.ico', '.webp', '.avif', '.jpg', '.jpeg'})
    for relative in selected:
        source = ROOT / relative
        if source.is_symlink() or ROOT not in source.resolve().parents or not source.is_file():
            raise ValueError('Unsafe or missing release asset: ' + str(relative))
    return sorted(selected)


def main():
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'build.py'), '--check'], cwd=ROOT, check=True)
    subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests'], cwd=ROOT, check=True)
    selected = selected_files()
    files = {p.as_posix(): hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in selected}
    release_id = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()[:16]
    dest = ROOT / 'dist'
    if dest.is_symlink() or dest.resolve().parent != ROOT:
        raise ValueError('Publish directory must be inside this project')
    if dest.exists():
        previous = ROOT / 'release-manifest.json'
        if not previous.exists():
            raise ValueError('Existing dist has no release manifest; inspect it before replacing')
        known = set(json.loads(previous.read_text())['files'])
        actual = {p.relative_to(dest).as_posix() for p in dest.rglob('*') if p.is_file()}
        if actual - known:
            raise ValueError('Unexpected files in dist; refusing to delete them')
    stage = Path(tempfile.mkdtemp(prefix='release-stage-', dir=ROOT))
    try:
        for relative in selected:
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
        if dest.exists():
            shutil.rmtree(dest)
        stage.rename(dest)
    finally:
        if stage.exists() and stage.resolve().parent == ROOT:
            shutil.rmtree(stage)
    manifest = {'release': release_id, 'built_utc': datetime.now(timezone.utc).isoformat(), 'files': files}
    (ROOT / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('Prepared release %s: %d allowlisted files in dist; nothing deployed.' % (release_id, len(files)))


if __name__ == '__main__':
    main()
