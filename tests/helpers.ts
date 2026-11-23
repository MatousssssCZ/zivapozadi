import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { generateDemo } from '../scripts/generate-demo';
import { loadProject } from '../src/node/projectIO';

export async function tmpDir(prefix = 'zs-test-') { return fs.mkdtemp(path.join(os.tmpdir(), prefix)); }
export async function demoProject() {
  const dir = path.join(await tmpDir(), 'Demo.zscena');
  await generateDemo(dir);
  return loadProject(dir);
}
