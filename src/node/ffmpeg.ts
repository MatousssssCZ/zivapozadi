import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Hledání FFmpeg: ZIMNI_SCENA_FFMPEG → přibalený ffmpeg-static (v zabalené aplikaci rozbalený mimo asar) → PATH.
 */
export function locateFfmpeg(): { path: string; source: string } | null {
  const env = process.env.ZIMNI_SCENA_FFMPEG;
  if (env && existsSync(env)) return { path: env, source: 'proměnná ZIMNI_SCENA_FFMPEG' };
  try {
    const req = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);
    let p = req('ffmpeg-static') as string | null;
    if (p) {
      p = p.replace('app.asar' + require_sep(), 'app.asar.unpacked' + require_sep());
      if (existsSync(p) && probe(p)) return { path: p, source: 'přibalený ffmpeg-static' };
    }
  } catch { /* nepřibaleno */ }
  if (probe('ffmpeg')) return { path: 'ffmpeg', source: 'systémový ffmpeg (PATH)' };
  return null;
}
function require_sep() { return process.platform === 'win32' ? '\\' : '/'; }

function probe(bin: string): boolean {
  try { const r = spawnSync(bin, ['-hide_banner', '-version'], { timeout: 8000 }); return r.status === 0; } catch { return false; }
}

export function ffmpegHasEncoder(bin: string, name: string): boolean {
  const r = spawnSync(bin, ['-hide_banner', '-encoders'], { timeout: 10000, encoding: 'utf8' });
  return r.status === 0 && new RegExp(`\\s${name}\\s`).test(r.stdout);
}

/** Délka zvukového souboru z výpisu `ffmpeg -i` (bez ffprobe). */
export function probeDuration(bin: string, file: string): number | null {
  const r = spawnSync(bin, ['-hide_banner', '-i', file], { timeout: 20000, encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr ?? '');
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function hasAudioStream(bin: string, file: string): boolean {
  const r = spawnSync(bin, ['-hide_banner', '-i', file], { timeout: 20000, encoding: 'utf8' });
  return /Stream #\d+:\d+.*Audio:/.test(r.stderr ?? '');
}

export interface RunResult { code: number | null; stderrTail: string }

export function runFfmpeg(bin: string, args: string[]): { proc: ChildProcessWithoutNullStreams; done: Promise<RunResult> } {
  const proc = spawn(bin, ['-hide_banner', '-nostdin', '-loglevel', 'error', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let tail = '';
  proc.stderr.on('data', (d: Buffer) => { tail = (tail + d.toString()).slice(-4000); });
  proc.stdout.resume();
  const done = new Promise<RunResult>((resolve) => {
    proc.on('error', (e) => resolve({ code: -1, stderrTail: tail + '\n' + e.message }));
    proc.on('close', (code) => resolve({ code, stderrTail: tail }));
  });
  return { proc, done };
}

/** Převod chybového výstupu FFmpeg na srozumitelnou zprávu. */
export function explainFfmpegError(tail: string): string {
  if (/No space left on device/i.test(tail)) return 'Na disku došlo místo. Uvolněte místo a pokračujte v exportu (dokončené části zůstaly zachovány).';
  if (/Permission denied/i.test(tail)) return 'FFmpeg nemá oprávnění zapisovat do výstupní složky.';
  if (/Unknown encoder|Encoder .* not found/i.test(tail)) return 'Použitý FFmpeg nepodporuje enkodér libx264.';
  if (/No such file or directory/i.test(tail)) return 'FFmpeg nenašel vstupní nebo výstupní soubor: ' + tail.trim().split('\n').slice(-1)[0];
  return 'Chyba enkodéru FFmpeg: ' + (tail.trim().split('\n').slice(-3).join(' ') || 'neznámá chyba');
}
