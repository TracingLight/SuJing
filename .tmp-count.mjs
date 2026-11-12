import fs from 'fs';

const file = 'public/2026/11/12/学习笔记-c-移动语义-右值引用/index.html';
const h = fs.readFileSync(file, 'utf8');

const probe = (label, re) => {
  const m = h.match(re);
  console.log(label, '->', m ? JSON.stringify(m[0].slice(0, 200)) : 'NOT FOUND');
};

probe('prose static_cast', /<p>通过 static[^<]*<\/p>/);
probe('prose remove_reference question', /<p>为什么需要 remove[^<]*<\/p>/);
probe('code line constexpr', /constexpr<\/span> <span class="type">remove[^<]*/);
probe('code line static_cast', /<span class="built_in">static[^<]*/);

console.log('escaped underscore count:', h.split('\\_').length - 1);
console.log('em tags:', (h.match(/<em>/g) || []).length);
console.log('strong tags:', (h.match(/<strong>/g) || []).length);
console.log('annotation pills:', (h.match(/class="sujing-annotation"/g) || []).length);
console.log('mark highlights:', (h.match(/class="sujing-key"/g) || []).length);
