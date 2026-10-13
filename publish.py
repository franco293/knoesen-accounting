"""Build and select the exact static release; never publish the source tree."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent


def existing_release_files(directory):
    """Fail before replacement if any part of the previous release is unreadable."""
    def scan_error(error):
        raise ValueError('Cannot inspect the existing release folder; its permissions must be repaired or build in a fresh copy. Nothing has been replaced.') from error

    return {str((Path(folder) / name).relative_to(directory)).replace('\\', '/')
            for folder, _, filenames in os.walk(directory, onerror=scan_error)
            for name in filenames}


def selected_files():
    import build
    selected = {build.outfile_for(p['slug']).relative_to(ROOT) for p in build.PAGES}
    selected.update(Path(x) for x in ('_headers', '_redirects', 'robots.txt', 'sitemap.xml', 'manifest.json', 'css/styles.css', 'css/no-js.css', 'js/main.js'))
    if build.TRACKING_ON:
        selected.update(Path(x) for x in ('js/consent.js', 'js/tags.js'))
    for page in build.PAGES:
        selected.update(Path('js') / name for name in page.get('scripts', []))
    # Publish only active fonts; original/legacy inputs stay in the repository.
    # Each redistributed font ships with its original OFL notice. Do not use a
    # generic .txt rule, which could accidentally publish private notes.
    css = (ROOT / 'css/styles.css').read_text(encoding='utf-8')
    active_fonts = re.findall(r'/assets/fonts/([^\s\"\'()]+\.woff2)', css)
    active_fonts += build.PRELOAD_FONTS_HOME
    selected.update(Path('assets/fonts') / name for name in active_fonts)
    selected.update(Path('assets/fonts') / name for name in (
        'OFL-Fraunces.txt', 'OFL-IBM-Plex-Sans.txt', 'OFL-IBM-Plex-Mono.txt'))
    # Only public media formats belong in assets; no editor/config/archive files.
    selected.update(p.relative_to(ROOT) for p in (ROOT / 'assets').rglob('*')
                    if p.is_file() and p.suffix.lower() in {'.png', '.svg', '.ico', '.webp', '.avif', '.jpg', '.jpeg'})
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
        actual = existing_release_files(dest)
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
