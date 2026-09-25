import { JsonRpcRequest, Taken } from './rpc';

function headerSplit(buffer: Buffer): { header: string; start: number } | null {
  const crlf = buffer.indexOf('\r\n\r\n');
  const lf = buffer.indexOf('\n\n');
  if (crlf === -1 && lf === -1) {
    return null;
  }
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    return {
      header: buffer.slice(0, crlf).toString('utf8'),
      start: crlf + 4,
    };
  }
  return {
    header: buffer.slice(0, lf).toString('utf8'),
    start: lf + 2,
  };
}

export function takeMessage(buffer: Buffer): Taken | null {
  const preview = buffer
    .slice(0, 80)
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  if (
    preview.startsWith('content-length:') ||
    preview.startsWith('content-type:')
  ) {
    const split = headerSplit(buffer);
    if (!split) {
      return null;
    }
    const match = split.header.match(/content-length:\s*(\d+)/i);
    if (!match) {
      return {
        message: { method: '' },
        framing: 'content-length',
        rest: buffer.slice(split.start),
      };
    }
    const length = Number(match[1]);
    if (buffer.length < split.start + length) {
      return null;
    }
    const body = buffer
      .slice(split.start, split.start + length)
      .toString('utf8');
    return {
      message: JSON.parse(body) as JsonRpcRequest,
      framing: 'content-length',
      rest: buffer.slice(split.start + length),
    };
  }

  const nl = buffer.indexOf(0x0a);
  if (nl === -1) {
    return null;
  }
  const line = buffer.slice(0, nl).toString('utf8').replace(/\r$/, '').trim();
  const rest = buffer.slice(nl + 1);
  if (!line) {
    return { message: { method: '' }, framing: 'ndjson', rest };
  }
  return {
    message: JSON.parse(line) as JsonRpcRequest,
    framing: 'ndjson',
    rest,
  };
}
