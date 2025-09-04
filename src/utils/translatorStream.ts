/* Streaming decoder for manga translator endpoints:
   Frame: [1 byte type][4 bytes length BE][payload bytes]
   Types: 0=final, 1=progress (UTF-8), 2=error (UTF-8), 3=queue (UTF-8 int), 4=waiting (empty)
*/
export type StreamKind = 'image' | 'json' | 'bytes';

export type QueueEvent = { type: 'queue'; position: number; raw: string };
export type WaitingEvent = { type: 'waiting' };
export type ProgressEvent = { type: 'progress'; stage: string };
export type ErrorEvent = { type: 'error'; message: string };
export type FinalEvent =
  | { type: 'final'; kind: 'image'; bytes: Uint8Array; blob: Blob }
  | { type: 'final'; kind: 'json'; json: unknown; raw: string }
  | { type: 'final'; kind: 'bytes'; bytes: Uint8Array };

export type StreamEvent = QueueEvent | WaitingEvent | ProgressEvent | ErrorEvent | FinalEvent;

const enum FrameType {
  Final = 0,
  Progress = 1,
  Error = 2,
  Queue = 3,
  Waiting = 4,
}

const td = new TextDecoder('utf-8', { fatal: false });

function be32(buf: Uint8Array, o: number): number {
  return ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
}

class ByteBuf {
  private buf = new Uint8Array(0);
  private pos = 0;

  get available(): number {
    return this.buf.length - this.pos;
  }

  append(chunk: Uint8Array) {
    if (chunk.length === 0) return;
    if (this.pos === 0 && this.buf.length === 0) {
      this.buf = chunk;
      return;
    }
    // Compact if we’ve consumed >50% to keep copies small
    if (this.pos > 0 && this.pos >= (this.buf.length >>> 1)) {
      this.buf = this.buf.slice(this.pos);
      this.pos = 0;
    }
    const out = new Uint8Array(this.available + chunk.length);
    out.set(this.buf.subarray(this.pos));
    out.set(chunk, this.available);
    this.buf = out;
    this.pos = 0;
  }

  take(n: number): Uint8Array | null {
    if (this.available < n) return null;
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  peek(n: number): Uint8Array | null {
    if (this.available < n) return null;
    return this.buf.subarray(this.pos, this.pos + n);
  }
}

/**
 * Async generator decoding the translator stream into typed events.
 */
export async function* decodeTranslatorStream(
  stream: ReadableStream<Uint8Array>,
  kind: StreamKind
): AsyncGenerator<StreamEvent, void, unknown> {
  const reader = stream.getReader();
  const bb = new ByteBuf();

  try {
    while (true) {
      // Ensure we have at least a header
      while (bb.available < 5) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) bb.append(value);
      }
      if (bb.available < 5) break;

      const header = bb.peek(5)!;
      const type = header[0] as FrameType;
      const len = be32(header, 1);
      // consume header
      bb.take(5);

      // Read payload
      while (bb.available < len) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) bb.append(value);
      }
      const payload = bb.take(len) ?? new Uint8Array(0);

      if (type === FrameType.Queue) {
        const raw = td.decode(payload);
        const position = Number.parseInt(raw, 10);
        yield { type: 'queue', position: Number.isFinite(position) ? position : -1, raw };
      } else if (type === FrameType.Waiting) {
        yield { type: 'waiting' };
      } else if (type === FrameType.Progress) {
        yield { type: 'progress', stage: td.decode(payload) };
      } else if (type === FrameType.Error) {
        yield { type: 'error', message: td.decode(payload) };
        return;
      } else if (type === FrameType.Final) {
        if (kind === 'image') {
          const bytes = payload;
          const blob = new Blob([bytes], { type: 'image/png' });
          yield { type: 'final', kind: 'image', bytes, blob };
        } else if (kind === 'json') {
          const raw = td.decode(payload);
          try {
            const json = JSON.parse(raw);
            yield { type: 'final', kind: 'json', json, raw };
          } catch {
            yield { type: 'error', message: 'Invalid JSON in final payload' };
          }
        } else {
          yield { type: 'final', kind: 'bytes', bytes: payload };
        }
        return; // final is terminal
      } else {
        // Unknown frame type — treat as error
        yield { type: 'error', message: `Unknown frame type: ${type}` };
        return;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

/** Parse PNG width/height from bytes (without creating an Image). */
export function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (bytes.length < 24) return null;
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return null;
  }
  // IHDR chunk follows signature: length(4) type(4='IHDR') data(13) crc(4)
  // Width/Height are first 8 bytes of IHDR data, big-endian.
  // After signature, next 8 bytes are length+type.
  if (bytes.length < 33) return null;
  // type bytes at offset 12..15 should be 'IHDR'
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  return { width: w >>> 0, height: h >>> 0 };
}

/**
 * Convenience: consumes the stream and resolves to the final image Blob.
 */
export async function consumeToFinalImage(opts: {
  response: Response;
  onQueue?: (e: QueueEvent) => void;
  onWaiting?: (e: WaitingEvent) => void;
  onProgress?: (e: ProgressEvent) => void;
  onError?: (e: ErrorEvent) => void;
  onFinalInfo?: (info: { width: number; height: number; size: number }) => void;
}): Promise<Blob> {
  const { response, onQueue, onWaiting, onProgress, onError, onFinalInfo } = opts;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const ct = response.headers.get('content-type') || '';
  if (!ct.startsWith('application/octet-stream')) {
    throw new Error(`Unexpected content-type: ${ct}`);
  }
  const body = response.body as ReadableStream<Uint8Array> | null;
  if (!body) throw new Error('No response body (stream)');

  for await (const ev of decodeTranslatorStream(body, 'image')) {
    if (ev.type === 'queue') onQueue?.(ev);
    else if (ev.type === 'waiting') onWaiting?.(ev);
    else if (ev.type === 'progress') onProgress?.(ev);
    else if (ev.type === 'error') {
      onError?.(ev);
      throw new Error(ev.message);
    } else if (ev.type === 'final' && ev.kind === 'image') {
      const dims = parsePngDimensions(ev.bytes);
      if (dims) onFinalInfo?.({ ...dims, size: ev.bytes.byteLength });
      return ev.blob;
    }
  }
  throw new Error('Stream ended without a final image');
}
