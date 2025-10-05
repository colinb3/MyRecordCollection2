// wiki.ts
// Client-side helper to query Wikipedia and extract album genres (converted from original C++ logic).
// Usage:
// import { wikiGenres } from './wiki';
// const genres = await wikiGenres('Folklore', 'Taylor Swift', true);
// If `release` is true, the first returned tag will be the inferred release year (string).

export async function wikiGenres(name: string, artist: string, release = false): Promise<string[]> {
  const tags: string[] = [];
  try {
    const searchQuery = `${artist} ${name} album`;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&utf8=&format=json&srsearch=${encodeURIComponent(
      searchQuery
    )}&origin=*`;

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return tags;
    const jsonSearch = await searchRes.json();
    const query = jsonSearch?.query;
    const totalhits = query?.searchinfo?.totalhits || 0;
    if (totalhits <= 0) return tags;

    const pageid = query.search[0].pageid;
    const pageUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&format=json&rvsection=0&pageids=${pageid}&origin=*`;
    const pageRes = await fetch(pageUrl);
    if (!pageRes.ok) return tags;
    const jsonWikiPage = await pageRes.json();

    const pageObj = jsonWikiPage?.query?.pages?.[pageid];
    if (!pageObj) return tags;

    const title: string = pageObj.title || "";
    // optional check: title should contain album name
    if (title && name && !title.toLowerCase().includes(name.toLowerCase())) {
      // Title might be the artist page. Still continue — sometimes album pages are named differently.
      // console.warn(`Wiki title mismatch: expected ${name} got ${title}`);
    }

    const content: string = pageObj.revisions?.[0]?.['*'] || '';
    if (!content) return tags;

    if (release) {
      const year = wikiRelease(content);
      if (year) tags.push(String(year));
    }

    // Find the genre section similar to C++ logic
    let position = indexOfIgnoreCase(content, '| genre');
    if (position < 0) return tags;

    // determine end of genre section: first newline followed by '| ' after position
    let nextSec = indexOfIgnoreCase(content, '\n| ', position);
    if (nextSec === -1) {
      // fallback: search for next '\n\n' or end of content
      const nextSection = content.indexOf('\n\n', position);
      nextSec = nextSection === -1 ? content.length : nextSection;
    }
    // Handle comments that sometimes appear right after | genre
    const arrowStart = indexOfIgnoreCase(content, '<!--', position);
    const arrowEnd = indexOfIgnoreCase(content, '-->', position);
    if (arrowStart > 0 && arrowStart < position + 30 && arrowEnd > arrowStart) {
      position = arrowEnd + 3;
    }
    let source = 0;
    let sourceSpace = 0;

    // Move to first [[ after position
    position = content.indexOf('[[', position);
    if (position === -1) return tags;
    position += 2; // move inside the first [[

    if (nextSec > 0 && nextSec < position) return tags; // no genres

    // iterate over [[...]] links until genreSectionEnd
    while (position < nextSec && position !== -1) {
      const genreEndPos = content.indexOf(']]', position);
      if (genreEndPos === -1 || genreEndPos > nextSec) break;
      const midLineIdx = content.indexOf('|', position);

      if ((source < position && source > 0) || (sourceSpace < position && sourceSpace > 0)) {
        source = content.indexOf('=[[', position);
        sourceSpace = content.indexOf('= [[', position);
        position = content.indexOf('[[', position);
        if (position !== -1) position += 2;
        continue;
      }

      let genreText = '';
      if (midLineIdx !== -1 && midLineIdx < genreEndPos) {
        // form: [[Pop music|Pop]] -> take text after |
        genreText = content.substring(midLineIdx + 1, genreEndPos).toLowerCase();
      } else {
        // form: [[Pop]]
        genreText = content.substring(position, genreEndPos).toLowerCase();
      }

      // Remove HTML refs that may follow - if immediate characters after ]] start with <ref
      const after = content.substring(genreEndPos + 2, genreEndPos + 6).toLowerCase();
      if (after.startsWith('<ref')) {
        // advance position to end of reference if possible
        const refEnd = content.indexOf('/', genreEndPos + 2);
        position = refEnd === -1 ? genreEndPos + 2 : refEnd + 6;
      }
      
      source = content.indexOf('=[[', position);
      sourceSpace = content.indexOf('= [[', position);
      position = content.indexOf('[[', position);
      if (position !== -1) position += 2;

      // skip if looks like a reference link or malformed
      if (genreText.includes('{') || genreText.includes('}') || genreText.includes('|') || genreText.includes('[') || genreText.includes(']')) {
        continue;
      }

      // Skip things that look like source links indicator '=[' etc (C++ checked for '=[[')
      // If genreText contains '&nbsp;' replace
      genreText = genreText.replace(/&nbsp;/g, ' ').trim();
      if (!genreText) continue;

      // normalize capitalization: Title Case
      const normalized = genreText
        .split(/\s+/)
        .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
        .join(' ');

      tags.push(normalized);
    }

    return tags;
  } catch (err) {
    // console.error('wikiGenres error', err);
    return tags;
  }
}

function indexOfIgnoreCase(haystack: string, needle: string, fromIndex = 0): number {
  return haystack.toLowerCase().indexOf(needle.toLowerCase(), fromIndex);
}

function wikiRelease(content: string): number | null {
  // Try patterns like '| released = MONTH DAY, YEAR' or '| released = YEAR' or 'released = {{start date|YEAR|...}}'
  const releasedRegex = /\|\s*released\s*=\s*([^\n\r]+)/i;
  const m = content.match(releasedRegex);
  if (m && m[1]) {
    const snippet = m[1];
    // try to find a 4-digit year
    const yearMatch = snippet.match(/(19\d{2}|20\d{2}|2100)/);
    if (yearMatch) return parseInt(yearMatch[0], 10);
  }
  // fallback: first 4-digit number in page between reasonable years
  const anyYear = content.match(/(18\d{2}|19\d{2}|20\d{2}|2100)/);
  if (anyYear) return parseInt(anyYear[0], 10);
  return null;
}
