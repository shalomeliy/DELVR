import { parseTranscript } from './parser.js';
import { CASES } from './test-cases.js';

let ok = 0, total = 0;
for (const c of CASES) {
  const got = parseTranscript(c.text, { defaultCity: c.defaultCity });
  console.log(`\n# ${c.name}: ${got.length} כתובות (צפוי ${c.expected.length})`);
  c.expected.forEach(([street, number, city, extra = {}], i) => {
    total++;
    const g = got[i] || {};
    const pass = g.street === street && g.number === number && g.city === city &&
      Object.entries(extra).every(([k, v]) => g[k] === v);
    if (pass) ok++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${g.geocodeQuery ?? '(חסר)'}${pass ? '' : `   צפוי: ${street} ${number}, ${city} ${JSON.stringify(extra)}`}`);
  });
}
console.log(`\nסה"כ ${ok}/${total} (${Math.round((100 * ok) / total)}%)`);
process.exit(ok === total ? 0 : 1);
