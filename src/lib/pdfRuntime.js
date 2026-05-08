export const JSPDF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/+esm';
export const JSPDF_AUTOTABLE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.7/+esm';

let _pdfRuntime = null;
let _pdfRuntimePromise = null;

export async function loadPdfRuntime() {
  if (_pdfRuntime) return _pdfRuntime;
  if (_pdfRuntimePromise) return _pdfRuntimePromise;

  _pdfRuntimePromise = Promise.all([
    import(/* @vite-ignore */ JSPDF_MODULE_URL),
    import(/* @vite-ignore */ JSPDF_AUTOTABLE_MODULE_URL),
  ])
    .then(([jspdfModule, autoTableModule]) => {
      const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
      const autoTable = autoTableModule.default || autoTableModule.autoTable || autoTableModule;
      if (!jsPDF || !autoTable) {
        throw new Error('PDF runtime did not expose jsPDF and autoTable.');
      }
      _pdfRuntime = { jsPDF, autoTable };
      return _pdfRuntime;
    })
    .catch((err) => {
      _pdfRuntimePromise = null;
      throw new Error(
        `Failed to load the PDF renderer. Check your network connection and try again. ${err?.message || ''}`.trim(),
      );
    });

  return _pdfRuntimePromise;
}
