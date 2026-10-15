import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Windows launch packaging', () => {
  it('selects the Windows GUI subsystem for release without hiding debug output', () => {
    const entry = readFileSync('src-tauri/src/main.rs', 'utf8');
    expect(entry).toContain('#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]');
  });

  it('checks the linked release executable before copying installers', () => {
    const build = readFileSync('scripts/tauri-d-drive.ps1', 'utf8');
    expect(build).toContain('verify-windows-gui.ps1');
    expect(build.indexOf("verify-windows-gui.ps1")).toBeLessThan(build.indexOf('foreach ($installer in $installers)'));
    expect(build).toContain('if (-not $DebugBuild)');
  });

  it('does not show a persistent background window for the source launcher', () => {
    const launch = readFileSync('scripts/start-pulselab.ps1', 'utf8');
    expect(launch).toContain('-WindowStyle Hidden');
    expect(launch).not.toContain('-WindowStyle Normal');
  });
});
