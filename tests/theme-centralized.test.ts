import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const RULES: [string, RegExp][] = [
  ['hex color literal', /#[0-9a-fA-F]{3,8}\b/],
  ['rgb()/rgba() color literal', /rgba?\(/],
  ['font family literal', /fontFamily:\s*['"]/],
  ['numeric radius', /[Rr]adius:\s*\d/],
  ['numeric shadow', /shadow(Radius|Opacity|Offset):\s*[\d{]/],
];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

describe('theme is centralized', () => {
  it('has no hard-coded colors or font families outside src/theme/', () => {
    const themeDir = path.join(ROOT, 'src', 'theme') + path.sep;
    const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app'))].filter(
      (f) => !f.startsWith(themeDir),
    );
    const offenders: string[] = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const [label, re] of RULES) {
            if (re.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1} ${label}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
