// Resolving the files the SVG export has to inline. These are separated from the export itself so
// they can be tested without a browser: the export is a click handler that needs fetch, Blob and a
// serializer, but the part that has actually broken is the naming.
//
// It broke when the static build began writing content-hashed filenames — `style.<hash>.css` — while
// the export still fetched `style.css` by name, so exporting 404'd in production and nothing caught
// it. The export now asks the document which stylesheets it really loaded.

// The href among `hrefs` whose filename begins with `name`, or the plain name when the page carries
// no such link (the Node dev server serves unhashed files).
export function stylesheetHref(hrefs, name) {
  return hrefs.filter(Boolean).find(href => href.split('/').pop().startsWith(`${name}.`)) || `${name}.css`;
}

// Every `url('...')` in a stylesheet, in source order. The export replaces each with a base64 data
// URI so the exported SVG carries its own fonts; a face this misses would silently lose its type.
export function fontUrls(css) {
  return [...String(css).matchAll(/url\('([^']+)'\)/g)].map(match => ({match: match[0], url: match[1]}));
}
