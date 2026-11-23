import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AssetEntry, ProjectFile } from '../core/model/types';
import { resolveInside } from './projectIO';

export interface BuiltinLibrary { assets: AssetEntry[] }

export async function readBuiltinLibrary(resDir: string): Promise<BuiltinLibrary> {
  const j = JSON.parse(await fs.readFile(path.join(resDir, 'builtin.json'), 'utf8'));
  return { assets: j.assets };
}

/** Zkopíruje vestavěný asset do projektu (projekt je vždy soběstačný) a vrátí jeho položku. */
export async function addBuiltinAsset(resDir: string, projectDir: string, project: ProjectFile, builtinId: string): Promise<AssetEntry> {
  const existing = project.assets.find((a) => a.id === builtinId);
  if (existing) return existing;
  const entry = await copyBuiltinAsset(resDir, projectDir, builtinId);
  project.assets.push(entry);
  return entry;
}

export async function copyBuiltinAsset(resDir: string, projectDir: string, builtinId: string): Promise<AssetEntry> {
  const lib = await readBuiltinLibrary(resDir);
  const src = lib.assets.find((a) => a.id === builtinId);
  if (!src) throw new Error(`Vestavěný asset ${builtinId} neexistuje.`);
  const sub = src.kind === 'image' ? 'images' : src.kind === 'audio' ? 'audio' : 'characters';
  const rel = `assets/${sub}/${src.file}`;
  const dest = resolveInside(projectDir, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(path.join(resDir, src.file), dest);
  return { ...structuredClone(src), file: rel };
}
