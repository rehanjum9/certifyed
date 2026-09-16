declare module "svg-to-pdfkit" {
  interface SVGtoPDFOptions {
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
    useCSS?: boolean;
    assumePt?: boolean;
    [key: string]: unknown;
  }

  function SVGtoPDF(
    doc: PDFKit.PDFDocument,
    svg: string,
    x: number,
    y: number,
    options?: SVGtoPDFOptions,
  ): void;

  export = SVGtoPDF;
}
