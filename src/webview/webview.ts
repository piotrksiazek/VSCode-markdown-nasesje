import { renderMarkdown } from './renderer';
import './styles.scss';

const vscode = acquireVsCodeApi();

const previewEl = document.getElementById('preview')!;
let currentContent = '';
let resourceBaseUrl = '';
let wzorMap: Record<string, string> = {};

// --- Source block parsing ---

interface SourceBlock {
  startOffset: number;
  endOffset: number;
}

const HTML_BLOCK_TAGS_OPEN = /^<(div|section|details|figure|aside|article)\b[^>]*>/i;
const HTML_BLOCK_TAGS_CLOSE = /^<\/(div|section|details|figure|aside|article)>/i;

function parseSourceBlocks(content: string): SourceBlock[] {
  const blocks: SourceBlock[] = [];
  const lines = content.split('\n');
  let inBlock = false;
  let blockStartOffset = 0;
  let offset = 0;
  let htmlDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isBlank = trimmed === '';

    const isOpenTag = HTML_BLOCK_TAGS_OPEN.test(trimmed);
    const isCloseTag = HTML_BLOCK_TAGS_CLOSE.test(trimmed);
    const isSelfContained = isOpenTag && isCloseTag;

    if (isOpenTag && !isSelfContained) htmlDepth++;
    if (isCloseTag && !isSelfContained) htmlDepth = Math.max(0, htmlDepth - 1);

    if (!isBlank && !inBlock) {
      inBlock = true;
      blockStartOffset = offset;
    } else if (isBlank && inBlock && htmlDepth === 0) {
      blocks.push({ startOffset: blockStartOffset, endOffset: offset - 1 });
      inBlock = false;
    }

    offset += line.length + 1;
  }

  if (inBlock) {
    blocks.push({ startOffset: blockStartOffset, endOffset: content.length });
  }

  return blocks;
}

// --- Preview block grouping ---

interface PreviewGroup {
  elements: HTMLElement[];
}

function groupPreviewBlocks(preview: HTMLElement): PreviewGroup[] {
  const groups: PreviewGroup[] = [];
  let current: HTMLElement[] = [];

  for (let i = 0; i < preview.children.length; i++) {
    const child = preview.children[i] as HTMLElement;

    if (child.classList?.contains('line-breaks')) {
      if (current.length > 0) {
        groups.push({ elements: current });
        current = [];
      }
    } else {
      current.push(child);
    }
  }

  if (current.length > 0) {
    groups.push({ elements: current });
  }

  return groups;
}

// --- Matching (same as content-generator) ---

function findPreviewGroupIndex(groups: PreviewGroup[], target: HTMLElement): number {
  for (let i = 0; i < groups.length; i++) {
    for (const el of groups[i].elements) {
      if (el === target || el.contains(target)) {
        return i;
      }
    }
  }
  return -1;
}

// --- Editor → Preview highlight ---

function highlightPreview(start: number, end: number) {
  previewEl.querySelectorAll('.source-line-highlighted').forEach((el) => {
    el.classList.remove('source-line-highlighted');
  });

  if (start === end) return;

  const sourceBlocks = parseSourceBlocks(currentContent);
  const matchedIndices: number[] = [];
  for (let i = 0; i < sourceBlocks.length; i++) {
    const b = sourceBlocks[i];
    if (start < b.endOffset && end > b.startOffset) {
      matchedIndices.push(i);
    }
  }
  if (matchedIndices.length === 0) return;

  const groups = groupPreviewBlocks(previewEl);
  for (const idx of matchedIndices) {
    if (idx < groups.length) {
      for (const el of groups[idx].elements) {
        el.classList.add('source-line-highlighted');
      }
    }
  }
}

// --- Preview → Editor: click selects source block ---

previewEl.addEventListener('mouseup', (e) => {
  const target = e.target as HTMLElement;
  if (!target || target === previewEl) return;

  const groups = groupPreviewBlocks(previewEl);
  const clickedIndex = findPreviewGroupIndex(groups, target);
  if (clickedIndex < 0) return;

  const sourceBlocks = parseSourceBlocks(currentContent);
  if (clickedIndex < sourceBlocks.length) {
    const block = sourceBlocks[clickedIndex];
    vscode.postMessage({
      type: 'selectSource',
      start: block.startOffset,
      end: block.endOffset,
    });
  }
});

// --- Listen for messages from extension ---

window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'update':
      currentContent = message.content;
      if (message.resourceBaseUrl) {
        resourceBaseUrl = message.resourceBaseUrl;
      }
      previewEl.innerHTML = renderMarkdown(message.content);
      resolveImageSources(previewEl, resourceBaseUrl);
      setupWzorHovers();
      break;

    case 'selection':
      highlightPreview(message.start, message.end);
      break;

    case 'wzorMap':
      wzorMap = message.map;
      setupWzorHovers();
      break;
  }
});

// --- Resolve image sources to webview URIs ---

function resolveImageSources(container: HTMLElement, baseUrl: string) {
  if (!baseUrl) return;
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

  container.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    // Skip already-resolved URLs
    if (/^(https?|data|blob|vscode-):/.test(src)) return;

    try {
      if (src.startsWith('/')) {
        // Absolute file path — use origin from base URL
        const origin = new URL(base).origin;
        img.src = origin + src;
      } else {
        // Relative path — resolve against document directory
        img.src = new URL(src, base).toString();
      }
    } catch {
      // Invalid URL, leave as-is
    }
  });
}

// --- Wzor hover tooltips ---

function setupWzorHovers() {
  if (!Object.keys(wzorMap).length) return;

  previewEl.querySelectorAll<HTMLElement>('.wzor-lekcja[data-wzor]').forEach((node) => {
    const el = node as WzorElement;
    // Avoid attaching listeners twice
    if (el.dataset.wzorHover) return;
    el.dataset.wzorHover = '1';

    el.addEventListener('mouseenter', () => {
      const id = el.dataset.wzor;
      if (!id || !wzorMap[id]) return;

      const tooltip = document.createElement('div');
      tooltip.className = 'wzor-tooltip';
      const img = document.createElement('img');
      img.src = wzorMap[id];
      tooltip.appendChild(img);
      document.body.appendChild(tooltip);

      const rect = el.getBoundingClientRect();
      tooltip.style.left = `${rect.left}px`;
      tooltip.style.top = `${rect.bottom + 6}px`;

      el._wzorTooltip = tooltip;
    });

    el.addEventListener('mouseleave', () => {
      if (el._wzorTooltip) {
        el._wzorTooltip.remove();
        el._wzorTooltip = undefined;
      }
    });
  });
}

declare function acquireVsCodeApi(): { postMessage(msg: any): void };

interface WzorElement extends HTMLElement {
  _wzorTooltip?: HTMLElement;
}
