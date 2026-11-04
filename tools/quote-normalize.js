'use strict';

const PROTECTED = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|<[^>\n]*>/g;
const CODE_CONTEXT = /(?:#include|#import|extern|printf|sprintf|fprintf|console\.|require\s*\(|import\s|from\s|href\s*=|src\s*=|title\s*=|class\s*=|id\s*=)/i;

const isCodeLike = (value, prefix) => {
  const text = String(value || '').trim();
  if (!text) return true;
  if (CODE_CONTEXT.test(prefix || '')) return true;
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z0-9]+)?$/.test(text)) return true;
  if (/^[\w./\-]+\.(?:[a-z0-9]{1,8})$/i.test(text)) return true;
  if (/^[\d\s.,:;+\-*/=<>(){}[\]]+$/.test(text)) return true;
  if (/https?:\/\//i.test(text) || /@[^ ]+\./.test(text)) return true;
  return false;
};

const shouldConvert = (value, prefix, line) => {
  const text = String(value || '').trim();
  if (!text) return false;
  if (isCodeLike(text, prefix)) return false;
  if (/[\u3400-\u9fff]/.test(text)) return true;
  if (/\s/.test(text) && /[A-Za-z]/.test(text)) {
    // English phrases inside Chinese prose are usually quoted Chinese-style;
    // a purely English sentence remains untouched.
    return /[\u3400-\u9fff]/.test(line);
  }
  return false;
};

const normalizeQuotes = (source) => {
  const text = String(source || '').replace(/\r\n?/g, '\n');
  const protectedParts = [];
  const working = text.replace(PROTECTED, (match) => {
    const token = `\u0000${protectedParts.length}\u0000`;
    protectedParts.push(match);
    return token;
  });

  const changes = [];
  const skipped = [];
  const withQuotes = working.replace(/"([^"\n]+)"/g, (match, content, offset, whole) => {
    const prefix = whole.slice(Math.max(0, offset - 32), offset);
    const lineNo = whole.slice(0, offset).split('\n').length;
    const lineText = whole.split('\n')[lineNo - 1] || '';
    if (!shouldConvert(content, prefix, lineText)) {
      skipped.push({ line: lineNo, text: match, reason: '代码/英文/非文本引号' });
      return match;
    }
    changes.push({ line: lineNo, from: match, to: `“${content}”` });
    return `“${content}”`;
  });

  const issues = [];
  const lines = withQuotes.split('\n');
  lines.forEach((line, index) => {
    if (!line.includes('"')) return;
    if (line.includes('“') || line.includes('”')) {
      issues.push({ line: index + 1, type: 'mixed', text: line.trim().slice(0, 160) });
    } else {
      const count = (line.match(/"/g) || []).length;
      if (count % 2 === 1) issues.push({ line: index + 1, type: 'unclosed', text: line.trim().slice(0, 160) });
    }
  });

  let restored = withQuotes.replace(/\u0000(\d+)\u0000/g, (_, index) => protectedParts[Number(index)] || '');
  return { text: restored, changes, skipped, issues };
};

module.exports = { normalizeQuotes, shouldConvert };
