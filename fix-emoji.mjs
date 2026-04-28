import { readFileSync, writeFileSync } from 'fs';

// Map of exact corrupted Unicode sequences → correct emoji
// Determined by reading actual codepoints from the files
const replacements = [
  // 4-char corrupted sequences (ðŸXX form - original mojibake still present)
  ['\u00F0\u0178\u201C\u2039', '📋'],  // 📋 clipboard
  ['\u00F0\u0178\u201C\u0161', '📚'],  // 📚 books
  ['\u00F0\u0178\u201C\u017E', '📞'],  // 📞 phone
  ['\u00F0\u0178\u201C\u00B7', '📷'],  // 📷 camera
  ['\u00F0\u0178\u2019\u00BE', '💾'],  // 💾 floppy
  ['\u00F0\u0178\u017D\u00AF', '🎯'],  // 🎯 target
  ['\u00F0\u0178\u008F\u00A0', '🏠'],  // 🏠 house
  ['\u00F0\u0178\u008F\u00AB', '🏫'],  // 🏫 school
  ['\u00F0\u0178\u02DC\u00B0', '😰'],  // 😰 anxious
  ['\u00F0\u0178\u0152\u0178', '🌟'],  // 🌟 star

  // 4-char corrupted sequences (ŸŸxx form - after previous partial fix)
  ['\u0178\u0178\u201C\u2039', '📋'],
  ['\u0178\u0178\u201C\u0161', '📚'],
  ['\u0178\u0178\u201C\u017E', '📞'],
  ['\u0178\u0178\u201C\u00B7', '📷'],
  ['\u0178\u0178\u2019\u00BE', '💾'],
  ['\u0178\u0178\u017D\u00AF', '🎯'],
  ['\u0178\u0178\u008F\u00A0', '🏠'],
  ['\u0178\u0178\u008F\u00AB', '🏫'],
  ['\u0178\u0178\u02DC\u00B0', '😰'],
  ['\u0178\u0178\u0152\u0178', '🌟'],

  // 3-char corrupted sequences for ✨ (both Latin-1 and Win-1252 variants)
  ['\u00E2\u0153\u00A8', '✨'],   // Win-1252 variant (0x9C→U+0153)
  ['\u00E2\u009C\u00A8', '✨'],   // Latin-1 variant
  ['\u009C\u0153\u00A8', '✨'],   // partially-stripped variant

  // ← arrow (U+2190) corruptions — all known variants
  ['\u009C\u2020\u0090', '←'],    // C1+dagger+C1 form (after partial fixup)
  ['\u00E2\u2020\u0090', '←'],    // Win-1252 variant
  ['\u00E2\u0086\u0090', '←'],    // Latin-1 variant

  // → arrow (U+2192) corruptions
  ['\u009C\u2020\u2019', '→'],    // after partial fixup
  ['\u00E2\u2020\u2019', '→'],    // Win-1252 variant
  ['\u00E2\u0086\u2019', '→'],    // Latin-1 variant

  // ✏️ pencil (U+270F U+FE0F) corruptions — all known variants
  ['\u0153\u008F\u00EF\u00B8\u008F', '✏️'],   // after partial fixup
  ['\u00E2\u009C\u008F\u00EF\u00B8\u008F', '✏️'],
  ['\u00E2\u0153\u008F\u00EF\u00B8\u008F', '✏️'],

  // ✉️ envelope (U+2709 U+FE0F) corruptions — all known variants
  ['\u0153\u2030\u00EF\u00B8\u008F', '✉️'],   // after partial fixup (Win-1252)
  ['\u0153\u0089\u00EF\u00B8\u008F', '✉️'],   // after partial fixup (Latin-1)
  ['\u00E2\u009C\u0089\u00EF\u00B8\u008F', '✉️'],
  ['\u00E2\u0153\u0089\u00EF\u00B8\u008F', '✉️'],
];

const files = [
  'c:/STUDENT APP/frontend/src/components/ClassmateProfileModal.jsx',
  'c:/STUDENT APP/frontend/src/pages/Profile.jsx',
];

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  let changes = 0;
  for (const [from, to] of replacements) {
    const before = content;
    content = content.split(from).join(to);
    if (content !== before) changes++;
  }
  writeFileSync(file, content, 'utf8');
  console.log(`Fixed ${file} (${changes} replacements)`);
}
