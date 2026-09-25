import { deprecatedCommand } from './common';

const describeCommand = (): never =>
  deprecatedCommand('lepper describe', 'lepper map');

export default describeCommand;
