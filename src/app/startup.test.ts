import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const launcher = readFileSync(new URL('../../启动 PulseLab.cmd', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../scripts/start-pulselab.ps1', import.meta.url), 'utf8');

describe('PulseLab one-click launcher', () => {
  it('runs the project launcher from the repository directory', () => {
    expect(launcher).toContain('start-pulselab.ps1');
    expect(launcher).toContain('%~dp0');
  });

  it('keeps the documented local host and port and opens the browser after readiness', () => {
    expect(script).toContain('127.0.0.1');
    expect(script).toContain('$port = 1420');
    expect(script).toContain('Start-Process -FilePath $url');
    expect(script).toContain('npm.cmd');
  });
});
