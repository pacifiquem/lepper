export type SymbolKind = 'function' | 'class' | 'method' | 'module';
export type Confidence = 'resolved' | 'inferred' | 'ambiguous';

export interface CallSite {
  name: string;
  path: string;
  line: number;
  confidence: Confidence;
}

export interface CodeSymbol {
  id: string;
  path: string;
  name: string;
  qualified: string;
  kind: SymbolKind;
  line: number;
  exported: boolean;
  calls: CallSite[];
  calledBy: CallSite[];
}

export interface CodeMap {
  filesScanned: number;
  truncated: boolean;
  symbols: CodeSymbol[];
}

export interface BlastDependent {
  path: string;
  name: string;
  line: number;
  depth: number;
  via: 'call' | 'import';
  confidence: Confidence;
  through: string;
}

export interface BlastRadius {
  query: string;
  depth: number;
  ambiguous: boolean;
  truncated: boolean;
  definitions: Array<{
    id: string;
    path: string;
    name: string;
    qualified: string;
    kind: SymbolKind;
    line: number;
  }>;
  dependents: BlastDependent[];
}

export interface LocalSymbol {
  name: string;
  qualified: string;
  kind: SymbolKind;
  line: number;
  exported: boolean;
  bodyStart: number;
  bodyEnd: number;
}

export interface CallFact {
  name: string;
  qualifier?: string;
  index: number;
  line: number;
}

export interface Binding {
  spec: string;
  imported: string;
  line: number;
}

export interface ExportFact {
  publicName: string;
  localName: string;
}

export interface FileFacts {
  path: string;
  symbols: LocalSymbol[];
  calls: CallFact[];
  bindings: BindingMap;
  exports: ExportFact[];
  imports: Array<{ spec: string; line: number; names: string[] }>;
}

export type BindingMap = Map<string, Binding>;

export interface ResolvedEdge {
  from: string;
  to: string;
  line: number;
  confidence: Confidence;
}

export interface Graph {
  filesScanned: number;
  truncated: boolean;
  symbols: Map<string, CodeSymbol>;
  edges: ResolvedEdge[];
  imports: Array<{
    fromFile: string;
    toFile: string;
    line: number;
    names: string[];
  }>;
  byFile: Map<string, string[]>;
}
