import { DEFAULT_SCENE_H, DEFAULT_SCENE_W, PROJECT_FORMAT, PROJECT_FORMAT_VERSION, type ExportSettings, type ProjectFile } from './types';

export const APP_VERSION = '0.1.0';

export function defaultExportSettings(): ExportSettings {
  return {
    resolution: '1920x1080', fps: 30, durationMode: 'manual', durationSec: 60, audioAssetId: null,
    audioWhenShorter: 'silence', crf: 20, preset: 'medium', chunkSec: 60, outputPath: null, diagnosticPngSequence: false,
  };
}

export function createEmptyProject(name: string, seed = 12345): ProjectFile {
  const now = new Date().toISOString();
  return {
    format: PROJECT_FORMAT, formatVersion: PROJECT_FORMAT_VERSION,
    meta: { name, createdAt: now, modifiedAt: now, appVersion: APP_VERSION },
    seed,
    scene: {
      width: DEFAULT_SCENE_W, height: DEFAULT_SCENE_H, backgroundAssetId: null, backgroundColor: '#dfe8f2',
      depth: { enabled: true, yFar: 560, scaleFar: 0.62, yNear: 1080, scaleNear: 1.0 },
      snowfall: { enabled: true, density: 0.6, wind: 0.25 },
    },
    assets: [], objects: [], nav: { nodes: [], edges: [] }, areas: [], zones: [], characters: [], schedule: [],
    export: defaultExportSettings(),
  };
}
