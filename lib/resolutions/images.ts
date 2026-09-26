// Imported only by the server route. Restrict fetches to this project's public storage.
const MAX_BYTES = 5 * 1024 * 1024;
export function imageMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (Buffer.from(bytes.slice(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (Buffer.from(bytes.slice(0,4)).toString() === 'RIFF' && Buffer.from(bytes.slice(8,12)).toString() === 'WEBP') return 'image/webp';
  return null;
}
export async function fetchEvidence(url: string) {
  const target = new URL(url);
  const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (target.origin !== base.origin || target.protocol !== 'https:' || target.username || target.password ||
      !/^\/storage\/v1\/object\/public\/(report-images|resolution-images)\//.test(target.pathname)) {
    throw new Error('Unsupported evidence location');
  }
  const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Image unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new Error('Image too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  const mimeType = imageMime(bytes);
  if (!mimeType || response.headers.get('content-type')?.split(';')[0] !== mimeType) throw new Error('Invalid image type');
  return { inlineData: { mimeType, data: bytes.toString('base64') } };
}
