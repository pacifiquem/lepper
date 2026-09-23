export type LangKind = 'function' | 'class' | 'method' | 'module';

export type CommentStyle = 'c' | 'hash' | 'sql' | 'erlang' | 'none';

export interface LangSymbol {
  name: string;
  qualified: string;
  kind: LangKind;
  line: number;
  exported: boolean;
  bodyStart: number;
  bodyEnd: number;
}

export interface LangCall {
  name: string;
  qualifier?: string;
  index: number;
  line: number;
}

export interface LangBinding {
  spec: string;
  imported: string;
  line: number;
}

export interface LangParse {
  symbols: LangSymbol[];
  calls: LangCall[];
  bindings: Map<string, LangBinding>;
  exports: Array<{ publicName: string; localName: string }>;
  imports: Array<{ spec: string; line: number; names: string[] }>;
}

export interface Profile {
  id: string;
  extensions: string[];
  keywords: string[];
  comments: CommentStyle;
}
