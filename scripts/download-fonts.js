import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const fontsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');

const FONTS = [
  {
    file: 'NotoSans-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
  },
  {
    file: 'NotoSans-Bold.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf',
  },
  {
    file: 'NotoSansSymbols2-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansSymbols2/NotoSansSymbols2-Regular.ttf',
  },
  {
    file: 'NotoSansMath-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansMath/NotoSansMath-Regular.ttf',
  },
  {
    file: 'NotoSansArabic-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf',
  },
  {
    file: 'NotoSansHebrew-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansHebrew/NotoSansHebrew-Regular.ttf',
  },
  {
    file: 'NotoSansDevanagari-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf',
  },
  {
    file: 'NotoSansBengali-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansBengali/NotoSansBengali-Regular.ttf',
  },
  {
    file: 'NotoSansTamil-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTamil/NotoSansTamil-Regular.ttf',
  },
  {
    file: 'NotoSansGeorgian-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansGeorgian/NotoSansGeorgian-Regular.ttf',
  },
  {
    file: 'NotoSansThai-Regular.ttf',
    url: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf',
  },
  {
    file: 'NotoSansCJKsc-Regular.otf',
    url: 'https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  },
  {
    file: 'NotoSansCJKjp-Regular.otf',
    url: 'https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf',
  },
  {
    file: 'NotoSansCJKkr-Regular.otf',
    url: 'https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf',
  },
];

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  fs.mkdirSync(fontsDir, { recursive: true });

  let downloaded = 0;
  let skipped = 0;

  for (const font of FONTS) {
    const dest = path.join(fontsDir, font.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      skipped += 1;
      continue;
    }
    process.stdout.write(`Downloading ${font.file}… `);
    const data = await download(font.url);
    fs.writeFileSync(dest, data);
    downloaded += 1;
    console.log('done');
  }

  console.log(`Fonts ready (${downloaded} downloaded, ${skipped} already present).`);
}

main().catch((err) => {
  console.error('Font download failed:', err.message);
  console.error('Leaderboard images may show missing glyphs until fonts are installed.');
  process.exit(1);
});
