'use strict';

const SITE_SINCE = '2026-07-21';

const cleanText = (value) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const sitePath = (value) => `/${String(value || '').replace(/^\/+/, '')}`;

const countWords = (content) => {
  const text = String(content || '').replace(/<[^>]*>/g, ' ');
  const cn = (text.match(/[\u4E00-\u9FA5]/g) || []).length;
  const en = (text.replace(/[\u4E00-\u9FA5]/g, '').match(/[a-zA-Z0-9_]+/g) || []).length;
  return cn + en;
};

hexo.extend.generator.register('sujing-site-data', (locals) => {
  const rawPosts = locals.posts.toArray().sort((a, b) => b.date.valueOf() - a.date.valueOf());
  const posts = rawPosts.map((post) => ({
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
  const albums = Array.isArray(gallery.albums) ? gallery.albums : [];
  const words = rawPosts.reduce((sum, post) => sum + countWords(post.content), 0);
  const sinceCandidates = [
    SITE_SINCE,
    ...rawPosts.map((post) => post.date.format('YYYY-MM-DD'))
  ].filter(Boolean);
  const since = sinceCandidates.sort()[0] || SITE_SINCE;

  const stats = {
    posts: posts.length,
    categories: categories.length,
    tags: tags.length,
    notes: notes.length,
    tracks: Array.isArray(music.tracks) ? music.tracks.length : 0,
    albums: albums.length,
    words,
    since
  };

  return {
    path: 'site-index.json',
    data: JSON.stringify({ posts, categories, tags, music, notes, gallery, stats })
  };
});
