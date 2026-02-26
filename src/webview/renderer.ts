import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import hljs from 'highlight.js';

// --- Preprocessing ---
// IMPORTANT: Do NOT modify content inside $...$ delimiters!
// markdown-it-texmath parses LaTeX BEFORE markdown, so $\frac{p}{q}$
// must remain intact. The old React app used react-latex (post-markdown)
// which required escaping — that approach does NOT apply here.

const HTML_BLOCK_OPEN = /^<(div|section|details|figure|aside|article)\b[^>]*>/i;
const HTML_BLOCK_CLOSE = /^<\/(div|section|details|figure|aside|article)>/i;

function preprocessForNewlines(content: string): string {
  // Insert &&BREAK&& markers at blank-line boundaries, but NOT inside
  // HTML block elements (to match source block parsing 1:1).
  // Blank lines must be preserved for markdown-it to parse correctly.
  const lines = content.split('\n');
  const result: string[] = [];
  let htmlDepth = 0;
  let prevWasBlank = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const isBlank = trimmed === '';

    const isOpen = HTML_BLOCK_OPEN.test(trimmed);
    const isClose = HTML_BLOCK_CLOSE.test(trimmed);
    const isSelf = isOpen && isClose;

    if (isOpen && !isSelf) htmlDepth++;
    if (isClose && !isSelf) htmlDepth = Math.max(0, htmlDepth - 1);

    if (isBlank) {
      if (!prevWasBlank && htmlDepth === 0) {
        // First blank line in a sequence, outside HTML → insert marker
        result.push('');
        result.push('&&BREAK&&');
        result.push('');
      } else {
        // Inside HTML block or consecutive blank → keep as-is
        result.push('');
      }
      prevWasBlank = true;
    } else {
      prevWasBlank = false;
      // Trailing backslash → small break
      if (/\\\s*$/.test(lines[i])) {
        result.push(lines[i].replace(/\\\s*$/, ''));
        result.push('');
        result.push('&&break&&');
        result.push('');
      } else {
        result.push(lines[i]);
      }
    }
  }

  return result.join('\n');
}

// --- Color directive parsing ---
// Handles :red[text], :blue[text], :purple[text] syntax

function processColorDirectives(content: string): string {
  const colors: Record<string, string> = {
    red: 'red',
    blue: '#44cadb',
    purple: '#db529d',
  };

  for (const [name, color] of Object.entries(colors)) {
    const regex = new RegExp(`:${name}\\[([^\\]]*?)\\]`, 'g');
    content = content.replace(
      regex,
      `<span style="color: ${color}">$1</span>`
    );
  }

  return content;
}

// --- Break markers → HTML ---

function processBreakMarkers(html: string): string {
  html = html.replace(
    /<p>&&BREAK&&<\/p>/g,
    '<div class="line-breaks"></div>'
  );
  html = html.replace(
    /<p>&amp;&amp;BREAK&amp;&amp;<\/p>/g,
    '<div class="line-breaks"></div>'
  );
  html = html.replace(
    /&&BREAK&&/g,
    '<div class="line-breaks"></div>'
  );

  html = html.replace(
    /<p>&&break&&<\/p>/g,
    '<div class="line-breaks line-breaks--small"></div>'
  );
  html = html.replace(
    /<p>&amp;&amp;break&amp;&amp;<\/p>/g,
    '<div class="line-breaks line-breaks--small"></div>'
  );
  html = html.replace(
    /&&break&&/g,
    '<div class="line-breaks line-breaks--small"></div>'
  );

  return html;
}

// --- Fallback LaTeX rendering ---
// For $...$ that texmath missed (e.g. inside HTML blocks, tables, spans)

function renderRemainingLatex(html: string): string {
  // Display math first ($$...$$)
  html = html.replace(/\$\$([^$]+?)\$\$/g, (_match, latex) => {
    try {
      const cleaned = decodeHtmlEntities(latex);
      return katex.renderToString(cleaned, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      return _match;
    }
  });

  // Inline math ($...$) — but skip already-rendered KaTeX spans
  html = html.replace(/\$([^$]+?)\$/g, (_match, latex) => {
    // Don't re-process KaTeX output
    if (latex.includes('katex') || latex.includes('class="')) return _match;
    try {
      const cleaned = decodeHtmlEntities(latex);
      return katex.renderToString(cleaned, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return _match;
    }
  });

  return html;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// --- Markdown-it setup ---

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight: function (str: string, lang: string) {
    const langLabel = lang || '';
    let highlighted: string;
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(str, { language: lang }).value;
      } catch {
        highlighted = md.utils.escapeHtml(str);
      }
    } else {
      highlighted = md.utils.escapeHtml(str);
    }

    return (
      `<div class="block__code">` +
      `<div class="block__code__button-wrapper">` +
      `<div class="block__code__programming-language">${langLabel}</div>` +
      `</div>` +
      `<pre><code class="hljs">${highlighted}</code></pre>` +
      `</div>`
    );
  },
});

md.enable(['table', 'strikethrough']);

// KaTeX math support via texmath — processes $...$ BEFORE markdown
md.use(texmath, {
  engine: katex,
  delimiters: 'dollars',
  katexOptions: { throwOnError: false },
});

// --- Main render function ---

export function renderMarkdown(content: string): string {
  if (!content || !content.trim()) {
    return '<p class="markdown-preview__empty">Otwórz plik .md aby zobaczyć podgląd</p>';
  }

  // 1. Break markers (double newlines → spacing divs)
  let processed = preprocessForNewlines(content);

  // 2. Color directives (:red[text] etc.)
  processed = processColorDirectives(processed);

  // 3. Render markdown (texmath handles $...$ LaTeX natively)
  let html = md.render(processed);

  // 4. Convert break markers to HTML
  html = processBreakMarkers(html);

  // 5. Fallback: render any $...$ that texmath missed (e.g. inside raw HTML)
  html = renderRemainingLatex(html);

  return html;
}
