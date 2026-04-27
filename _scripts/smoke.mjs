const PATHS = [
  '/', '/courses', '/courses/web-hacking-101',
  '/challenges', '/challenges/warmup-jwt',
  '/blog', '/blog/why-i-built-this-platform',
  '/about', '/dashboard', '/login', '/signup',
  '/api/courses', '/api/challenges', '/api/posts',
  '/api/posts/why-i-built-this-platform',
  '/api/courses/web-hacking-101',
  '/api/courses/web-hacking-101/lessons/welcome',
  '/api/challenges/leaderboard/top',
];

const base = 'http://localhost:3000';
let ok = 0, fail = 0;
for (const p of PATHS) {
  try {
    const r = await fetch(base + p);
    const isOk = r.ok || r.status === 401; // 401 expected on /api/auth/* w/o cookie
    const tag = isOk ? '✓' : '✗';
    console.log(`  ${tag}  ${String(r.status).padEnd(3)}  ${p}`);
    isOk ? ok++ : fail++;
  } catch (e) {
    console.log(`  !  ERR  ${p} — ${e.message}`);
    fail++;
  }
}
console.log(`\n${ok}/${PATHS.length} OK, ${fail} fail`);
process.exit(fail ? 1 : 0);
