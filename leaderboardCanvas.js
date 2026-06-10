import { createCanvas, Image, registerFont } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { rankBadgeColor, rankBadgeColorGarden } from './ranking.js';

const projectDir = path.dirname(fileURLToPath(import.meta.url));

const FONT_STACK = [
  'Noto Sans',
  'Noto Sans CJK SC',
  'Noto Sans CJK JP',
  'Noto Sans CJK KR',
  'Noto Sans Arabic',
  'Noto Sans Devanagari',
  'Noto Sans Thai',
  'Noto Sans Symbols 2',
  'Noto Sans Math',
  'sans-serif',
];

const FONT_FILES = [
  { file: 'NotoSans-Regular.ttf', family: 'Noto Sans', weight: 'normal' },
  { file: 'NotoSans-Bold.ttf', family: 'Noto Sans', weight: 'bold' },
  { file: 'NotoSansCJKsc-Regular.otf', family: 'Noto Sans CJK SC', weight: 'normal' },
  { file: 'NotoSansCJKjp-Regular.otf', family: 'Noto Sans CJK JP', weight: 'normal' },
  { file: 'NotoSansCJKkr-Regular.otf', family: 'Noto Sans CJK KR', weight: 'normal' },
  { file: 'NotoSansArabic-Regular.ttf', family: 'Noto Sans Arabic', weight: 'normal' },
  { file: 'NotoSansDevanagari-Regular.ttf', family: 'Noto Sans Devanagari', weight: 'normal' },
  { file: 'NotoSansThai-Regular.ttf', family: 'Noto Sans Thai', weight: 'normal' },
  { file: 'NotoSansSymbols2-Regular.ttf', family: 'Noto Sans Symbols 2', weight: 'normal' },
  { file: 'NotoSansMath-Regular.ttf', family: 'Noto Sans Math', weight: 'normal' },
];

let fontsRegistered = false;
const twemojiCache = new Map();

const EMOJI_SEGMENT_RE = /\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

export function registerLeaderboardFonts() {
  if (fontsRegistered) return;

  const fontsDir = path.join(projectDir, 'assets', 'fonts');
  let registered = 0;

  for (const entry of FONT_FILES) {
    const fontPath = path.join(fontsDir, entry.file);
    if (!fs.existsSync(fontPath)) continue;
    registerFont(fontPath, { family: entry.family, weight: entry.weight, style: 'normal' });
    registered += 1;
  }

  if (registered === 0) {
    console.warn('Leaderboard fonts missing — run `npm install` or `node scripts/download-fonts.js`.');
  } else if (registered < FONT_FILES.length) {
    console.warn(`Leaderboard: ${registered}/${FONT_FILES.length} fonts loaded — run \`node scripts/download-fonts.js\`.`);
  }

  fontsRegistered = true;
}

export function font(size, weight = 'normal') {
  const primary = weight === 'bold' ? 'Noto Sans' : FONT_STACK[0];
  const stack = [primary, ...FONT_STACK.slice(1)].map((name) => `"${name}"`).join(', ');
  return `${weight} ${size}px ${stack}`;
}

function emojiToTwemojiCodepoint(segment) {
  const codepoints = [];
  for (const char of segment) {
    const cp = char.codePointAt(0);
    if (cp === 0xfe0f || cp === 0x200d) continue;
    codepoints.push(cp.toString(16));
  }
  return codepoints.join('-');
}

