import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const full = process.argv.includes('--full');
const strictTypecheck = String(process.env.GC_TYPECHECK_STRICT || '').trim() === '1';
const npmCli = process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)
  ? process.env.npm_execpath
  : null;
const reportDir = path.resolve(process.cwd(), '_gc_reports');
fs.mkdirSync(reportDir, { recursive: true });

function npmCommand(args) {
  if (npmCli) {
    return {
      command: process.execPath,
      args: [npmCli, ...args],
      printable: `node "${npmCli}" ${args.join(' ')}`
    };
  }

  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return { command, args, printable: `${command} ${args.join(' ')}` };
}

function nodeCommand(args) {
  return {
    command: process.execPath,
    args,
    printable: `node ${args.join(' ')}`
  };
}

function runInherited(label, task, blocking = true) {
  console.log(`\n[GC quality] ${label}`);
  console.log(`[GC quality] Ejecutando: ${task.printable}`);

  const result = spawnSync(task.command, task.args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
    cwd: process.cwd()
  });

  if (result.error) console.error(`[GC quality] No se pudo iniciar: ${result.error.message}`);
  if (result.signal) console.error(`[GC quality] Finalizó por señal: ${result.signal}`);

  if (result.status !== 0) {
    const message = `[GC quality] FALLÓ: ${label} · código ${result.status ?? 'sin código'}`;
    if (blocking) {
      console.error(message);
      process.exit(result.status || 1);
    }
    console.warn(`${message} · no bloqueante`);
    return false;
  }

  console.log(`[GC quality] OK: ${label}`);
  return true;
}

function parseAstroDiagnostics(output) {
  const diagnostics = [];
  const regex = /^(src[\\/][^\r\n:]+(?:[\\/][^\r\n:]+)*\.[A-Za-z0-9]+):(\d+):(\d+)\s+-\s+(error|warning)\s+([^\r\n]+)/gm;
  for (const match of output.matchAll(regex)) {
    diagnostics.push({
      file: match[1].replace(/\\/g, '/'),
      line: Number(match[2]),
      column: Number(match[3]),
      severity: match[4],
      codeAndMessage: match[5]
    });
  }

  const byFile = new Map();
  for (const item of diagnostics) {
    const current = byFile.get(item.file) || { file: item.file, errors: 0, warnings: 0 };
    if (item.severity === 'error') current.errors += 1;
    else current.warnings += 1;
    byFile.set(item.file, current);
  }

  const resultMatch = output.match(/Result\s+\((\d+)\s+files?\):\s*-\s*(\d+)\s+errors?\s*-\s*(\d+)\s+warnings?\s*-\s*(\d+)\s+hints?/i)
    || output.match(/Result\s+\((\d+)\s+files?\):\s*-\s*(\d+)\s+errors?\s*-\s*(\d+)\s+hints?/i);

  return {
    filesReported: resultMatch ? Number(resultMatch[1]) : byFile.size,
    errors: resultMatch ? Number(resultMatch[2]) : diagnostics.filter((item) => item.severity === 'error').length,
    warnings: resultMatch && resultMatch.length >= 5 ? Number(resultMatch[3]) : diagnostics.filter((item) => item.severity === 'warning').length,
    hints: resultMatch ? Number(resultMatch[resultMatch.length - 1]) : 0,
    diagnosticsCount: diagnostics.length,
    byFile: [...byFile.values()].sort((a, b) => b.errors - a.errors || b.warnings - a.warnings || a.file.localeCompare(b.file)),
    diagnostics
  };
}

function runAstroCheck() {
  const task = npmCommand(['run', 'check']);
  console.log('\n[GC quality] Astro check');
  console.log(`[GC quality] Ejecutando: ${task.printable}`);

  const result = spawnSync(task.command, task.args, {
    encoding: 'utf8',
    shell: false,
    env: process.env,
    cwd: process.cwd(),
    maxBuffer: 64 * 1024 * 1024
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = `${stdout}${stderr ? `\n${stderr}` : ''}`;
  process.stdout.write(stdout);
  process.stderr.write(stderr);

  const summary = parseAstroDiagnostics(output);
  const report = {
    generatedAt: new Date().toISOString(),
    strict: strictTypecheck,
    exitCode: result.status,
    signal: result.signal || null,
    errorStartingProcess: result.error?.message || null,
    summary
  };

  fs.writeFileSync(path.join(reportDir, 'astro-check.log'), output, 'utf8');
  fs.writeFileSync(path.join(reportDir, 'astro-check-summary.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(
    `\n[GC quality] Astro baseline: ${summary.errors} errores · ${summary.warnings} warnings · ${summary.hints} hints`
  );
  console.log('[GC quality] Informe: _gc_reports/astro-check-summary.json');

  if (result.error) {
    console.error(`[GC quality] No se pudo iniciar Astro check: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0 && strictTypecheck) {
    console.error('[GC quality] FALLÓ: Astro check en modo estricto.');
    process.exit(result.status || 1);
  }

  if (result.status !== 0) {
    console.warn('[GC quality] Astro check queda como deuda técnica registrada y no bloquea esta fase.');
    console.warn('[GC quality] Para exigir cero errores: GC_TYPECHECK_STRICT=1.');
    return false;
  }

  console.log('[GC quality] OK: Astro check');
  return true;
}

runInherited('Auditoría estática', nodeCommand(['scripts/project-audit.mjs']), true);
runAstroCheck();

/*
  El build es el bloqueo operativo real mientras se reduce la deuda TypeScript.
  No se permite que el modo baseline convierta un build roto en un resultado correcto.
*/
runInherited('Build producción', npmCommand(['run', 'build']), true);

if (full) {
  runInherited(
    'Smoke Playwright',
    npmCommand(['exec', '--', 'playwright', 'test', 'tests/smoke.spec.ts']),
    true
  );
}

console.log(`\n[GC quality] OK · build validado${full ? ' · smoke validado' : ''}`);
if (!strictTypecheck) {
  console.log('[GC quality] Typecheck en modo baseline; la deuda está registrada, no ignorada.');
}
