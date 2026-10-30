const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('offsite job refuses plaintext remotes and propagates upload failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-offsite-'));
  const bin = path.join(dir, 'bin'); const data = path.join(dir, 'data');
  fs.mkdirSync(bin); fs.mkdirSync(data); fs.mkdirSync(path.join(data, 'auto-backups'));
  const capture = path.join(dir, 'args.json');
  const rclone = path.join(bin, 'rclone');
  fs.writeFileSync(rclone, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] === 'config') { console.log('type = ' + (process.env.REMOTE_TYPE || 'crypt')); }
else if (process.argv[2] === 'copy') { fs.writeFileSync(process.env.CAPTURE, JSON.stringify(process.argv.slice(2))); process.exit(Number(process.env.COPY_EXIT || 0)); }
else process.exit(4);
`, { mode: 0o755 });
  const script = path.join(__dirname, '..', 'scripts', 'offsite-backup.sh');
  const run = (remote = 'encrypted', extra = {}) => spawnSync('bash', [script, data, remote], { encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, CAPTURE: capture, ...extra } });
  try {
    assert.notEqual(run().status, 0, 'an empty backup directory is an error');
    fs.writeFileSync(path.join(data, 'auto-backups', 'auto-test.json'), '{}');
    assert.notEqual(run('unencrypted', { REMOTE_TYPE: 'dropbox' }).status, 0);
    assert.equal(fs.existsSync(capture), false);
    assert.notEqual(run('../unsafe').status, 0);
    assert.equal(run('encrypted', { COPY_EXIT: '7' }).status, 7);
    assert.equal(run().status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(capture, 'utf8')), ['copy', path.join(data, 'auto-backups'), 'encrypted:', '--include', 'auto-*.json', '--exclude', '*', '--immutable']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
