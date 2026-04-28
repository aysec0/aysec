/* Simulated lab terminal — pure client-side. Each lab slug points to a
   "scenario" object (defined below) that supplies a virtual filesystem
   and a small command table. Commands return canned output that walks
   the user through the lab. Not a real shell, but a real solve loop. */
(() => {
  const $ = (id) => document.getElementById(id);
  const slug = location.pathname.replace(/\/+$/, '').split('/').pop();

  // ---------- Scenarios ----------
  // Each scenario: { title, mission, prompt, fs (path -> file-content),
  // hosts (ip -> { ports, banners }), commands (extra cmd handlers) }
  const SCENARIOS = {
    // Default fallback when slug isn't matched: a small generic scenario.
    'default': {
      title: 'Generic recon network',
      mission: 'A target network sits at 10.10.10.0/24. Find the live host, enumerate open ports, read a flag from the box.',
      hosts: {
        '10.10.10.1':  { up: true,  ports: { 22: 'SSH-2.0-OpenSSH_8.4', 80: 'nginx 1.18.0' } },
        '10.10.10.5':  { up: true,  ports: { 80: 'Apache httpd 2.4.46' } },
        '10.10.10.10': { up: true,  ports: { 22: 'SSH-2.0-OpenSSH_9.3', 8080: 'WEBrick/1.6.0', 9000: 'PHP-FPM' }, hasFlag: true },
      },
      fs: {
        '/etc/motd': 'Welcome to ops-jumpbox. Authorized use only.',
        '/home/aysec/notes.txt': 'todo:\n- finish enum on 10.10.10.10:8080\n- the credentials are admin:admin (rotate me!)\n',
        '/home/aysec/loot/flag.txt': 'aysec{recon-then-pivot}',
      },
    },
  };

  const scenario = SCENARIOS[slug] || SCENARIOS['default'];
  $('ltSlug').textContent = slug;
  $('ltEyebrow').textContent = '// /lab-term/' + slug;
  $('ltTitle').textContent  = scenario.title || 'Simulated lab terminal';
  $('ltMission').textContent = scenario.mission || '';
  $('ltBarTitle').textContent = `aysec@${slug} — bash`;
  $('ltCommands').textContent = [
    'help                              — show commands',
    'ls [path]                         — list files',
    'cat <path>                        — print file',
    'pwd                               — current dir',
    'cd <path>                         — change dir',
    'whoami / id / uname               — host info',
    'ping <ip>                         — check reachability',
    'nmap <ip|cidr>                    — port scan',
    'curl http://<host>[:port][/path]  — HTTP request',
    'echo <text> / clear               — utilities',
    'submit <flag>                     — submit a flag',
  ].join('\n');

  // ---------- Virtual FS ----------
  let cwd = '/home/aysec';
  function resolvePath(p) {
    if (!p) return cwd;
    if (p.startsWith('/')) return normalize(p);
    return normalize(cwd + '/' + p);
  }
  function normalize(p) {
    const parts = p.split('/').filter(Boolean);
    const out = [];
    for (const seg of parts) {
      if (seg === '.') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return '/' + out.join('/');
  }
  function fileExists(p) { return Object.prototype.hasOwnProperty.call(scenario.fs, normalize(p)); }
  function dirEntries(p) {
    const dir = normalize(p);
    const prefix = dir.endsWith('/') ? dir : dir + '/';
    const seen = new Set();
    for (const path of Object.keys(scenario.fs)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const segs = rest.split('/');
      seen.add(segs.length === 1 ? segs[0] : segs[0] + '/');
    }
    return [...seen].sort();
  }

  // ---------- Network ----------
  function hostFor(ip) { return scenario.hosts?.[ip]; }
  function curl(target) {
    // Accept "10.10.10.10:8080/path" or "10.10.10.10"
    const m = target.match(/^(?:https?:\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/);
    if (!m) return ['curl: bad URL'];
    const ip = m[1]; const port = m[2] ? parseInt(m[2], 10) : 80; const path = m[3] || '/';
    const h = hostFor(ip);
    if (!h?.up) return [`curl: (7) Failed to connect to ${ip} port ${port}: Connection refused`];
    if (!h.ports[port]) return [`curl: (7) Failed to connect to ${ip} port ${port}: Connection refused`];
    const banner = h.ports[port];
    if (banner.startsWith('SSH')) return ['curl: (52) Empty reply from server'];
    // Canned HTTP response
    if (path === '/' && port === 80 && /Apache/i.test(banner)) {
      return [
        'HTTP/1.1 200 OK',
        'Server: ' + banner,
        'Content-Type: text/html',
        '',
        '<html><body><h1>It works!</h1><p>Default Apache landing page.</p></body></html>',
      ];
    }
    if (path === '/admin' && port === 8080) {
      return [
        'HTTP/1.1 401 Unauthorized',
        'WWW-Authenticate: Basic realm="staging"',
        'Server: ' + banner,
        '',
        'Authentication required. (hint: try the credentials in /home/aysec/notes.txt)',
      ];
    }
    if (port === 8080 && path === '/admin' && target.includes('admin:admin@')) {
      return [
        'HTTP/1.1 200 OK',
        'Server: ' + banner,
        'Content-Type: text/plain',
        '',
        'admin panel — flag: aysec{recon-then-pivot}',
      ];
    }
    return [
      `HTTP/1.1 200 OK`,
      `Server: ${banner}`,
      `Content-Type: text/html`,
      ``,
      `<html><body><h1>${ip}:${port}${path}</h1><p>aysec lab — explore harder.</p></body></html>`,
    ];
  }

  function nmap(target) {
    const out = [`Starting Nmap (sim) on ${target}`];
    let ips = [];
    if (target.includes('/')) {
      // CIDR — only enumerate the small one this lab uses
      ips = Object.keys(scenario.hosts);
    } else {
      ips = [target];
    }
    let any = false;
    for (const ip of ips) {
      const h = hostFor(ip);
      if (!h?.up) { out.push(`Nmap scan report for ${ip}`, 'Host is down.'); continue; }
      any = true;
      out.push('', `Nmap scan report for ${ip}`, 'Host is up.');
      out.push('PORT     STATE  SERVICE / BANNER');
      for (const [port, banner] of Object.entries(h.ports)) {
        out.push(`${port.padEnd(8)} open   ${banner}`);
      }
    }
    if (!any) out.push('Note: 0 hosts up.');
    out.push('', `Nmap done.`);
    return out;
  }

  // ---------- Command dispatcher ----------
  function handle(cmd) {
    const [name, ...args] = cmd.trim().split(/\s+/);
    if (!name) return [];
    switch (name) {
      case 'help': return [
        'Available: help, ls, cat, pwd, cd, whoami, id, uname, ping, nmap, curl, echo, clear, submit',
      ];
      case 'pwd': return [cwd];
      case 'whoami': return ['aysec'];
      case 'id': return ['uid=1000(aysec) gid=1000(aysec) groups=1000(aysec),27(sudo)'];
      case 'uname': return ['Linux jumpbox 6.1.0-aysec x86_64 GNU/Linux'];
      case 'echo': return [args.join(' ')];
      case 'clear': term.clear(); return [];
      case 'cd': {
        const p = resolvePath(args[0] || '/home/aysec');
        const entries = dirEntries(p);
        if (!entries.length && !fileExists(p)) return [`bash: cd: ${p}: No such file or directory`];
        cwd = p; return [];
      }
      case 'ls': {
        const p = resolvePath(args[0]);
        const e = dirEntries(p);
        if (e.length) return [e.join('  ')];
        if (fileExists(p)) return [p.split('/').pop()];
        return [`ls: cannot access '${p}': No such file or directory`];
      }
      case 'cat': {
        if (!args[0]) return ['cat: missing operand'];
        const p = resolvePath(args[0]);
        if (!fileExists(p)) return [`cat: ${p}: No such file or directory`];
        return scenario.fs[p].split('\n');
      }
      case 'ping': {
        const ip = args[0];
        const h = hostFor(ip);
        if (!h?.up) return [`PING ${ip}: 100% packet loss`];
        return [
          `PING ${ip} 56(84) bytes of data.`,
          `64 bytes from ${ip}: icmp_seq=1 ttl=64 time=0.42 ms`,
          `64 bytes from ${ip}: icmp_seq=2 ttl=64 time=0.39 ms`,
          `--- ${ip} ping statistics ---`,
          `2 packets transmitted, 2 received, 0% packet loss`,
        ];
      }
      case 'nmap': {
        if (!args[0]) return ['Usage: nmap <ip|cidr>'];
        return nmap(args[0]);
      }
      case 'curl': {
        if (!args[0]) return ['curl: try \'curl --help\''];
        return curl(args[args.length - 1]);
      }
      case 'submit': {
        const flag = args.join(' ').trim();
        if (!flag) return ['Usage: submit aysec{...}'];
        const target = Object.values(scenario.fs).find((c) => /aysec\{[^}]+\}/.test(c));
        const correct = target && target.includes(flag);
        return [correct ? '\x1b[32m✓ Correct flag — well played.\x1b[0m'
                        : '\x1b[31m✗ Wrong flag.\x1b[0m'];
      }
      case 'sudo': return ['aysec is not in the sudoers file. This incident will be reported.'];
      default: return [`bash: ${name}: command not found`];
    }
  }

  // ---------- xterm.js boot ----------
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
    fontSize: 13,
    theme: { background: '#0a0d12', foreground: '#d8dde6', cursor: '#39ff7a', selectionBackground: '#234' },
  });
  term.open($('termHost'));

  function prompt() { term.write(`\r\n\x1b[32maysec@${slug}\x1b[0m:\x1b[34m${cwd}\x1b[0m$ `); }
  function println(line) { term.write('\r\n' + line); }

  // Intro
  term.writeln(`\x1b[2maysec lab terminal — simulated · type \x1b[0m\x1b[36mhelp\x1b[0m\x1b[2m to begin\x1b[0m`);
  if (scenario.mission) term.writeln(`\x1b[2mmission:\x1b[0m ${scenario.mission}`);
  prompt();

  let buffer = '';
  let history = [];
  let hIdx = -1;
  term.onData((data) => {
    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (ch === '\r') {
        const cmd = buffer.trim();
        if (cmd) { history.unshift(cmd); hIdx = -1; }
        const out = cmd ? handle(cmd) : [];
        out.forEach(println);
        buffer = '';
        prompt();
      } else if (code === 0x7f) { // backspace
        if (buffer.length > 0) { buffer = buffer.slice(0, -1); term.write('\b \b'); }
      } else if (code === 0x1b) { // escape sequence (arrows)
        // handled below via onData chunk; quick check for arrows
        // (xterm gives the full sequence in 'data')
      } else if (code >= 0x20) {
        buffer += ch;
        term.write(ch);
      }
    }
    // Crude arrow-up: replace buffer with last command
    if (data === '\x1b[A' && history.length) {
      hIdx = Math.min(hIdx + 1, history.length - 1);
      // Wipe current input
      term.write('\r\x1b[K');
      buffer = history[hIdx] || '';
      term.write(`\x1b[32maysec@${slug}\x1b[0m:\x1b[34m${cwd}\x1b[0m$ ${buffer}`);
    } else if (data === '\x1b[B' && history.length) {
      hIdx = Math.max(hIdx - 1, -1);
      term.write('\r\x1b[K');
      buffer = hIdx === -1 ? '' : history[hIdx];
      term.write(`\x1b[32maysec@${slug}\x1b[0m:\x1b[34m${cwd}\x1b[0m$ ${buffer}`);
    }
  });
})();
