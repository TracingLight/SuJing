'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load } = require('cheerio');

// Exercise the browser's actual renderer without mounting the editor UI.
const source = fs.readFileSync(path.join(__dirname, '../../source/js/sujing-admin.js'), 'utf8');
const render = vm.runInNewContext(`(() => {
  ${source.slice(source.indexOf('  const escapeHtml ='), source.indexOf('  const TERM_CODE_TERMS ='))}
  return renderMarkdownBlocks;
})()`);

test('multi-line article references stay in one ordered list', () => {
  const article = fs.readFileSync(path.join(__dirname, '../../source/_posts/学习笔记-c-移动语义-右值引用.md'), 'utf8');
  const $ = load(render(article.slice(article.indexOf('## 参考资料'))));
  assert.equal($('ol').length, 1);
  assert.equal($('ol > li').length, 4);
  for (const item of $('ol > li').toArray()) {
    assert.match($(item).text(), /Bilibili/);
    assert.equal($(item).find('a').length, 1);
  }
});

test('ordered list preserves its starting number and counts repeated markers', () => {
  const $ = load(render('3. third\n3. fourth'));
  assert.equal($('ol').attr('start'), '3');
  assert.equal($('ol > li').length, 2);
  assert.equal($('li[value]').length, 0);
});

test('blank lines between items keep numbering; following paragraph stays outside', () => {
  const $ = load(render('1. first\n   details\n\n2. second\n   more\n\nOutside'));
  assert.equal($('ol').length, 1);
  assert.equal($('ol > li').length, 2);
  assert.equal($('body > p').text(), 'Outside');
});

test('nested lists and separate list types retain their structure', () => {
  const $ = load(render('1. first\n   1. child\n   2. child two\n2. second\n\n- bullet'));
  assert.equal($('body > ol > li').length, 2);
  assert.equal($('ol ol > li').length, 2);
  assert.equal($('body > ul > li').length, 1);
});
