// Moves large base64 media (data: URLs) out of posts/stories/messages and into object storage.
// - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set -> Supabase Storage (public bucket, default "wanas-media")
// - otherwise -> local disk under DATA_DIR/media, served at /media/<file>
// The database then only stores a short URL instead of megabytes of base64.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MIN_BYTES_TO_EXTERNALIZE = 2048;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
};

export function createMediaStore(dataDir: string) {
  const supaUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucket = process.env.SUPABASE_BUCKET || 'wanas-media';
  const useSupabase = Boolean(supaUrl && supaKey);
  const localDir = path.join(dataDir, 'media');

  async function ensureBucket() {
    if (!useSupabase) {
      fs.mkdirSync(localDir, { recursive: true });
      return;
    }
    try {
      const res = await fetch(`${supaUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supaKey}`,
          apikey: supaKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: bucket,
          name: bucket,
          public: true,
          file_size_limit: 50 * 1024 * 1024,
        }),
      });
      // 200 = created, 400/409 = already exists
      if (!res.ok && res.status !== 409 && res.status !== 400) {
        console.error('[media] bucket create failed:', res.status, await res.text());
      }
    } catch (err) {
      console.error('[media] bucket check failed:', (err as Error).message);
    }
  }

  async function saveBuffer(buf: Buffer, mime: string): Promise<string> {
    const ext = EXT[mime.toLowerCase()] || mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    if (useSupabase) {
      const res = await fetch(`${supaUrl}/storage/v1/object/${bucket}/${name}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supaKey}`,
          apikey: supaKey,
          'Content-Type': mime,
          'x-upsert': 'true',
          'cache-control': 'max-age=31536000',
        },
        body: new Uint8Array(buf),
      });
      if (!res.ok) throw new Error(`Supabase Storage ${res.status}: ${await res.text()}`);
      return `${supaUrl}/storage/v1/object/public/${bucket}/${name}`;
    }
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(path.join(localDir, name), buf);
    return `/media/${name}`;
  }

  /** Deep-walks any JSON-like value and replaces large data: URLs with stored URLs. Mutates and returns it. */
  async function externalize<T>(value: T): Promise<T> {
    const cache = new Map<string, string>();
    async function walk(node: any): Promise<any> {
      if (typeof node === 'string') {
        if (!node.startsWith('data:') || node.length < MIN_BYTES_TO_EXTERNALIZE) return node;
        const hit = cache.get(node);
        if (hit) return hit;
        const m = /^data:([a-z0-9.+/-]+)(?:;[^,]*)?;base64,(.*)$/is.exec(node);
        if (!m) return node;
        try {
          const url = await saveBuffer(Buffer.from(m[2], 'base64'), m[1]);
          cache.set(node, url);
          return url;
        } catch (err) {
          console.error('[media] upload failed, keeping inline:', (err as Error).message);
          return node;
        }
      }
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) node[i] = await walk(node[i]);
        return node;
      }
      if (node && typeof node === 'object') {
        for (const k of Object.keys(node)) node[k] = await walk(node[k]);
        return node;
      }
      return node;
    }
    return walk(value);
  }

  return { ensureBucket, externalize, useSupabase, localDir, saveBuffer };
}

export type MediaStore = ReturnType<typeof createMediaStore>;
