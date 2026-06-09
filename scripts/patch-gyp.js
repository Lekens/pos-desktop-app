/**
 * Patches node-gyp's bundled gyp/input.py to add a fallback for the missing
 * `distutils` module on Python 3.12+. Runs automatically via `postinstall`.
 *
 * Root cause: node-gyp v9.x ships a gyp version that imports
 * `from distutils.version import StrictVersion` — distutils was removed in
 * Python 3.12. This patch adds a pure-Python fallback so the build succeeds
 * on Python 3.12, 3.13, 3.14, etc.
 */

const fs = require('fs')
const path = require('path')

const target = path.join(
  __dirname,
  '../node_modules/node-gyp/gyp/pylib/gyp/input.py',
)

if (!fs.existsSync(target)) {
  console.log('[patch-gyp] node-gyp not found — skipping patch')
  process.exit(0)
}

const original = `from distutils.version import StrictVersion`

const patched = `try:
    from distutils.version import StrictVersion
except ImportError:
    import re as _re
    class StrictVersion:
        def __init__(self, vstring):
            m = _re.match(r'^(\\d+)\\.(\\d+)(\\.(\\d+))?$', vstring)
            if not m:
                raise ValueError(f'invalid version number {vstring!r}')
            self.version = (int(m.group(1)), int(m.group(2)), int(m.group(4) or 0))
        def _cmp(self, other):
            o = StrictVersion(other) if isinstance(other, str) else other
            return (self.version > o.version) - (self.version < o.version)
        def __eq__(self, other): return self._cmp(other) == 0
        def __lt__(self, other): return self._cmp(other) < 0
        def __le__(self, other): return self._cmp(other) <= 0
        def __gt__(self, other): return self._cmp(other) > 0
        def __ge__(self, other): return self._cmp(other) >= 0`

const content = fs.readFileSync(target, 'utf8')

if (content.includes(patched.split('\n')[0])) {
  console.log('[patch-gyp] Already patched — nothing to do')
  process.exit(0)
}

if (!content.includes(original)) {
  console.log('[patch-gyp] Target line not found — gyp may have been updated, skipping')
  process.exit(0)
}

fs.writeFileSync(target, content.replace(original, patched), 'utf8')
console.log('[patch-gyp] Patched node-gyp/gyp/input.py for Python 3.12+ compatibility')
