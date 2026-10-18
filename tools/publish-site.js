'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const runCommand = (command, args, { cwd, log }) => new Promise((resolve, reject) => {
  let output = '';
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0', GIT_TERMINAL_PROMPT: '0' },
    shell: process.platform === 'win32' && command === 'npm.cmd',
    windowsHide: true
  });
  child.stdout.on('data', (chunk) => { output += chunk; log(String(chunk)); });
  child.stderr.on('data', (chunk) => log(String(chunk)));
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve(output.trim());
    else reject(new Error(`${command} ${args.join(' ')} 失败（exit ${code}），请查看日志`));
  });
});

async function publishSite({ cwd = path.join(__dirname, '..'), log = console.log, run = runCommand } = {}) {
  const command = async (program, args) => {
    log(`[publish] ${program} ${args.join(' ')}\n`);
    return run(program, args, { cwd, log });
  };
  const git = (...args) => command('git', args);
  const branch = await git('branch', '--show-current');
  if (branch !== 'main') throw new Error('请切换到 main 分支后发布，当前分支不会被自动合并。');
  // Reject unfinished merges/rebases before staging or committing anything.
  const fs = require('node:fs');
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const file = await git('rev-parse', '--git-path', name);
    if (fs.existsSync(path.resolve(cwd, file))) throw new Error('Git 有尚未完成的合并或变基，请先处理后再发布。');
  }
  await git('fetch', 'origin', 'main');
  const behind = await git('rev-list', '--count', 'HEAD..origin/main');
  if (Number(behind) > 0) throw new Error('GitHub 上有本机尚未合并的提交，请先同步后发布；没有执行覆盖推送。');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  for (const script of ['check', 'prune', 'check:performance-build']) {
    await command(npm, ['run', script]);
  }
  await git('add', '-A', '--', '.');
  const changed = await git('diff', '--cached', '--name-only');
  if (changed) {
    const date = new Date().toISOString();
    await git('commit', '-m', `chore: publish site ${date}`);
  } else {
    log('[publish] 没有新的文件修改；仍会推送已有的本地提交。\n');
  }
  await git('push', 'origin', 'HEAD:refs/heads/main');
  const commit = await git('rev-parse', 'HEAD');
  log(`[publish] GitHub 已同步：${commit}。有新提交时 Cloudflare Pages 会自动构建；请在部署记录确认上线结果。\n`);
  return { commit, pushed: true };
}

module.exports = { publishSite };
if (require.main === module) {
  publishSite().catch((error) => { console.error(`[publish] ${error.message}`); process.exitCode = 1; });
}
