'use strict';

const cleanText = (value) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const sitePath = (value) => `/${String(value || '').replace(/^\/+/, '')}`;

hexo.extend.generator.register('sujing-site-data', (locals) => {
  const posts = locals.posts.toArray()
    .sort((a, b) => b.date.valueOf() - a.date.valueOf())
    .map((post) => ({
      title: post.title,
      path: sitePath(post.path),
      source: post.source,
      cover: post.cover || '',
      description: cleanText(post.description || post.excerpt).slice(0, 180),
      date: post.date.toISOString(),
      categories: post.categories.toArray().map((item) => item.name),
      tags: post.tags.toArray().map((item) => item.name)
    }));

  const categories = locals.categories.toArray()
    .filter((item) => item.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    .map((item) => ({ name: item.name, path: sitePath(item.path), count: item.length }));

  const tags = locals.tags.toArray()
    .filter((item) => item.length > 0)
    .sort((a, b) => b.length - a.length || a.name.localeCompare(b.name, 'zh-CN'))
    .map((item) => ({ name: item.name, path: sitePath(item.path), count: item.length }));

  const music = locals.data.music || { title: '溯境歌单', tracks: [] };
  const notes = (Array.isArray(locals.data.notes) ? locals.data.notes : [])
    .map((note) => ({
      ...note,
      date: note.date instanceof Date
        ? note.date.toISOString().slice(0, 10)
        : String(note.date || '').slice(0, 10)
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const gallery = locals.data.gallery || { title: '溯境相册', albums: [] };

  return {
    path: 'site-index.json',
    data: JSON.stringify({ posts, categories, tags, music, notes, gallery })
  };
});
