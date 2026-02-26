import { renderMarkdown } from './renderer';
import './styles.scss';

const vscode = acquireVsCodeApi();

const previewEl = document.getElementById('preview')!;
let currentContent = '';

// Selection sync state
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
    } else if (child.textContent?.trim()) {
      current.push(child);
    }
  }

  if (current.length > 0) {
    groups.push({ elements: current });
  }

  return groups;
}

function highlightPreview(start: number, end: number) {
  // Clear old highlights
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

// Listen for messages from extension
window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'update':
      currentContent = message.content;
      previewEl.innerHTML = renderMarkdown(message.content);
      break;

    case 'selection':
      highlightPreview(message.start, message.end);
      break;
  }
});

declare function acquireVsCodeApi(): { postMessage(msg: any): void };
