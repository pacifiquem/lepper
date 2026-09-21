import { deprecatedCommand } from './common';

const initCommand = (): never =>
  deprecatedCommand('lepper init', 'lepper record');

export default initCommand;
