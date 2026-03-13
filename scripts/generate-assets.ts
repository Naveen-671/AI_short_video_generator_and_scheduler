/**
 * Generate placeholder character sprites and animated background videos
 * using ffmpeg — no external downloads needed.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ASSETS_DIR = path.resolve('assets');
const CHARS_DIR = path.join(ASSETS_DIR, 'characters');
const BG_DIR = path.join(ASSETS_DIR, 'backgrounds');

function mkdirp(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Generate a character avatar PNG using ffmpeg drawtext on a colored circle-like shape.
 * Creates a 512x512 PNG with colored background, large initial letter, and character name.
 */
function generateCharacterSprite(
  id: string,
  name: string,
  bgColor: string,
  textColor: string,
  accentColor: string,
) {
  mkdirp(CHARS_DIR);
  const outPath = path.join(CHARS_DIR, `${id}.png`);

  const initial = name[0]!.toUpperCase();

  // Build a character card: colored rounded rectangle with initial and name
  const filter = [
    // Base: colored rectangle
    `color=c=${bgColor}:s=512x600:d=1`,
    // Draw the avatar circle background
    `drawbox=x=131:y=30:w=250:h=250:color=${accentColor}:t=fill`,
    // Draw a highlight ring
    `drawbox=x=126:y=25:w=260:h=260:color=${textColor}@0.3:t=4`,
    // Draw the character initial (large)
    `drawtext=text=${initial}:fontsize=160:fontcolor=${textColor}:x=(w-tw)/2:y=60:font=Arial`,
    // Draw the character name below
    `drawtext=text=${name.toUpperCase()}:fontsize=36:fontcolor=${textColor}:x=(w-tw)/2:y=320:font=Arial`,
    // Draw decorative line
    `drawbox=x=156:y=380:w=200:h=4:color=${accentColor}:t=fill`,
    // Draw role subtitle
    `drawtext=text=AI EXPLAINS:fontsize=24:fontcolor=${textColor}@0.7:x=(w-tw)/2:y=410:font=Arial`,
  ].join(',');

  try {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', filter,
      '-frames:v', '1',
      outPath,
    ], { stdio: 'pipe' });
    console.log(`  ✓ ${outPath}`);
  } catch (err) {
    console.error(`  ✗ Failed to generate ${id}:`, (err as Error).message?.slice(0, 100));
  }
}

/**
 * Generate an animated gradient background video (10s loop) using ffmpeg.
 * Uses mandelbrot/gradient-based patterns for visual interest.
 */
