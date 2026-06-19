import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

describe('teacher-ready package constitution audit', () => {
  it('is wired as the fast constitutional release gate', () => {
    const packageJson = readJson('package.json');
    const constitution = readJson('quality-constitution/v1.json');
    const doc = fs.readFileSync(path.join(ROOT, constitution.doc), 'utf8');

    expect(packageJson.scripts['audit:constitution']).toBe('node scripts/constitutionAudit.mjs');
    expect(constitution.fastGateCommand).toBe('npm run audit:constitution');
    expect(constitution.broadRegressionCommand).toBe('npm run audit:gold');
    expect(doc).toContain('The constitution is the standard; fixtures are probes');
    expect(doc).toContain('The full `npm run audit:gold` corpus is not the default proof for every patch');
  });

  it('passes the canonical fixture set and writes the latest report', () => {
    const output = execFileSync('node', ['scripts/constitutionAudit.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(output).toContain('Teacher-ready constitution audit: pass');
    const report = readJson('verification-output/constitution-audit/latest.json');
    expect(report.status).toBe('pass');
    expect(report.contract.principleCount).toBe(7);
    expect(report.fixtures).toHaveLength(5);
    expect(report.fixtures.map((fixture) => fixture.kind)).toEqual([
      'clean-pass',
      'digest-caveat',
      'assessment-gap',
      'discipline-fit',
      'handoff-substance',
    ]);
    expect(report.fixtures.every((fixture) => fixture.status === 'pass')).toBe(true);
  });
});
