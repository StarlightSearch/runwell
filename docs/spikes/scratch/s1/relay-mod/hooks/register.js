// Spike 1 route A: hold a permission decision by long-polling a local server.
// $.http.fetch time does not count against the hook's 10 s budget; each call is capped at 30 s.
export function register(on) {
  on('session.start', async ($, e, next) => {
    const runId = $.env.get('RUNWELL_RUN_ID')
    await $.http.fetch('http://127.0.0.1:47911/log', { method: 'POST', body: JSON.stringify({ kind: 'session.start', runId, cwd: $.session.cwd(), id: $.session.id() }) }).catch(() => {})
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    await $.http.fetch('http://127.0.0.1:47911/log', { method: 'POST', body: JSON.stringify({ kind: 'tool.call', tool: e.tool }) }).catch(() => {})
    return next(e)
  })
  on('tool.check', { tool: ['Write', 'Bash'] }, async ($, e, next) => {
    const decided = await next(e)
    if (decided.decision !== 'ask') return decided
    const started = Date.now()
    for (;;) {
      const r = await $.http.fetch('http://127.0.0.1:47911/decide?tool=' + e.tool, { method: 'GET' }).catch((err) => ({ ok: false, text: String(err) }))
      if (r.ok && r.text && r.text !== 'wait') {
        await $.http.fetch('http://127.0.0.1:47911/log', { method: 'POST', body: JSON.stringify({ kind: 'decided', tool: e.tool, answer: r.text, heldMs: Date.now() - started }) }).catch(() => {})
        return r.text === 'allow' ? { decision: 'allow' } : { decision: 'deny', reason: 'Refused by the spike relay.' }
      }
    }
  })
}
