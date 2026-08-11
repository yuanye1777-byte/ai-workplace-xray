import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportReportAsPdf(element: HTMLElement, filename: string = 'AI职场X光报告.pdf') {
  if (!element) {
    throw new Error('未找到报告内容');
  }

  // Clone the element to avoid modifying the visible DOM and to ensure stable dimensions
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.top = '-9999px';
  clone.style.left = '-9999px';
  clone.style.width = `${element.scrollWidth}px`;
  clone.style.height = 'auto';
  clone.style.overflow = 'visible';
  clone.style.zIndex = '-1';
  document.body.appendChild(clone);

  let canvas: HTMLCanvasElement | null = null;
  let lastError: unknown = null;

  // Try a few scale settings; high scale gives crisp text but can exceed browser canvas limits
  for (const scale of [2, 1.5, 1]) {
    try {
      canvas = await html2canvas(clone, {
        scale,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight,
        scrollX: 0,
        scrollY: 0,
        onclone: (doc) => {
          // ── Fix: html2canvas doesn't support modern CSS color functions (oklch/oklab) ──
          // Tailwind CSS v4 emits oklch() in its stylesheet; html2canvas's CSS parser crashes on it.
          // Strategy: strip all original <style>/<link> sheets so html2canvas never sees oklch,
          // then inject a self-contained replacement CSS with only hex/rgb colors.

          doc.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => el.remove());

          const style = doc.createElement('style');
          style.textContent = `
            /* ===== CSS Variables (hex only) ===== */
            :root, *, *::before, *::after {
              --background: #ffffff;
              --foreground: #111111;
              --card: #f8f8f8;
              --card-foreground: #111111;
              --primary: #2563eb;
              --primary-foreground: #ffffff;
              --secondary: #f0f0f0;
              --secondary-foreground: #333333;
              --muted: #f5f5f5;
              --muted-foreground: #666666;
              --destructive: #dc2626;
              --destructive-foreground: #ffffff;
              --border: #e0e0e0;
              --ring: #2563eb;
              --radius: 8px;
            }

            /* ===== Reset & Base ===== */
            *, *::before, *::after { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              background: #ffffff; color: #111111; margin: 0; padding: 0; line-height: 1.5;
              -webkit-print-color-adjust: exact; print-color-adjust: exact;
            }

            /* ===== Layout ===== */
            .flex { display: flex; }
            .inline-flex { display: inline-flex; }
            .grid { display: grid; }
            .block { display: block; }
            .hidden { display: none; }
            .flex-col { flex-direction: column; }
            .flex-wrap { flex-wrap: wrap; }
            .flex-row { flex-direction: row; }
            .items-center { align-items: center; }
            .items-start { align-items: flex-start; }
            .items-end { align-items: flex-end; }
            .items-baseline { align-items: baseline; }
            .justify-center { justify-content: center; }
            .justify-between { justify-content: space-between; }
            .justify-end { justify-content: flex-end; }
            .gap-0\\.5 { gap: 2px; }
            .gap-1 { gap: 4px; }
            .gap-2 { gap: 8px; }
            .gap-3 { gap: 12px; }
            .gap-4 { gap: 16px; }
            .gap-6 { gap: 24px; }
            .space-y-0\\.5 > * + * { margin-top: 2px; }
            .space-y-1 > * + * { margin-top: 4px; }
            .space-y-2 > * + * { margin-top: 8px; }

            /* ===== Spacing ===== */
            .m-0 { margin: 0; }
            .mt-1 { margin-top: 4px; }
            .mt-2 { margin-top: 8px; }
            .mt-3 { margin-top: 12px; }
            .mt-4 { margin-top: 16px; }
            .mt-5 { margin-top: 20px; }
            .mt-10 { margin-top: 40px; }
            .mt-12 { margin-top: 48px; }
            .mb-1\\.5 { margin-bottom: 6px; }
            .mb-2 { margin-bottom: 8px; }
            .mb-3 { margin-bottom: 12px; }
            .mb-4 { margin-bottom: 16px; }
            .mb-8 { margin-bottom: 32px; }
            .mr-2 { margin-right: 8px; }
            .p-1 { padding: 4px; }
            .p-2 { padding: 8px; }
            .p-3 { padding: 12px; }
            .p-4 { padding: 16px; }
            .p-5 { padding: 20px; }
            .p-6 { padding: 24px; }
            .px-2 { padding-left: 8px; padding-right: 8px; }
            .px-3 { padding-left: 12px; padding-right: 12px; }
            .px-4 { padding-left: 16px; padding-right: 16px; }
            .px-6 { padding-left: 24px; padding-right: 24px; }
            .py-1 { padding-top: 4px; padding-bottom: 4px; }
            .py-2 { padding-top: 8px; padding-bottom: 8px; }
            .py-2\\.5 { padding-top: 10px; padding-bottom: 10px; }
            .py-3 { padding-top: 12px; padding-bottom: 12px; }
            .pt-3 { padding-top: 12px; }
            .pt-4 { padding-top: 16px; }
            .pb-2 { padding-bottom: 8px; }
            .last\\:border-b-0:last-child { border-bottom: 0; }

            /* ===== Typography ===== */
            .text-\\[9px\\] { font-size: 9px; }
            .text-\\[11px\\] { font-size: 11px; }
            .text-xs { font-size: 12px; line-height: 1rem; }
            .text-sm { font-size: 14px; line-height: 1.25rem; }
            .text-base { font-size: 16px; line-height: 1.5rem; }
            .text-lg { font-size: 18px; line-height: 1.75rem; }
            .text-xl { font-size: 20px; line-height: 1.75rem; }
            .text-2xl { font-size: 24px; line-height: 2rem; }
            .text-3xl { font-size: 30px; line-height: 2.25rem; }
            .text-4xl { font-size: 36px; line-height: 2.5rem; }
            .text-5xl { font-size: 48px; line-height: 1; }
            .font-medium { font-weight: 500; }
            .font-semibold { font-weight: 600; }
            .font-bold { font-weight: 700; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-left { text-align: left; }
            .leading-5 { line-height: 1.25rem; }
            .leading-6 { line-height: 1.5rem; }
            .leading-7 { line-height: 1.75rem; }
            .leading-8 { line-height: 2rem; }
            .leading-none { line-height: 1; }
            .tracking-wider { letter-spacing: 0.05em; }
            .tabular-nums { font-variant-numeric: tabular-nums; }
            .whitespace-nowrap { white-space: nowrap; }
            .whitespace-pre-wrap { white-space: pre-wrap; }

            /* ===== Text Colors ===== */
            .text-foreground { color: var(--foreground); }
            .text-foreground\\/80 { color: #111111cc; }
            .text-foreground\\/90 { color: #111111e6; }
            .text-muted-foreground { color: var(--muted-foreground); }
            .text-primary { color: var(--primary); }
            .text-primary-foreground { color: var(--primary-foreground); }
            .text-destructive { color: var(--destructive); }
            .text-emerald-600 { color: #059669; }
            .text-yellow-600 { color: #ca8a04; }
            .text-orange-600 { color: #ea580c; }
            .text-red-600 { color: #dc2626; }
            .text-red-700 { color: #b91c1c; }

            /* ===== Background Colors ===== */
            .bg-white { background-color: #ffffff; }
            .bg-primary { background-color: var(--primary); }
            .bg-secondary { background-color: var(--secondary); }
            .bg-secondary\\/30 { background-color: #f0f0f04d; }
            .bg-secondary\\/40 { background-color: #f0f0f066; }
            .bg-card\\/30 { background-color: #f8f8f84d; }
            .bg-card\\/40 { background-color: #f8f8f866; }
            .bg-card\\/50 { background-color: #f8f8f880; }
            .bg-card\\/60 { background-color: #f8f8f899; }
            .bg-emerald-500 { background-color: #10b981; }
            .bg-emerald-500\\/70 { background-color: #10b981b3; }
            .bg-yellow-500 { background-color: #eab308; }
            .bg-yellow-500\\/70 { background-color: #eab308b3; }
            .bg-orange-500 { background-color: #f97316; }
            .bg-orange-500\\/70 { background-color: #f97316b3; }
            .bg-red-500 { background-color: #ef4444; }
            .bg-red-500\\/70 { background-color: #ef4444b3; }
            .bg-red-600 { background-color: #dc2626; }
            .bg-red-700 { background-color: #b91c1c; }
            .bg-black\\/60 { background-color: #00000099; }

            /* ===== Borders ===== */
            .border { border: 1px solid var(--border); }
            .border-0 { border: 0; }
            .border-t { border-top: 1px solid var(--border); }
            .border-b { border-bottom: 1px solid var(--border); }
            .border-border { border-color: var(--border); }
            .border-border\\/50 { border-color: #e0e0e080; }
            .border-border\\/60 { border-color: #e0e0e099; }
            .border-border\\/70 { border-color: #e0e0e0b3; }
            .border-destructive\\/40 { border-color: #dc262666; }
            .border-primary\\/40 { border-color: #2563eb66; }

            /* ===== Border Radius ===== */
            .rounded { border-radius: 4px; }
            .rounded-md { border-radius: 6px; }
            .rounded-lg { border-radius: 8px; }
            .rounded-xl { border-radius: 12px; }
            .rounded-2xl { border-radius: 16px; }
            .rounded-full { border-radius: 9999px; }

            /* ===== Dimensions & Overflow ===== */
            .w-full { width: 100%; }
            .h-full { height: 100%; }
            .h-2 { height: 8px; }
            .h-5 { height: 20px; }
            .w-5 { width: 20px; }
            .max-h-64 { max-height: 256px; }
            .max-w-lg { max-width: 512px; }
            .overflow-hidden { overflow: hidden; }
            .overflow-y-auto { overflow-y: auto; }
            .overflow-visible { overflow: visible; }

            /* ===== Position & Z-Index ===== */
            .fixed { position: fixed; }
            .relative { position: relative; }
            .absolute { position: absolute; }
            .inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
            .z-50 { z-index: 50; }

            /* ===== Effects ===== */
            .shadow-2xl { box-shadow: 0 25px 50px -12px #00000040; }
            .transition { transition-property: color, background-color, border-color; }
            .transition-all { transition-property: all; }
            .duration-700 { transition-duration: 700ms; }

            /* ===== Utility: report content ===== */
            #report-content { overflow: visible !important; height: auto !important; }

            /* ===== Share dialog ===== */
            .hover\\:bg-secondary:hover { background-color: var(--secondary); }
            .hover\\:text-foreground:hover { color: var(--foreground); }
            .hover\\:brightness-110:hover { filter: brightness(1.1); }
          `;
          doc.head.appendChild(style);
        },
      });
      break;
    } catch (err) {
      lastError = err;
      canvas = null;
    }
  }

  document.body.removeChild(clone);

  if (!canvas) {
    throw lastError || new Error('生成 PDF 预览失败，请尝试缩小浏览器窗口后重试');
  }

  const imgData = canvas.toDataURL('image/png');
  const imgWidth = A4_WIDTH_MM;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const pdf = new jsPDF('p', 'mm', 'a4');

  // jsPDF addImage can fail with very large images; catch and provide guidance
  try {
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= A4_HEIGHT_MM;

    while (heightLeft > 0) {
      position -= A4_HEIGHT_MM;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= A4_HEIGHT_MM;
    }
  } catch (err) {
    throw new Error('PDF 图片写入失败，报告可能过长');
  }

  // Use Blob download instead of pdf.save to avoid popup-blocker issues
  const blob = pdf.output('blob');
  if (!blob || blob.size === 0) {
    throw new Error('生成的 PDF 文件为空');
  }

  downloadBlob(blob, filename);
}
