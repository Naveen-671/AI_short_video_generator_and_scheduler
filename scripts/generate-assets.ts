/**
 * Generate character sprites and animated background videos
 * using ffmpeg — no external downloads needed.
 *
 * Characters: avatar-style cards with face features, layered gradients, glow borders
 * Backgrounds: rich multi-layer animated gradients with light effects
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
 * Generate a detailed character avatar PNG using multiple ffmpeg filter layers.
 * Creates a 512x700 card with:
 * - Gradient background with glow border
 * - Circular avatar area with face features (eyes, mouth using Unicode)
 * - Character name with decorative elements
 * - Role subtitle and accent bar
 */
function generateCharacterSprite(
  id: string,
  name: string,
  role: string,
  bgColor: string,
  bgColor2: string,
  textColor: string,
  accentColor: string,
  eyeChar: string,
  mouthChar: string,
) {
  mkdirp(CHARS_DIR);
  const outPath = path.join(CHARS_DIR, `${id}.png`);

  const initial = name[0]!.toUpperCase();

  // Build a rich character card with multiple layers
  const filter = [
    // Base: dark card background
    `color=c=${bgColor}:s=512x700:d=1`,
    // Gradient effect — lighter band at top
    `drawbox=x=0:y=0:w=512:h=200:color=${bgColor2}@0.3:t=fill`,
    `drawbox=x=0:y=0:w=512:h=80:color=${bgColor2}@0.15:t=fill`,
    // Glow border — bright accent frame (4px each side)
    `drawbox=x=0:y=0:w=512:h=4:color=${accentColor}:t=fill`,       // top
    `drawbox=x=0:y=696:w=512:h=4:color=${accentColor}:t=fill`,     // bottom
    `drawbox=x=0:y=0:w=4:h=700:color=${accentColor}:t=fill`,       // left
    `drawbox=x=508:y=0:w=4:h=700:color=${accentColor}:t=fill`,     // right
    // Inner glow border (softer)
    `drawbox=x=4:y=4:w=504:h=2:color=${accentColor}@0.4:t=fill`,
    `drawbox=x=4:y=694:w=504:h=2:color=${accentColor}@0.4:t=fill`,
    `drawbox=x=4:y=4:w=2:h=692:color=${accentColor}@0.4:t=fill`,
    `drawbox=x=506:y=4:w=2:h=692:color=${accentColor}@0.4:t=fill`,
    // Avatar circle background — large rounded area
    `drawbox=x=131:y=40:w=250:h=250:color=${accentColor}@0.25:t=fill`,
    // Inner circle (brighter)
    `drawbox=x=151:y=60:w=210:h=210:color=${accentColor}@0.35:t=fill`,
    // Core circle (brightest)
    `drawbox=x=176:y=85:w=160:h=160:color=${accentColor}@0.20:t=fill`,
    // Character initial — large centered letter
    `drawtext=text=${initial}:fontsize=140:fontcolor=${textColor}:x=(w-tw)/2:y=72:font=Arial`,
    // Eyes — Unicode character eyes
    `drawtext=text=${eyeChar}:fontsize=50:fontcolor=${textColor}:x=195:y=110:font=Arial`,
    `drawtext=text=${eyeChar}:fontsize=50:fontcolor=${textColor}:x=270:y=110:font=Arial`,
    // Mouth
    `drawtext=text=${mouthChar}:fontsize=40:fontcolor=${textColor}@0.8:x=(w-tw)/2:y=170:font=Arial`,
    // Decorative accent bar under avatar
    `drawbox=x=140:y=310:w=232:h=6:color=${accentColor}:t=fill`,
    `drawbox=x=180:y=320:w=152:h=3:color=${accentColor}@0.5:t=fill`,
    // Character name — bold centered
    `drawtext=text=${name.toUpperCase()}:fontsize=44:fontcolor=${textColor}:x=(w-tw)/2:y=345:font=Arial`,
    // Accent dots beside name
    `drawtext=text=\\\\<:fontsize=36:fontcolor=${accentColor}:x=60:y=348:font=Arial`,
    `drawtext=text=\\\\>:fontsize=36:fontcolor=${accentColor}:x=420:y=348:font=Arial`,
    // Role subtitle
    `drawtext=text=${role.toUpperCase()}:fontsize=22:fontcolor=${textColor}@0.65:x=(w-tw)/2:y=405:font=Arial`,
    // Bottom decorative elements — small accent squares
    `drawbox=x=200:y=450:w=12:h=12:color=${accentColor}@0.6:t=fill`,
    `drawbox=x=250:y=450:w=12:h=12:color=${accentColor}@0.6:t=fill`,
    `drawbox=x=300:y=450:w=12:h=12:color=${accentColor}@0.6:t=fill`,
    // Status bar at bottom
    `drawbox=x=30:y=500:w=452:h=3:color=${accentColor}@0.3:t=fill`,
    `drawbox=x=30:y=500:w=300:h=3:color=${accentColor}@0.7:t=fill`,
    // Channel badge area
    `drawbox=x=30:y=530:w=120:h=30:color=${accentColor}@0.2:t=fill`,
    `drawtext=text=READY:fontsize=16:fontcolor=${accentColor}:x=52:y=536:font=Arial`,
    // Signature decorative corner marks
    `drawbox=x=20:y=20:w=30:h=2:color=${accentColor}@0.5:t=fill`,
    `drawbox=x=20:y=20:w=2:h=30:color=${accentColor}@0.5:t=fill`,
    `drawbox=x=462:y=20:w=30:h=2:color=${accentColor}@0.5:t=fill`,
    `drawbox=x=490:y=20:w=2:h=30:color=${accentColor}@0.5:t=fill`,
    `drawbox=x=20:y=668:w=30:h=2:color=${accentColor}@0.5:t=fill`,
    `drawbox=x=20:y=668:w=2:h=30:color=${accentColor}@0.5:t=fill`,
    `drawbox=x=462:y=668:w=30:h=2:color=${accentColor}@0.5:t=fill`,
    `drawbox=x=490:y=668:w=2:h=30:color=${accentColor}@0.5:t=fill`,
  ].join(',');

  try {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', filter,
      '-frames:v', '1',
      outPath,
    ], { stdio: 'pipe' });
    console.log(`  OK ${outPath}`);
  } catch (err) {
    console.error(`  FAIL ${id}:`, (err as Error).message?.slice(0, 200));
  }
}

