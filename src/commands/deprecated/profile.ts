import { deprecatedCommand } from './common';

const profileCommand = (): never =>
  deprecatedCommand('lepper profile', 'lepper record <path> --note "..."');

export default profileCommand;