function generateBackground(name: string, color1: string, color2: string, style: 'gradient' | 'particles' | 'tech') {
  mkdirp(BG_DIR);
  const outPath = path.join(BG_DIR, `${name}.mp4`);
  const duration = 10; // 10 second loop

  let filterInput: string;

  if (style === 'gradient') {
    // Animated gradient with slow color shift
    filterInput = [
      `color=c=${color1}:s=1080x1920:d=${duration}:r=30`,
      // Overlay a semi-transparent gradient band that moves
      `drawbox=x=0:y=mod(t*80\\,ih):w=iw:h=400:color=${color2}@0.15:t=fill`,
      `drawbox=x=0:y=mod(t*80+600\\,ih):w=iw:h=200:color=${color2}@0.10:t=fill`,
      `drawbox=x=0:y=mod(t*80+1200\\,ih):w=iw:h=300:color=${color2}@0.08:t=fill`,
      // Add subtle horizontal accent lines
      `drawbox=x=0:y=400:w=iw:h=2:color=${color2}@0.2:t=fill`,
      `drawbox=x=0:y=800:w=iw:h=1:color=${color2}@0.15:t=fill`,
      `drawbox=x=0:y=1200:w=iw:h=2:color=${color2}@0.2:t=fill`,
      `drawbox=x=0:y=1600:w=iw:h=1:color=${color2}@0.15:t=fill`,
    ].join(',');
  } else if (style === 'particles') {
    // Floating particles effect with moving boxes
    filterInput = [
      `color=c=${color1}:s=1080x1920:d=${duration}:r=30`,
      // Simulate floating dots/particles with small moving boxes
      `drawbox=x=mod(t*50+100\\,1080):y=mod(t*30\\,1920):w=8:h=8:color=${color2}@0.4:t=fill`,
      `drawbox=x=mod(t*70+400\\,1080):y=mod(t*45+200\\,1920):w=6:h=6:color=${color2}@0.3:t=fill`,
      `drawbox=x=mod(t*40+700\\,1080):y=mod(t*60+500\\,1920):w=10:h=10:color=${color2}@0.35:t=fill`,
      `drawbox=x=mod(t*55+200\\,1080):y=mod(t*35+800\\,1920):w=5:h=5:color=${color2}@0.25:t=fill`,
      `drawbox=x=mod(t*65+900\\,1080):y=mod(t*50+1200\\,1920):w=7:h=7:color=${color2}@0.3:t=fill`,
      `drawbox=x=mod(t*45+600\\,1080):y=mod(t*55+1500\\,1920):w=9:h=9:color=${color2}@0.35:t=fill`,
      // Horizontal accent bands
      `drawbox=x=0:y=mod(t*25\\,1920):w=iw:h=300:color=${color2}@0.06:t=fill`,
      `drawbox=x=0:y=mod(t*25+960\\,1920):w=iw:h=200:color=${color2}@0.04:t=fill`,
    ].join(',');
  } else {
    // Tech grid style
    filterInput = [
      `color=c=${color1}:s=1080x1920:d=${duration}:r=30`,
      // Grid lines
      `drawbox=x=0:y=0:w=1:h=ih:color=${color2}@0.08:t=fill`,
      `drawbox=x=270:y=0:w=1:h=ih:color=${color2}@0.08:t=fill`,
      `drawbox=x=540:y=0:w=1:h=ih:color=${color2}@0.08:t=fill`,
      `drawbox=x=810:y=0:w=1:h=ih:color=${color2}@0.08:t=fill`,
      `drawbox=x=1079:y=0:w=1:h=ih:color=${color2}@0.08:t=fill`,
      // Horizontal grid
      `drawbox=x=0:y=480:w=iw:h=1:color=${color2}@0.08:t=fill`,
      `drawbox=x=0:y=960:w=iw:h=1:color=${color2}@0.08:t=fill`,
      `drawbox=x=0:y=1440:w=iw:h=1:color=${color2}@0.08:t=fill`,
      // Moving highlight band
      `drawbox=x=0:y=mod(t*60\\,1920):w=iw:h=120:color=${color2}@0.08:t=fill`,
      // Accent dot
      `drawbox=x=mod(t*100\\,1080):y=mod(t*60\\,1920):w=4:h=4:color=${color2}@0.5:t=fill`,
    ].join(',');
  }

  try {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', filterInput,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-t', duration.toString(),
      outPath,
    ], { stdio: 'pipe', timeout: 60000 });
    const size = fs.statSync(outPath).size;
    console.log(`  ✓ ${outPath} (${(size / 1024).toFixed(0)}KB)`);
  } catch (err) {
    console.error(`  ✗ Failed to generate background ${name}:`, (err as Error).message?.slice(0, 200));
  }
}

async function main() {
  console.log('\n=== Generating Character Sprites ===');

  // Anime channel characters
  generateCharacterSprite('sensei', 'Sensei', '0x1a1a2e', '0xffffff', '0xe94560');
  generateCharacterSprite('kohai', 'Kohai', '0x1a1a2e', '0xffffff', '0xfacc15');

  // AI tools channel characters
  generateCharacterSprite('dev', 'Dev', '0x0f0f23', '0xe0e0e0', '0x00d4ff');
  generateCharacterSprite('intern', 'Intern', '0x0f0f23', '0xe0e0e0', '0x00d4ff');

  // Tech facts channel characters
  generateCharacterSprite('professor', 'Professor', '0x121212', '0xf5f5f5', '0x76ff03');
  generateCharacterSprite('student', 'Student', '0x121212', '0xf5f5f5', '0x76ff03');

  console.log('\n=== Generating Background Videos ===');

  // Animated backgrounds per channel
  generateBackground('anime_explains', '0x1a1a2e', '0xe94560', 'gradient');
  generateBackground('ai_tools', '0x0f0f23', '0x00d4ff', 'particles');
  generateBackground('tech_facts', '0x121212', '0x76ff03', 'tech');
  generateBackground('default', '0x0d0d1a', '0x6b21a8', 'gradient');

  console.log('\n=== Done ===');
}

main();
