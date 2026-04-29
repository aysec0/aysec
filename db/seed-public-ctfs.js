/* ============================================================
   Seed real, public CTF challenges from picoCTF / OverTheWire /
   cryptohack so the duel format pools have a varied corpus to
   draw from. Idempotent: won't re-insert challenges whose slug
   already exists.

   Each entry includes:
     - slug (stable id we control)
     - title, category, difficulty
     - external_url (deep-link to the source platform)
     - source ('picoctf' | 'overthewire' | 'cryptohack')
     - source_pack (e.g. 'picoctf-2019', 'overthewire-bandit')
     - flag (the documented public answer; we hash and store)
     - description (short brief in our voice)

   Usage: `node db/seed-public-ctfs.js`
   Or via npm: add `"seed:ctfs": "node db/seed-public-ctfs.js"` to package.json.

   For challenges where the flag is documented in writeups
   (picoCTF past competitions, OverTheWire wargames), we store
   sha256(flag). The duel format then pulls from this pool
   alongside aysec-native challenges.
   ============================================================ */
import { createHash } from 'node:crypto';
import { db, migrate } from './index.js';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Curated list — well-known public challenges with documented flags.
// All flags here are publicly available in writeups; storing the hash only.
const CHALLENGES = [
  // ===================== picoCTF — General Skills (easy) =====================
  {
    slug: 'pico-obedient-cat',
    title: 'Obedient Cat',
    category: 'misc',
    difficulty: 'easy',
    points: 50,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/179',
    flag: 'picoCTF{s4n1ty_v3r1f13d_28e7e5b1}',
    description: 'Just `cat` the file. Sometimes the warm-up really is the warm-up.',
    hints: ['cat'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-mod-26',
    title: 'Mod 26',
    category: 'crypto',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/119',
    flag: 'picoCTF{cr0ssingtherubicon_d7159924}',
    description: 'A ROT13 cipher. Decode the message — letters wrapped around modulo 26.',
    hints: ['ROT13'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-mind-your-ps-and-qs',
    title: 'Mind your Ps and Qs',
    category: 'crypto',
    difficulty: 'medium',
    points: 200,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/73',
    flag: 'picoCTF{sma11_N_n0_g0od_05012767}',
    description: 'Tiny RSA modulus. Factor n, recover the private key, decrypt the message.',
    hints: ['n is small enough to factor', 'try factordb.com'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-information',
    title: 'Information',
    category: 'forensics',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/133',
    flag: 'picoCTF{the_m3tadata_1s_modified}',
    description: 'There is metadata in this image. Pull it out.',
    hints: ['exiftool', 'try every metadata field'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-static-ish',
    title: 'static ain\'t always noise',
    category: 'rev',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/121',
    flag: 'picoCTF{d15a5m_t34s3r_99c0a13e}',
    description: 'A binary that prints something interesting. `strings` it, then read carefully.',
    hints: ['strings', 'pipe through grep picoCTF'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-cookies',
    title: 'Cookies',
    category: 'web',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/170',
    flag: 'picoCTF{3v3ry1_l0v3s_c00k135_94186cda}',
    description: 'A login that loves cookies. Iterate through the values until something gives.',
    hints: ['inspect cookies', 'try changing the name= cookie'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-get-aHEAD',
    title: 'GET aHEAD',
    category: 'web',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/146',
    flag: 'picoCTF{r3j3ct_th3_du4l1ty_8f878508}',
    description: 'GET feels normal. POST is fine. What other HTTP verbs are there?',
    hints: ['HEAD method', 'curl -I or Burp'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-where-are-the-robots',
    title: 'Where are the robots',
    category: 'web',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2019',
    external_url: 'https://play.picoctf.org/practice/challenge/9',
    flag: 'picoCTF{ca1cu1at1ng_Mach1n3s_8a3a7ade}',
    description: 'Crawlers usually check this file before they work. So should you.',
    hints: ['/robots.txt'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-dont-use-client-side',
    title: 'don\'t use client-side',
    category: 'web',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2019',
    external_url: 'https://play.picoctf.org/practice/challenge/3',
    flag: 'picoCTF{no_clients_plz_b023b1d6}',
    description: 'A login form. The validation logic is in the page source.',
    hints: ['view-source:', 'reconstruct the password from the JS'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-logon',
    title: 'logon',
    category: 'web',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2019',
    external_url: 'https://play.picoctf.org/practice/challenge/16',
    flag: 'picoCTF{th3_c0nsp1r4cy_l1v3s_56e09850}',
    description: 'You can log in. The site recognises you. But what does it actually check?',
    hints: ['cookies tell the truth', 'admin=False'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-the-numbers',
    title: 'The Numbers',
    category: 'crypto',
    difficulty: 'easy',
    points: 50,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/3',
    flag: 'picoCTF{THENUMBERSMASON}',
    description: 'A row of numbers. Map A=1, B=2, ... and decode.',
    hints: ['letter-position cipher'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-13',
    title: '13',
    category: 'crypto',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2019',
    external_url: 'https://play.picoctf.org/practice/challenge/45',
    flag: 'picoCTF{not_too_bad_of_a_problem}',
    description: 'Caesar cipher with shift 13. Beat the rotor.',
    hints: ['ROT13'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-easy-peasy',
    title: 'easy peasy',
    category: 'crypto',
    difficulty: 'medium',
    points: 200,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/85',
    flag: 'picoCTF{99732bf213ea8d8f8567a26aef3bdb14}',
    description: 'A custom one-time pad. The key wraps. Recover and decrypt.',
    hints: ['key reuse', 'XOR with known plaintext'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-stonks',
    title: 'Stonks',
    category: 'pwn',
    difficulty: 'medium',
    points: 200,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/85',
    flag: 'picoCTF{I\'m_addicted_to_2_chainz}',
    description: 'A finance app reads your name. Format-string into the secret memory.',
    hints: ['printf', '%s leak'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-vault-door-3',
    title: 'vault-door-3',
    category: 'rev',
    difficulty: 'medium',
    points: 200,
    source: 'picoctf', source_pack: 'picoctf-2018',
    external_url: 'https://play.picoctf.org/practice/challenge/35',
    flag: 'picoCTF{jU5T_a_sIMpLe_an4Gr4M_sA4D27FA}',
    description: 'Vault checks your password by rearranging chars. Reverse the permutation.',
    hints: ['read the Java carefully'],
    author: 'picoCTF',
  },

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

  // ===================== picoCTF — Hard (insane bucket) =====================
  {
    slug: 'pico-glory-of-the-garden',
    title: 'glory of the garden',
    category: 'forensics',
    difficulty: 'easy',
    points: 50,
    source: 'picoctf', source_pack: 'picoctf-2019',
    external_url: 'https://play.picoctf.org/practice/challenge/68',
    flag: 'picoCTF{more_than_meets_the_eye}',
    description: 'A garden picture. Something is hiding behind the JPEG marker.',
    hints: ['strings', 'check for trailing data after EOI'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-vault-door-7',
    title: 'vault-door-7',
    category: 'rev',
    difficulty: 'hard',
    points: 350,
    source: 'picoctf', source_pack: 'picoctf-2018',
    external_url: 'https://play.picoctf.org/practice/challenge/39',
    flag: 'picoCTF{exr3m3ly_hex_bit_l3v3l_a3lj4r1u}',
    description: 'A Java vault tests your password byte-by-byte through bitshifts. Reverse the encoding.',
    hints: ['read every shift carefully', 'invert byte by byte'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-flag-leak',
    title: 'flag_leak',
    category: 'pwn',
    difficulty: 'hard',
    points: 350,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/127',
    flag: 'picoCTF{L34k1ng_Th3_Fl4g_yum_yum_l3aks}',
    description: 'A binary that printf\'s your input back. Format-string the flag out of memory.',
    hints: ['%s', '%p chain'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-buffer-overflow-1',
    title: 'buffer overflow 1',
    category: 'pwn',
    difficulty: 'hard',
    points: 300,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/121',
    flag: 'picoCTF{addr3ss3s_ar3_3asy_a64a48b1}',
    description: 'Classic stack overflow into a function pointer. ASLR off, NX off, no canary. Free flag.',
    hints: ['gdb to find the win() address', 'pad to RIP, overwrite'],
    author: 'picoCTF',
  },

  // ===================== cryptohack — Modular arithmetic (medium/hard) =====================
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

  // ===================== picoCTF — Forensics medium =====================
  {
    slug: 'pico-tunn3l-v1s10n',
    title: 'Tunn3l v1s10n',
    category: 'forensics',
    difficulty: 'medium',
    points: 250,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/103',
    flag: 'picoCTF{qu1t3_a_v13w_2020}',
    description: 'A BMP that won\'t open. The header is messed with. Patch the dimensions.',
    hints: ['xxd it', 'fix bytes 0x12 onward'],
    author: 'picoCTF',
  },
  {
    slug: 'pico-disk-disk-sleuth',
    title: 'disk, disk, sleuth!',
    category: 'forensics',
    difficulty: 'easy',
    points: 100,
    source: 'picoctf', source_pack: 'picoctf-2021',
    external_url: 'https://play.picoctf.org/practice/challenge/118',
    flag: 'picoCTF{f0r3ns1c4t0r_n30phyt3_0a72e7eb}',
    description: 'A disk image. The flag\'s right there in the strings.',
    hints: ['strings dds.dd | grep picoCTF'],
    author: 'picoCTF',
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
