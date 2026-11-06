'use strict';

const normalizeText = (value) => String(value ?? '').trim();
const normalizeKey = (value) => normalizeText(value).toLocaleLowerCase('zh-CN');
const normalizeSlug = (value) => normalizeText(value).toLocaleLowerCase('en-US');
const uniqueStrings = (value) => Array.isArray(value)
  ? [...new Set(value.map(normalizeText).filter(Boolean))]
  : [];

const normalizeMatch = (match) => ({
  tags: uniqueStrings(match?.tags),
  titleIncludes: uniqueStrings(match?.titleIncludes)
});

const normalizeModule = (module) => {
  const name = normalizeText(module?.name);
  const slug = normalizeSlug(module?.slug);
  if (!name || !slug) return null;
  return {
    name,
    slug,
    icon: normalizeText(module.icon) || 'fas fa-layer-group',
    description: normalizeText(module.description) || `${name}相关文章`,
    mark: normalizeText(module.mark) || '辑',
    match: normalizeMatch(module.match)
  };
};

const normalizeColumn = (column) => {
  const name = normalizeText(column?.name);
  const slug = normalizeSlug(column?.slug);
  if (!name || !slug) return null;

  const seen = new Set();
  const modules = (Array.isArray(column.modules) ? column.modules : [])
    .map(normalizeModule)
    .filter(Boolean)
    .filter((module) => {
      if (seen.has(module.slug)) return false;
      seen.add(module.slug);
      return true;
    });

  return {
    name,
    slug,
    icon: normalizeText(column.icon) || 'fas fa-layer-group',
    description: normalizeText(column.description) || `${name}相关文章`,
    modules
  };
};

const postTags = (post) => Array.isArray(post?.tags) ? post.tags : [];
const postCategories = (post) => Array.isArray(post?.categories) ? post.categories : [];

const matchesColumn = (post, column) => {
  const values = [...postCategories(post), ...postTags(post)].map(normalizeKey);
  return values.includes(normalizeKey(column.name));
};

const matchesModule = (post, module) => {
  const tags = new Set(postTags(post).map(normalizeKey));
  const title = normalizeKey(post?.title);
  const rule = module.match || {};
  const tagged = rule.tags.some((tag) => tags.has(normalizeKey(tag)));
  const titled = rule.titleIncludes.some((part) => title.includes(normalizeKey(part)));
  return tagged || titled;
};

const columnPath = (column) => `/columns/${column.slug}/`;
const modulePath = (column, module) => `${columnPath(column)}${module.slug}/`;
const moduleKey = (column, module) => `${column.slug}/${module.slug}`;

module.exports = {
  normalizeText,
  normalizeSlug,
  normalizeColumn,
  normalizeModule,
  matchesColumn,
  matchesModule,
  columnPath,
  modulePath,
  moduleKey
};
