export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
}

export type Framing = 'ndjson' | 'content-length';

export interface Taken {
  message: JsonRpcRequest;
  framing: Framing;
  rest: Buffer;
}
