import { deprecatedCommand } from './common';

const verifyCommand = (): never =>
  deprecatedCommand('lepper verify', 'lepper map');

export default verifyCommand;
