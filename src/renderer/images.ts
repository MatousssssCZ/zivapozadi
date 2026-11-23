import type { AssetImages, ImageLike } from '../core/render/sceneRenderer';
import type { ProjectFile } from '../core/model/types';
import { zs } from './api';

/** Mezipaměť dekódovaných obrázků projektu (ImageBitmap – GPU-přívětivé). */
export class ImageCache implements AssetImages {
  private map = new Map<string, ImageBitmap | null>();
  private loading = new Map<string, Promise<void>>();
  onChange: () => void = () => {};
  get(id: string): ImageLike | null | undefined { return this.map.get(id); }
  clear() { for (const b of this.map.values()) b?.close(); this.map.clear(); this.loading.clear(); }
  async sync(dir: string, p: ProjectFile, missing: string[]) {
    const jobs: Promise<void>[] = [];
    for (const a of p.assets) {
      if (a.kind !== 'image' || this.map.has(a.id) || this.loading.has(a.id)) continue;
      if (missing.includes(a.id)) { this.map.set(a.id, null); continue; }
      const job = (async () => {
        try {
          const bytes = await zs().readAsset(dir, a.file);
          const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
          this.map.set(a.id, bmp);
        } catch { this.map.set(a.id, null); }
        this.loading.delete(a.id);
        this.onChange();
      })();
      this.loading.set(a.id, job); jobs.push(job);
    }
    await Promise.all(jobs);
  }
  async whenLoaded() { await Promise.all(this.loading.values()); }
}