/**
 * Generate a rich animated background video using multi-layer ffmpeg filters.
 * Each style creates visually interesting motion with multiple overlapping elements.
 */
function generateBackground(name: string, color1: string, color2: string, accentColor: string, style: 'aurora' | 'matrix' | 'pulse' | 'wave') {
  mkdirp(BG_DIR);
  const outPath = path.join(BG_DIR, `${name}.mp4`);
  const duration = 10;

  let filterInput: string;

  if (style === 'aurora') {
    // Rich aurora/gradient with multiple moving light bands
    filterInput = [
      `color=c=${color1}:s=1080x1920:d=${duration}:r=30`,
      // Large slow-moving aurora bands
      `drawbox=x=0:y=mod(t*40\\,2400)-400:w=iw:h=500:color=${color2}@0.08:t=fill`,
      `drawbox=x=0:y=mod(t*40+800\\,2400)-400:w=iw:h=400:color=${color2}@0.06:t=fill`,
      `drawbox=x=0:y=mod(t*40+1600\\,2400)-400:w=iw:h=350:color=${accentColor}@0.04:t=fill`,
      // Medium bands moving faster
      `drawbox=x=0:y=mod(t*70\\,2200)-200:w=iw:h=200:color=${color2}@0.05:t=fill`,
      `drawbox=x=0:y=mod(t*70+1100\\,2200)-200:w=iw:h=250:color=${accentColor}@0.04:t=fill`,
      // Fast thin accent lines (scanning effect)
      `drawbox=x=0:y=mod(t*150\\,1920):w=iw:h=3:color=${accentColor}@0.15:t=fill`,
      `drawbox=x=0:y=mod(t*150+960\\,1920):w=iw:h=2:color=${color2}@0.10:t=fill`,
      // Horizontal static accent lines for depth
      `drawbox=x=0:y=320:w=iw:h=1:color=${color2}@0.06:t=fill`,
      `drawbox=x=0:y=640:w=iw:h=1:color=${color2}@0.06:t=fill`,
      `drawbox=x=0:y=960:w=iw:h=1:color=${accentColor}@0.04:t=fill`,
      `drawbox=x=0:y=1280:w=iw:h=1:color=${color2}@0.06:t=fill`,
      `drawbox=x=0:y=1600:w=iw:h=1:color=${color2}@0.06:t=fill`,
      // Corner vignette effect (dark edges)
      `drawbox=x=0:y=0:w=iw:h=150:color=0x000000@0.3:t=fill`,
      `drawbox=x=0:y=1770:w=iw:h=150:color=0x000000@0.3:t=fill`,
    ].join(',');
  } else if (style === 'matrix') {
    // Matrix/digital rain style with vertical moving elements
    filterInput = [
      `color=c=${color1}:s=1080x1920:d=${duration}:r=30`,
      // Vertical columns of light (simulating data streams)
      `drawbox=x=100:y=mod(t*120\\,2200)-200:w=3:h=180:color=${accentColor}@0.2:t=fill`,
      `drawbox=x=250:y=mod(t*90+300\\,2200)-200:w=3:h=220:color=${color2}@0.15:t=fill`,
      `drawbox=x=400:y=mod(t*110+100\\,2200)-200:w=3:h=160:color=${accentColor}@0.2:t=fill`,
      `drawbox=x=550:y=mod(t*80+600\\,2200)-200:w=3:h=200:color=${color2}@0.15:t=fill`,
      `drawbox=x=700:y=mod(t*100+200\\,2200)-200:w=3:h=170:color=${accentColor}@0.18:t=fill`,
      `drawbox=x=850:y=mod(t*95+400\\,2200)-200:w=3:h=190:color=${color2}@0.15:t=fill`,
      `drawbox=x=980:y=mod(t*105+500\\,2200)-200:w=3:h=150:color=${accentColor}@0.2:t=fill`,
      // Background glow areas
      `drawbox=x=0:y=mod(t*30\\,2200)-200:w=iw:h=300:color=${color2}@0.04:t=fill`,
      `drawbox=x=0:y=mod(t*30+1100\\,2200)-200:w=iw:h=250:color=${accentColor}@0.03:t=fill`,
      // Grid overlay (subtle)
      `drawbox=x=270:y=0:w=1:h=ih:color=${color2}@0.04:t=fill`,
      `drawbox=x=540:y=0:w=1:h=ih:color=${color2}@0.04:t=fill`,
      `drawbox=x=810:y=0:w=1:h=ih:color=${color2}@0.04:t=fill`,
      // Moving horizontal scan line
      `drawbox=x=0:y=mod(t*200\\,1920):w=iw:h=2:color=${accentColor}@0.12:t=fill`,
      // Vignette
      `drawbox=x=0:y=0:w=iw:h=120:color=0x000000@0.25:t=fill`,
      `drawbox=x=0:y=1800:w=iw:h=120:color=0x000000@0.25:t=fill`,
    ].join(',');
  } else if (style === 'pulse') {
    // Pulsing/breathing effect with expanding shapes
    filterInput = [
      `color=c=${color1}:s=1080x1920:d=${duration}:r=30`,
      // Pulsing central glow — layers of rectangles
      `drawbox=x=190:y=610:w=700:h=700:color=${color2}@0.05:t=fill`,
      `drawbox=x=290:y=710:w=500:h=500:color=${accentColor}@0.04:t=fill`,
      `drawbox=x=390:y=810:w=300:h=300:color=${color2}@0.06:t=fill`,
      // Moving horizontal bands
      `drawbox=x=0:y=mod(t*60\\,2200)-200:w=iw:h=300:color=${color2}@0.05:t=fill`,
      `drawbox=x=0:y=mod(t*60+1100\\,2200)-200:w=iw:h=200:color=${accentColor}@0.04:t=fill`,
      // Moving accent particles
      `drawbox=x=mod(t*80+100\\,1080):y=mod(t*50\\,1920):w=8:h=8:color=${accentColor}@0.4:t=fill`,
      `drawbox=x=mod(t*60+500\\,1080):y=mod(t*70+400\\,1920):w=6:h=6:color=${color2}@0.3:t=fill`,
      `drawbox=x=mod(t*90+800\\,1080):y=mod(t*40+1000\\,1920):w=7:h=7:color=${accentColor}@0.35:t=fill`,
      `drawbox=x=mod(t*50+300\\,1080):y=mod(t*80+600\\,1920):w=5:h=5:color=${color2}@0.25:t=fill`,
      `drawbox=x=mod(t*70+200\\,1080):y=mod(t*55+1400\\,1920):w=6:h=6:color=${accentColor}@0.3:t=fill`,
      // Crosshair at center (static)
      `drawbox=x=535:y=900:w=10:h=120:color=${color2}@0.03:t=fill`,
      `drawbox=x=480:y=955:w=120:h=10:color=${color2}@0.03:t=fill`,
      // Fast scan line
      `drawbox=x=0:y=mod(t*180\\,1920):w=iw:h=2:color=${accentColor}@0.10:t=fill`,
      // Vignette
      `drawbox=x=0:y=0:w=iw:h=100:color=0x000000@0.3:t=fill`,
      `drawbox=x=0:y=1820:w=iw:h=100:color=0x000000@0.3:t=fill`,
    ].join(',');
  } else {
    // Wave — multi-layer horizontal wave bands
    filterInput = [
      `color=c=${color1}:s=1080x1920:d=${duration}:r=30`,
      // Large slow waves
      `drawbox=x=0:y=200+100*sin(t*1.5):w=iw:h=400:color=${color2}@0.06:t=fill`,
      `drawbox=x=0:y=900+80*sin(t*1.2+1):w=iw:h=350:color=${accentColor}@0.04:t=fill`,
      `drawbox=x=0:y=1500+120*sin(t*1.8+2):w=iw:h=300:color=${color2}@0.05:t=fill`,
      // Medium oscillating bands
      `drawbox=x=0:y=400+60*sin(t*2.5):w=iw:h=150:color=${color2}@0.04:t=fill`,
      `drawbox=x=0:y=1100+50*sin(t*2+0.5):w=iw:h=180:color=${accentColor}@0.03:t=fill`,
      // Fast thin sweeper lines
      `drawbox=x=0:y=mod(t*130\\,1920):w=iw:h=2:color=${accentColor}@0.10:t=fill`,
      `drawbox=x=0:y=mod(t*130+960\\,1920):w=iw:h=1:color=${color2}@0.08:t=fill`,
      // Static horizontal grid
      `drawbox=x=0:y=384:w=iw:h=1:color=${color2}@0.05:t=fill`,
      `drawbox=x=0:y=768:w=iw:h=1:color=${color2}@0.05:t=fill`,
      `drawbox=x=0:y=1152:w=iw:h=1:color=${color2}@0.05:t=fill`,
      `drawbox=x=0:y=1536:w=iw:h=1:color=${color2}@0.05:t=fill`,
      // Vignette
      `drawbox=x=0:y=0:w=iw:h=130:color=0x000000@0.25:t=fill`,
      `drawbox=x=0:y=1790:w=iw:h=130:color=0x000000@0.25:t=fill`,
    ].join(',');
  }

  try {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', filterInput,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-t', duration.toString(),
      outPath,
    ], { stdio: 'pipe', timeout: 120000 });
    const size = fs.statSync(outPath).size;
    console.log(`  OK ${outPath} (${(size / 1024).toFixed(0)}KB)`);
  } catch (err) {
    console.error(`  FAIL background ${name}:`, (err as Error).message?.slice(0, 200));
  }
}

