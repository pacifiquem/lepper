import { KEYWORDS as JS_KEYWORDS } from '../javascript/keywords';

const TYPESCRIPT_ONLY = [
  'abstract',
  'as',
  'asserts',
  'declare',
  'enum',
  'implements',
  'infer',
  'interface',
  'is',
  'keyof',
  'module',
  'namespace',
  'override',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'satisfies',
  'type',
  'unique',
];

export const KEYWORDS = JS_KEYWORDS.concat(TYPESCRIPT_ONLY);
