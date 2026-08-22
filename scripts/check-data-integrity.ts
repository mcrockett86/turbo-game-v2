/**
 * Quick data integrity check for the v2 ported data file.
 * Run: npx tsx scripts/check-data-integrity.ts
 */
import { DOGS, ZONES, ITEMS, THREATS, COMPANIONS } from '../turbo-web/src/data';

const errors: string[] = [];

for (const [id, z] of Object.entries(ZONES)) if (z.id !== id) errors.push(`zone id mismatch: ${id}`);
for (const z of Object.values(ZONES))
  for (const r of z.rooms ?? []) {
    if (r.entranceZone && !ZONES[r.entranceZone]) errors.push(`bad entranceZone ${r.entranceZone} in ${z.id}/${r.id}`);
    // Cross-type gates (fp -> tp, etc.) are intentional: the gate is a portal between view modes.
    for (const f of r.features ?? [])
      if (f.item && !ITEMS[f.item]) errors.push(`bad item ${f.item} in ${z.id}/${r.id}`);
  }
// TP-zone features: validate item pickups and gate targets
for (const z of Object.values(ZONES)) {
  for (const f of z.features ?? []) {
    if (f.item && !ITEMS[f.item]) errors.push(`bad item ${f.item} in TP zone ${z.id}`);
    if (f.gate && !ZONES[f.gate]) errors.push(`bad gate ${f.gate} in TP zone ${z.id}`);
  }
}
for (const z of Object.values(ZONES))
  if (z.returnZone && !ZONES[z.returnZone]) errors.push(`bad returnZone ${z.id} -> ${z.returnZone}`);
for (const z of Object.values(ZONES))
  for (const c of z.companions ?? []) if (!COMPANIONS[c]) errors.push(`bad companion ref ${c} in ${z.id}`);
for (const [id, c] of Object.entries(COMPANIONS)) if (c.id !== id) errors.push(`companion id mismatch ${id}`);
for (const [id, t] of Object.entries(THREATS)) if (!t.mangaType) errors.push(`threat missing mangaType ${id}`);
for (const [id, d] of Object.entries(DOGS)) if (d.id !== id) errors.push(`dog id mismatch ${id}`);

console.log(
  `zones: ${Object.keys(ZONES).length} | companions: ${Object.keys(COMPANIONS).length} | ` +
  `items: ${Object.keys(ITEMS).length} | threats: ${Object.keys(THREATS).length} | dogs: ${Object.keys(DOGS).length}`
);
if (errors.length) {
  console.log('ERRORS:');
  errors.forEach(e => console.log('  -', e));
  process.exit(1);
} else {
  console.log('ALL INTEGRITY CHECKS PASS');
}
