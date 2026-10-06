import type { Browser } from 'playwright-core';
import { SESSION_COOKIE, createPrintSession } from '../auth';
import { openBrowser, remoteBrowserConfigured } from '../browser';
import { pdfSections, type PdfSection } from './sections';
let active = 0;
export class PdfBusyError extends Error {}
export class PdfConfigError extends Error {}
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
export async function renderAuditPdf(id: string, mode: 'live' | 'mock', section: PdfSection | null = null) {
  if (active >= 2) throw new PdfBusyError('PDF renderer is busy. Please try again shortly.');
  const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:3000').origin;
  // Browserless loads the print page over the internet, so it can never reach a loopback origin.
  if (remoteBrowserConfigured() && LOCAL_HOSTS.has(new URL(origin).hostname))
    throw new PdfConfigError(
      'Set APP_ORIGIN to the public HTTPS address so the remote browser can open the report.',
    );
  active++;
  let browser: Browser | undefined;
  let print: Awaited<ReturnType<typeof createPrintSession>> | undefined;
  try {
    print = await createPrintSession();
    browser = await openBrowser(90_000);
    const context = await browser.newContext({
      viewport: { width: 794, height: 1123 },
      reducedMotion: 'reduce',
    });
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: print.token,
        url: origin,
        httpOnly: true,
        sameSite: 'Strict',
        secure: origin.startsWith('https://'),
      },
    ]);
    // Never let a report trigger requests outside the configured application origin.
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    await page.emulateMedia({ media: 'print' });
    const response = await page.goto(
      `${origin}/audits/${encodeURIComponent(id)}/print${section ? `?section=${section}` : ''}`,
      {
        waitUntil: 'networkidle',
        timeout: 60000,
      },
    );
    if (!response?.ok() || page.url().includes('/login')) throw new Error('Print report is unavailable.');
    // The print document is server-rendered static HTML and SVG: no charts to wait for.
    await page.locator('[data-report-ready="true"]').waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      margin: { top: '16mm', bottom: '16mm', left: '13mm', right: '13mm' },
      headerTemplate: `<div style="font-family:Arial;font-size:8px;width:100%;margin:0 13mm;color:#526346;display:flex;justify-content:space-between"><b>TIER2 DIGITAL</b><span>${section ? pdfSections[section].toUpperCase() : 'DIGITAL PRESENCE'} REPORT · ${mode === 'live' ? 'LIVE DATA' : 'DEMO · SYNTHETIC DATA'}</span></div>`,
      footerTemplate:
        '<div style="font-family:Arial;font-size:8px;width:100%;margin:0 13mm;color:#697363;display:flex;justify-content:space-between"><span>tier2.digital · Clarity before strategy.</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
    return pdf;
  } finally {
    const cleanupFailed = (step: string) => (error: unknown) =>
      console.error(
        JSON.stringify({
          event: 'pdf.cleanup_failed',
          auditId: id,
          step,
          message: error instanceof Error ? error.message.slice(0, 300) : String(error),
        }),
      );
    await browser?.close().catch(cleanupFailed('browser'));
    await print?.revoke().catch(cleanupFailed('print_session'));
    active--;
  }
}
