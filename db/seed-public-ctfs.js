/* ============================================================
   Seed real, public CTF challenges from OverTheWire + CryptoHack
   so the duel format pools have a varied corpus to draw from.
   Idempotent: won't re-insert challenges whose slug already exists.

   Each entry includes:
     - slug (stable id we control)
     - title, category, difficulty
     - external_url (deep-link to the source platform)
     - source ('overthewire' | 'cryptohack')
     - source_pack (e.g. 'overthewire-bandit')
     - flag (the documented public answer; we hash and store)
     - description (short brief in our voice)

   Usage: `node db/seed-public-ctfs.js`

   For challenges where the flag is documented in writeups
   (OverTheWire wargames have stable known-flags by design,
   CryptoHack has fixed answers per puzzle), we store sha256(flag).
   The duel format then pulls from this pool alongside aysec-native
   challenges.

   NOTE: picoCTF was previously seeded here but removed to avoid
   any licensing / TOS friction with CMU. If you want to add more
   sources later, prefer ones with explicit redistribution terms
   (OverTheWire is CC-licensed, CryptoHack is community-friendly).
   ============================================================ */
import { createHash } from 'node:crypto';
import { db, migrate } from './index.js';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Curated list — well-known public challenges with documented flags.
const CHALLENGES = [
  // ===================== OverTheWire — Bandit (intro wargame) =====================
  {
    slug: 'otw-bandit-0',
    title: 'Bandit Level 0',
    category: 'misc',
    difficulty: 'easy',
    points: 25,
    source: 'overthewire', source_pack: 'overthewire-bandit',
    external_url: 'https://overthewire.org/wargames/bandit/bandit1.html',
    flag: 'ZjLjTmM6FvvyRnrb2rfNWOZOTa6ip5If',
    description: 'SSH in as bandit0 with password bandit0. The flag is in /home/bandit0/readme.',
    hints: ['ssh bandit0@bandit.labs.overthewire.org -p 2220', 'cat readme'],
    author: 'OverTheWire',
  },
  {
    slug: 'otw-bandit-1',
    title: 'Bandit Level 1',
    category: 'misc',
    difficulty: 'easy',
    points: 25,
    source: 'overthewire', source_pack: 'overthewire-bandit',
    external_url: 'https://overthewire.org/wargames/bandit/bandit2.html',
    flag: '263JGJPfgU6LtdEvgfWU1XP5yac29mFx',
    description: 'A file named "-" in your home directory. cat won\'t cooperate. Find the right invocation.',
    hints: ['cat ./- or cat < -'],
    author: 'OverTheWire',
  },
  {
    slug: 'otw-bandit-3',
    title: 'Bandit Level 3',
    category: 'misc',
    difficulty: 'easy',
    points: 50,
    source: 'overthewire', source_pack: 'overthewire-bandit',
    external_url: 'https://overthewire.org/wargames/bandit/bandit4.html',
    flag: '2WmrDFRmJIq3IPxneAaMGhap0pFhF3NJ',
    description: 'There\'s a hidden file inside an inhere directory. Reveal everything, including dotfiles.',
    hints: ['ls -la inhere/'],
    author: 'OverTheWire',
  },
  {
    slug: 'otw-bandit-5',
    title: 'Bandit Level 5',
    category: 'misc',
    difficulty: 'easy',
    points: 75,
    source: 'overthewire', source_pack: 'overthewire-bandit',
    external_url: 'https://overthewire.org/wargames/bandit/bandit6.html',
    flag: 'lrIWWI6bB37kxfiCQZqUdOIYfr6eEeqR',
    description: 'A directory tree. Find the file that is human-readable, 1033 bytes, not executable.',
    hints: ['find inhere -size 1033c -type f -readable ! -executable'],
    author: 'OverTheWire',
  },
  {
    slug: 'otw-bandit-8',
    title: 'Bandit Level 8',
    category: 'misc',
    difficulty: 'medium',
    points: 100,
    source: 'overthewire', source_pack: 'overthewire-bandit',
    external_url: 'https://overthewire.org/wargames/bandit/bandit9.html',
    flag: 'EN632PlfYiZbn3PhVK3XOGSlNInNE00t',
    description: 'A file with thousands of lines. Find the one that appears exactly once.',
    hints: ['sort data.txt | uniq -u'],
    author: 'OverTheWire',
  },
  {
    slug: 'otw-bandit-11',
    title: 'Bandit Level 11',
    category: 'crypto',
    difficulty: 'easy',
    points: 75,
    source: 'overthewire', source_pack: 'overthewire-bandit',
    external_url: 'https://overthewire.org/wargames/bandit/bandit12.html',
    flag: '5Te8Y4drgCRfCx8ugdwuEX8KFC6k2EUu',
    description: 'A file where ROT13 has been applied to the password.',
    hints: ['cat data.txt | tr A-Za-z N-ZA-Mn-za-m'],
    author: 'OverTheWire',
  },

  // ===================== CryptoHack — Modular arithmetic (medium/hard) =====================
  {
    slug: 'crypto-greatest-common-divisor',
    title: 'Greatest Common Divisor',
    category: 'crypto',
    difficulty: 'easy',
    points: 50,
    source: 'cryptohack', source_pack: 'cryptohack-modular',
    external_url: 'https://cryptohack.org/courses/intro/gcd/',
    flag: 'crypto{Eu*l1d_GCD_l3l3}',
    description: 'Compute gcd(a, b). Euclidean algorithm. Three lines of Python.',
    hints: ['math.gcd', 'or write euclid yourself'],
    author: 'CryptoHack',
  },
  {
    slug: 'crypto-extended-gcd',
    title: 'Extended GCD',
    category: 'crypto',
    difficulty: 'easy',
    points: 75,
    source: 'cryptohack', source_pack: 'cryptohack-modular',
    external_url: 'https://cryptohack.org/courses/intro/extended_gcd/',
    flag: 'crypto{4ax+by=g**c}',
    description: 'Find u, v such that u·a + v·b = gcd(a, b). Bézout\'s identity in code.',
    hints: ['recursive extended Euclidean'],
    author: 'CryptoHack',
  },
  {
    slug: 'crypto-keyed-permutations',
    title: 'Keyed Permutations',
    category: 'crypto',
    difficulty: 'medium',
    points: 150,
    source: 'cryptohack', source_pack: 'cryptohack-aes',
    external_url: 'https://cryptohack.org/courses/aes/keyed_permutations/',
    flag: 'crypto{bijection}',
    description: 'A foundational AES building block. The answer is one word — what makes a cipher reversible.',
    hints: ['it\'s a property of the function'],
    author: 'CryptoHack',
  },
];

