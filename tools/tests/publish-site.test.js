'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { publishSite } = require('../publish-site');

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sujing-publish-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const cwd = path.join(base, 'site');
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(cwd);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--bare', remote);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Publish test');
  git('config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules/\n.sujing-admin-token\nassets/_archive/\nassets/user/duplicates/\n');
  fs.writeFileSync(path.join(cwd, 'old.md'), 'old');
  git('add', '.');
  git('commit', '-m', 'initial');
  git('remote', 'add', 'origin', remote);
  git('push', '-u', 'origin', 'main');
  const builds = [];
  const run = async (program, args) => {
    if (program.startsWith('npm')) { builds.push(args[1]); return ''; }
    return git(...args);
  };
  return { cwd, git, run, builds, options: { cwd, run, log: () => {} } };
}

test('publishes additions, edits and deletions; ignores secrets/archive; retry needs no new commit', async (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.cwd, 'old.md'));
  fs.mkdirSync(path.join(f.cwd, 'source/img'), { recursive: true });
  fs.mkdirSync(path.join(f.cwd, 'assets/_archive'), { recursive: true });
  fs.writeFileSync(path.join(f.cwd, 'source/post.md'), 'new post');
  fs.writeFileSync(path.join(f.cwd, 'source/img/cover.png'), 'image');
  fs.writeFileSync(path.join(f.cwd, '.sujing-admin-token'), 'private');
  fs.writeFileSync(path.join(f.cwd, 'assets/_archive/private.png'), 'private');
  const result = await publishSite(f.options);
  assert.equal(result.pushed, true);
  assert.deepEqual(f.builds, ['check', 'prune', 'check:performance-build']);
  assert.equal(f.git('rev-parse', 'origin/main'), result.commit);
  const files = f.git('ls-tree', '-r', '--name-only', 'origin/main');
  assert.match(files, /source\/post.md/);
  assert.match(files, /source\/img\/cover.png/);
  assert.doesNotMatch(files, /old.md|private|token|archive/);
  assert.equal((await publishSite(f.options)).commit, result.commit);
});

test('wrong branch stops before build or commit', async (t) => {
  const f = fixture(t);
  f.git('checkout', '-b', 'draft');
  await assert.rejects(publishSite(f.options), /main/);
  assert.deepEqual(f.builds, []);
});

test('remote ahead stops without merging or overwriting local work', async (t) => {
  const f = fixture(t);
  const initial = f.git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.cwd, 'remote.md'), 'remote');
  f.git('add', '.'); f.git('commit', '-m', 'remote update'); f.git('push');
  f.git('reset', '--hard', initial);
  fs.writeFileSync(path.join(f.cwd, 'local.md'), 'local');
  await assert.rejects(publishSite(f.options), /尚未合并/);
  assert.equal(f.git('rev-parse', 'HEAD'), initial);
  assert.equal(fs.readFileSync(path.join(f.cwd, 'local.md'), 'utf8'), 'local');
  assert.deepEqual(f.builds, []);
});

test('failed build never stages, commits or pushes', async (t) => {
  const f = fixture(t);
  const initial = f.git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.cwd, 'draft.md'), 'draft');
  const run = async (program, args) => {
    if (program.startsWith('npm')) throw new Error('build failed');
    return f.run(program, args);
  };
  await assert.rejects(publishSite({ ...f.options, run }), /build failed/);
  assert.equal(f.git('rev-parse', 'HEAD'), initial);
  assert.equal(f.git('diff', '--cached', '--name-only'), '');
});

test('push failure preserves local commit and retry pushes it', async (t) => {
  const f = fixture(t);
  const initial = f.git('rev-parse', 'origin/main');
  fs.writeFileSync(path.join(f.cwd, 'draft.md'), 'draft');
  const run = async (program, args) => {
    if (program === 'git' && args[0] === 'push') throw new Error('push rejected');
    return f.run(program, args);
  };
  await assert.rejects(publishSite({ ...f.options, run }), /push rejected/);
  const saved = f.git('rev-parse', 'HEAD');
  assert.notEqual(saved, initial);
  assert.equal(f.git('rev-parse', 'origin/main'), initial);
  assert.equal((await publishSite(f.options)).commit, saved);
  assert.equal(f.git('rev-parse', 'origin/main'), saved);
});
