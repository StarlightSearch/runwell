# Turns a spike capture into a test fixture: same rules as sanitise.py, plus home -> /home/user,
# the run folder -> /home/user/project, and (for session logs) only conversation lines kept.
import json, os, re, sys
src, dst, folder = sys.argv[1], sys.argv[2], sys.argv[3]
mode = sys.argv[4] if len(sys.argv) > 4 else "stream"
home = os.path.expanduser("~")
KEEP = {"user", "assistant", "system"}
ids = {}
def sid(m): return ids.setdefault(m.group(0), f"00000000-0000-4000-8000-{len(ids)+1:012d}")
out = []
for line in open(src):
    try: d = json.loads(line)
    except Exception: continue
    if mode == "stream" and d.get("type") == "system" and d.get("subtype") in ("hook_started", "hook_response"): continue
    if mode == "session" and d.get("type") not in KEEP: continue
    if d.get("subtype") == "init":
        d = {k: d.get(k) for k in ("type", "subtype", "cwd", "session_id", "model", "permissionMode", "apiKeySource", "claude_code_version")}
        d["tools"] = ["Agent", "Bash", "Edit", "Read", "Skill", "Task", "Write"]; d["mcp_servers"] = []
    s = json.dumps(d, ensure_ascii=False)
    s = s.replace(folder, "/home/user/project").replace(home, "/home/user")
    s = re.sub(r"-tmp-claude-[0-9]+-[A-Za-z0-9-]*?-scratchpad-spikes-[a-z0-9-]+", "-home-user-project", s)
    s = s.replace(re.sub(r"[^A-Za-z0-9]", "-", home), "-home-user")
    s = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "<email>", s)
    s = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", sid, s)
    out.append(s)
open(dst, "w").write("\n".join(out) + "\n")
print(os.path.basename(dst), len(out))
