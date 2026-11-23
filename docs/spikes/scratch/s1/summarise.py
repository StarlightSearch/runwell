# Prints one line per stream-json event: tool uses, results, text, result line, permission events.
import json, sys
for i, l in enumerate(open(sys.argv[1]), 1):
    try: d = json.loads(l)
    except Exception: print(i, 'BAD', l[:80]); continue
    t = d.get('type'); st = d.get('subtype', ''); s = ''
    if t in ('assistant', 'user'):
        p = d.get('parent_tool_use_id')
        for c in d['message'].get('content', []):
            if isinstance(c, dict):
                if c.get('type') == 'tool_use': s += f" TOOL_USE[{c['id'][-6:]}] {c['name']} {json.dumps(c['input'])[:140]}"
                elif c.get('type') == 'tool_result': s += f" RESULT[{c['tool_use_id'][-6:]}] {str(c.get('content'))[:160]} err={c.get('is_error')}"
                elif c.get('type') == 'text': s += f" TEXT {c['text'][:110]}"
        if p: s = f" (parent {p[-6:]})" + s
    elif t == 'result': s = f" is_error={d.get('is_error')} {str(d.get('result'))[:140]} denials={json.dumps(d.get('permission_denials'))[:200]}"
    elif t == 'system' and st in ('thinking_tokens',): continue
    elif t == 'system': s = ' ' + json.dumps({k: v for k, v in d.items() if k not in ('tools', 'slash_commands', 'terminal_slash_commands', 'mcp_servers', 'session_id', 'uuid')})[:220]
    print(i, t, st, s)
