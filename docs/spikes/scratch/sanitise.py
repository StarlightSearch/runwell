# Sanitises a stream-json capture: drops hook output lines, trims init to safe fields,
# replaces the spike folder and home paths, session ids and emails.
import json, re, sys
src, dst, folder = sys.argv[1], sys.argv[2], sys.argv[3]
home = __import__('os').path.expanduser('~')
ids = {}
def sid(m):
    return ids.setdefault(m.group(0), f"00000000-0000-4000-8000-{len(ids)+1:012d}")
out = []
for line in open(src):
    try: d = json.loads(line)
    except Exception: continue
    if d.get('type') == 'system' and d.get('subtype') in ('hook_started', 'hook_response'): continue
    if d.get('subtype') == 'init':
        d = {k: d.get(k) for k in ('type', 'subtype', 'cwd', 'session_id', 'model', 'permissionMode', 'apiKeySource', 'claude_code_version')}
        d['tools'] = ['<trimmed>']; d['mcp_servers'] = ['<trimmed>']
    s = json.dumps(d, ensure_ascii=False)
    s = s.replace(folder, '/tmp/spike').replace(home, '~')
    s = re.sub(r'-tmp-claude-[0-9]+-[A-Za-z0-9-]*?-scratchpad-spikes', '-tmp-spike', s)
    s = s.replace(re.sub(r'[^A-Za-z0-9]', '-', home), '-home-user')
    s = re.sub(r'[\w.+-]+@[\w-]+\.[\w.]+', '<email>', s)
    s = re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', sid, s)
    out.append(s)
open(dst, 'w').write('\n'.join(out) + '\n')
print(dst, len(out), 'lines')