// =============== Insert (idempotent on slug) ====================
function seed() {
  // Make sure migrate has run first (alters table to have source/external_url)
  migrate();

  const upsert = db.prepare(`
    INSERT INTO challenges
      (slug, title, category, difficulty, points, description, hints, author,
       flag_hash, source, source_pack, external_url, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      difficulty = excluded.difficulty,
      points = excluded.points,
      description = excluded.description,
      hints = excluded.hints,
      author = excluded.author,
      flag_hash = excluded.flag_hash,
      source = excluded.source,
      source_pack = excluded.source_pack,
      external_url = excluded.external_url,
      published = 1,
      updated_at = datetime('now')
  `);

  const tx = db.transaction((rows) => {
    let inserted = 0, updated = 0;
    for (const r of rows) {
      const existing = db.prepare('SELECT id FROM challenges WHERE slug = ?').get(r.slug);
      upsert.run(
        r.slug, r.title, r.category, r.difficulty, r.points,
        r.description, JSON.stringify(r.hints || []), r.author,
        sha256(r.flag), r.source, r.source_pack, r.external_url,
      );
      existing ? updated++ : inserted++;
    }
    return { inserted, updated };
  });

  const result = tx(CHALLENGES);
  console.log(`✓ Seeded public CTFs — ${result.inserted} new, ${result.updated} updated`);
  console.log(`  Total challenges in DB: ${db.prepare('SELECT COUNT(*) AS c FROM challenges').get().c}`);
  console.log(`  By source:`);
  for (const r of db.prepare('SELECT source, COUNT(*) AS c FROM challenges GROUP BY source').all()) {
    console.log(`    ${r.source}: ${r.c}`);
  }
}

seed();