async function main() {
  console.log('\n=== Generating Character Sprites ===');

  //                   id          name         role            bgColor     bgColor2    textColor   accent      eyes  mouth
  generateCharacterSprite('sensei',    'Sensei',    'AI Teacher',  '0x1a1a2e', '0x2d1b69', '0xffffff', '0xe94560', 'o',  '-');
  generateCharacterSprite('kohai',     'Kohai',     'AI Learner',  '0x1a1a2e', '0x3d1b69', '0xffffff', '0xfacc15', 'o',  'v');
  generateCharacterSprite('dev',       'Dev',       'Engineer',    '0x0f0f23', '0x0f2340', '0xe0e0e0', '0x00d4ff', 'o',  '-');
  generateCharacterSprite('intern',    'Intern',    'Newcomer',    '0x0f0f23', '0x0f2340', '0xe0e0e0', '0x00d4ff', 'o',  'o');
  generateCharacterSprite('professor', 'Professor', 'Expert',      '0x121212', '0x122012', '0xf5f5f5', '0x76ff03', 'o',  '-');
  generateCharacterSprite('student',   'Student',   'Explorer',    '0x121212', '0x122012', '0xf5f5f5', '0x76ff03', 'o',  'D');

  console.log('\n=== Generating Background Videos ===');

  //                    name             color1      color2      accent      style
  generateBackground('anime_explains', '0x1a1a2e', '0xe94560', '0xfacc15', 'aurora');
  generateBackground('ai_tools',       '0x0f0f23', '0x00d4ff', '0x00ff88', 'matrix');
  generateBackground('tech_facts',     '0x121212', '0x76ff03', '0x00d4ff', 'pulse');
  generateBackground('default',        '0x0d0d1a', '0x6b21a8', '0xe94560', 'wave');

  console.log('\n=== Done ===');
}

main();
