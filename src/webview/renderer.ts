import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import hljs from 'highlight.js';

// --- Preprocessing ---
// IMPORTANT: Do NOT modify content inside $...$ delimiters!
// markdown-it-texmath parses LaTeX BEFORE markdown, so $\frac{p}{q}$
// must remain intact. The old React app used react-latex (post-markdown)
// which required escaping — that approach does NOT apply here.

function preprocessForNewlines(content: string): string {
  const bigBreak = '\n&&BREAK&&\n';
  const smallBreak = '\n&&break&&\n';

  let result = content.replace(/\n\s*\n/g, `\n${bigBreak}\n`);
  result = result.replace(/\\\s*$/gm, `\n${smallBreak}\n`);
  return result;
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