export async function loadTwemoji(codepoint) {
  const cached = twemojiCache.get(codepoint);
  if (cached) return cached;

  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoint}.png`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const image = new Image();
  image.src = Buffer.from(await res.arrayBuffer());
  twemojiCache.set(codepoint, image);
  return image;
}

function splitTextAndEmoji(text) {
  const segments = [];
  let lastIndex = 0;

  for (const match of text.matchAll(EMOJI_SEGMENT_RE)) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'emoji', value: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  if (segments.length === 0 && text) {
    segments.push({ type: 'text', value: text });
  }

  return segments;
}

async function measureSegmentWidth(ctx, segment, emojiSize) {
  if (segment.type === 'text') {
    return ctx.measureText(segment.value).width;
  }
  const codepoint = emojiToTwemojiCodepoint(segment.value);
  const image = await loadTwemoji(codepoint);
  return image ? emojiSize + 2 : ctx.measureText(segment.value).width;
}

async function measureRichTextWidth(ctx, text, emojiSize) {
  const segments = splitTextAndEmoji(text);
  let width = 0;
  for (const segment of segments) {
    width += await measureSegmentWidth(ctx, segment, emojiSize);
  }
  return width;
}

async function truncateRichText(ctx, text, maxWidth, emojiSize) {
  if (!maxWidth || (await measureRichTextWidth(ctx, text, emojiSize)) <= maxWidth) {
    return text;
  }

  const ellipsis = '…';
  let low = 0;
  let high = text.length;
  let best = ellipsis;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${text.slice(0, mid).trimEnd()}${ellipsis}`;
    const width = await measureRichTextWidth(ctx, candidate, emojiSize);
    if (width <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

/**
 * Draw Discord-style display names: multi-script Noto stack + Twemoji for emoji.
 */
export async function drawCanvasText(ctx, text, x, y, {
  fontSize = 18,
  weight = 'normal',
  fillStyle = '#ffffff',
  maxWidth = null,
  emojiSize = null,
} = {}) {
  const resolvedEmojiSize = emojiSize ?? Math.round(fontSize * 1.1);
  ctx.fillStyle = fillStyle;
  ctx.font = font(fontSize, weight);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const displayText = maxWidth
    ? await truncateRichText(ctx, text, maxWidth, resolvedEmojiSize)
    : text;

  const segments = splitTextAndEmoji(displayText);
  let cursorX = x;

  for (const segment of segments) {
    if (segment.type === 'text') {
      if (segment.value) {
        ctx.fillText(segment.value, cursorX, y);
        cursorX += ctx.measureText(segment.value).width;
      }
      continue;
    }

    const codepoint = emojiToTwemojiCodepoint(segment.value);
    const image = await loadTwemoji(codepoint);
    if (image) {
      const emojiY = y - resolvedEmojiSize + Math.round(fontSize * 0.15);
      ctx.drawImage(image, cursorX, emojiY, resolvedEmojiSize, resolvedEmojiSize);
      cursorX += resolvedEmojiSize + 2;
    } else {
      ctx.fillText(segment.value, cursorX, y);
      cursorX += ctx.measureText(segment.value).width;
    }
  }

  return cursorX - x;
}

export async function fetchUserData(userId, token) {
  try {
    const res = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error(`Failed to fetch user data for ${userId}:`, err);
    return null;
  }
}

export async function fetchGuildName(guildId, token) {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) return null;
    const guild = await res.json();
    return guild?.name || null;
  } catch (err) {
    console.error(`Failed to fetch guild data for ${guildId}:`, err);
    return null;
  }
}

export async function loadAvatarImage(user) {
  if (!user?.avatar) return null;
  try {
    const avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
    const res = await fetch(avatarUrl);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const image = new Image();
    image.src = Buffer.from(buffer);
    return image;
  } catch (err) {
    console.error(`Failed to load avatar for ${user.id}:`, err);
    return null;
  }
}

export function drawAvatar(ctx, avatar, x, y, radius = 27) {
  if (!avatar) return;
  const size = radius * 2;
  const dx = Math.round(x - size / 2);
  const dy = Math.round(y - size / 2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, dx, dy, size, size);
  ctx.restore();
}

export function drawRankBadge(ctx, rank, y, { garden = false } = {}) {
  const colorFn = garden ? rankBadgeColorGarden : rankBadgeColor;
  ctx.fillStyle = colorFn(rank);
  ctx.fillRect(20, y, 60, 60);
  ctx.fillStyle = garden && rank > 3 ? '#f5f0e1' : '#000000';
  ctx.font = font(32, 'bold');
  ctx.textAlign = 'center';
  ctx.fillText(`#${rank}`, 50, y + 42);
}

export function createLeaderboardCanvas(width, entryCount, padding = 20) {
  const entryHeight = 80;
  const headerHeight = 130;
  const height = headerHeight + entryCount * entryHeight + padding;
  const canvas = createCanvas(width, height);
  return { canvas, ctx: canvas.getContext('2d'), entryHeight, headerHeight, height, width };
}

export function drawRowDivider(ctx, y, width) {
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, y + 65);
  ctx.lineTo(width - 20, y + 65);
  ctx.stroke();
}
