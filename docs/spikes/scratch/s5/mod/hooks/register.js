// Spike 5: try starting the stub from a mod two ways, and record what the mod can see.
export function register(on) {
  on('session.start', async ($, e, next) => {
    const out = await $.env.get('SPIKE_OUT')
    let root; try { root = new URL('..', import.meta.url).pathname.replace(/\/$/, '') } catch (err) { root = 'ERR ' + String(err) }
    const t0 = Date.now()
    const info = { root, cwd: await $.session.cwd(), id: await $.session.id() }
    // 1. $.process.spawn, not awaited to completion
    try {
      const p = $.process.spawn(['node', root + '/../stub.mjs', out, 'mod-spawn'])
      info.spawnKeys = Object.keys(p || {})
      info.spawnType = typeof p
    } catch (err) { info.spawnError = String(err) }
    // 2. $.process.run of a launcher that detaches and exits
    try {
      const r = await $.process.run(['node', root + '/../launcher.mjs', out, 'mod-run-launcher'])
      info.runExit = r.exitCode
    } catch (err) { info.runError = String(err) }
    info.ms = Date.now() - t0
    try { await $.command.register({ name: 'runwell-spike', description: 'Spike 5 test command', argumentHint: '[sub]', immediate: true }) } catch (err) { info.cmdError = String(err) }
    await $.fs.write(out + '/mod-info.json', JSON.stringify(info))
    return next(e)
  })
  on('command.run', { command: 'runwell-spike' }, async ($, e) => ({ text: 'spike reply: ' + (e.args || 'none'), isTextDisplayOnly: true }))
}
