/* End-to-end: signup → submit correct flag → dashboard reflects solve. */

const base = 'http://localhost:3000';
let cookie = '';

async function req(method, path, body) {
  const headers = { 'Accept': 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

const u = `tester${Date.now()}`;

console.log('1. signup');
let r = await req('POST', '/api/auth/register', { username: u, email: `${u}@test.local`, password: 'verysecret123' });
console.log(`   → ${r.status}`, r.data.user?.username);
if (r.status !== 201) process.exit(1);

console.log('2. me (after signup)');
r = await req('GET', '/api/auth/me');
console.log(`   → ${r.status}`, r.data.user?.username);
if (r.status !== 200) process.exit(1);

console.log('3. submit WRONG flag');
r = await req('POST', '/api/challenges/warmup-jwt/submit', { flag: 'flag{nope}' });
console.log(`   → ${r.status} correct=${r.data.correct}`);
if (r.status !== 200 || r.data.correct !== false) process.exit(1);

console.log('4. submit CORRECT flag');
r = await req('POST', '/api/challenges/warmup-jwt/submit', { flag: 'flag{none_alg_strikes_again}' });
console.log(`   → ${r.status} correct=${r.data.correct}`);
if (r.status !== 200 || r.data.correct !== true) process.exit(1);

console.log('5. enroll in free course');
r = await req('POST', '/api/courses/web-hacking-101/enroll');
console.log(`   → ${r.status} enrolled=${r.data.enrolled}`);
if (r.status !== 200) process.exit(1);

console.log('6. mark a lesson complete');
r = await req('POST', '/api/courses/web-hacking-101/lessons/welcome/complete');
console.log(`   → ${r.status}`);
if (r.status !== 200) process.exit(1);

console.log('7. dashboard');
r = await req('GET', '/api/auth/dashboard');
console.log(`   → ${r.status} score=${r.data.stats?.score} solves=${r.data.stats?.solves} rank=${r.data.stats?.rank} enrolled=${r.data.enrolled?.length} solved=${r.data.solved?.length}`);
if (r.status !== 200 || r.data.stats.solves !== 1 || r.data.enrolled.length !== 1) process.exit(1);

console.log('8. leaderboard includes us');
r = await req('GET', '/api/challenges/leaderboard/top');
const me = r.data.leaderboard?.find((row) => row.username === u);
console.log(`   → ${r.status} rows=${r.data.leaderboard?.length} me=${me ? `${me.score}pts/${me.solves}solves` : 'NOT FOUND'}`);
if (!me) process.exit(1);

console.log('9. logout');
r = await req('POST', '/api/auth/logout');
console.log(`   → ${r.status}`);

console.log('\nAll 9 steps passed.');
