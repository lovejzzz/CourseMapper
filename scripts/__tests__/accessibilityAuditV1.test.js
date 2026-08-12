import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { capturePackageAccessibilityAuditV1, verifyPackageAccessibilityAuditV1 } from '../lib/accessibilityAuditV1.mjs';

async function officeBytes(kind, { decorativeSemanticVisual = false, sheetName = 'Course Map' } = {}) {
  const zip = new JSZip();
  if (kind === 'docx') {
    zip.file(
      'word/document.xml',
      '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Accessible course</w:t></w:r></w:p></w:body></w:document>',
    );
    zip.file('word/footer1.xml', '<w:ftr><w:p><w:r><w:t>Page footer</w:t></w:r></w:p></w:ftr>');
  } else if (kind === 'pptx') {
    zip.file(
      'ppt/slides/slide1.xml',
      `<p:sld><p:cSld><p:spTree>
        <p:sp><p:nvSpPr><p:cNvPr id="1" name="Title" descr="Slide title"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Lesson orientation</a:t></a:r></a:p></p:txBody></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="cmVizHub" descr="${
          decorativeSemanticVisual ? 'Decorative' : 'Concept-map hub containing the central course concept'
        }"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Central concept</a:t></a:r></a:p></p:txBody></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="3" name="cmVizSpoke" descr="Concept-map node containing related idea evidence"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Evidence</a:t></a:r></a:p></p:txBody></p:sp>
        <p:cxnSp><p:nvCxnSpPr><p:cNvPr id="4" name="cmVizConn" descr="Connector from central concept to related idea evidence"/></p:nvCxnSpPr><p:spPr/></p:cxnSp>
      </p:spTree></p:cSld></p:sld>`,
    );
  } else {
    zip.file(
      'xl/workbook.xml',
      `<workbook><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    );
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetViews><sheetView><pane ySplit="1" state="frozen"/></sheetView></sheetViews><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Lesson</t></is></c><c r="B1" t="inlineStr"><is><t>Objective</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>One</t></is></c></row></sheetData></worksheet>',
    );
  }
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

async function packageBytes(options = {}) {
  const zip = new JSZip();
  zip.file('Syllabus/Course Syllabus.docx', await officeBytes('docx'));
  zip.file('Slide Decks/Lesson 01.pptx', await officeBytes('pptx', options));
  zip.file('Course Map/Course Map.xlsx', await officeBytes('xlsx', options));
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

describe('package accessibility audit v1', () => {
  it('hash-binds and reproduces structural checks across DOCX, PPTX, and XLSX', async () => {
    const bytes = await packageBytes();
    const receipt = await capturePackageAccessibilityAuditV1({
      packageBytes: bytes,
      packagePath: 'fixture.zip',
      capturedAt: '2026-08-06T00:00:00.000Z',
    });
    expect(receipt.status).toBe('passed');
    expect(receipt.summary).toMatchObject({
      artifactCount: 3,
      passedArtifactCount: 3,
      failedArtifactCount: 0,
      formatCounts: { docx: 1, pptx: 1, xlsx: 1 },
    });
    expect(receipt.artifacts.find((artifact) => artifact.kind === 'pptx')?.metrics).toMatchObject({
      functionalVisualSlideCount: 1,
      nonvisualRecoveryPassedSlideCount: 1,
    });
    for (const artifact of receipt.artifacts) {
      expect(artifact.metrics.textContrast.checkedPairCount, artifact.path).toBeGreaterThan(0);
      expect(artifact.metrics.textContrast.passedPairCount, artifact.path).toBe(
        artifact.metrics.textContrast.checkedPairCount,
      );
      expect(artifact.metrics.textContrast.minimumRatio, artifact.path).toBeGreaterThanOrEqual(4.5);
    }
    await expect(verifyPackageAccessibilityAuditV1({ packageBytes: bytes, receipt })).resolves.toMatchObject({
      status: 'passed',
      issues: [],
    });
  });

  it('rejects reader-visible text below the WCAG AA contrast floor', async () => {
    const deck = new JSZip();
    deck.file(
      'ppt/slides/slide1.xml',
      `<p:sld><p:cSld><p:spTree>
        <p:sp><p:nvSpPr><p:cNvPr id="1" name="Title" descr="Slide title"/></p:nvSpPr><p:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr><a:solidFill><a:srgbClr val="AAAAAA"/></a:solidFill></a:rPr><a:t>Low contrast title</a:t></a:r></a:p></p:txBody></p:sp>
      </p:spTree></p:cSld></p:sld>`,
    );
    const pkg = new JSZip();
    pkg.file('Slide Decks/Lesson 01.pptx', await deck.generateAsync({ type: 'uint8array' }));
    const receipt = await capturePackageAccessibilityAuditV1({
      packageBytes: await pkg.generateAsync({ type: 'uint8array' }),
      packagePath: 'fixture.zip',
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.artifacts[0].findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'text-contrast-below-aa' })]),
    );
  });

  it('rejects descriptive visual objects that do not recover their functional relationship', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      `<p:sld><p:cSld><p:spTree>
        <p:sp><p:nvSpPr><p:cNvPr id="1" name="Title" descr="Slide title"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Lesson orientation</a:t></a:r></a:p></p:txBody></p:sp>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="cmVizHub" descr="Concept-map hub containing the central course concept"/></p:nvSpPr></p:sp>
      </p:spTree></p:cSld></p:sld>`,
    );
    const analysis = await capturePackageAccessibilityAuditV1({
      packageBytes: await (async () => {
        const pkg = new JSZip();
        pkg.file('Slide Decks/Lesson 01.pptx', await zip.generateAsync({ type: 'uint8array' }));
        return pkg.generateAsync({ type: 'uint8array' });
      })(),
      packagePath: 'fixture.zip',
    });
    expect(analysis.status).toBe('failed');
    expect(analysis.artifacts[0].findings.map((finding) => finding.code)).toContain(
      'functional-visual-nonvisual-recovery-missing',
    );
  });

  it('requires native tables and matrices to enumerate recoverable categorical content', async () => {
    async function auditDescription(name, description) {
      const deck = new JSZip();
      deck.file(
        'ppt/slides/slide1.xml',
        `<p:sld><p:cSld><p:spTree>
          <p:sp><p:nvSpPr><p:cNvPr id="1" name="Title" descr="Slide title"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Decision evidence</a:t></a:r></a:p></p:txBody></p:sp>
          <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="${name}" descr="${description}"/></p:nvGraphicFramePr><a:graphic/></p:graphicFrame>
        </p:spTree></p:cSld></p:sld>`,
      );
      const pkg = new JSZip();
      pkg.file('Slide Decks/Lesson 01.pptx', await deck.generateAsync({ type: 'uint8array' }));
      return capturePackageAccessibilityAuditV1({
        packageBytes: await pkg.generateAsync({ type: 'uint8array' }),
        packagePath: 'fixture.zip',
      });
    }

    const recoverableTable = await auditDescription(
      'cmVizTable',
      'Nonvisual summary for the evidence comparison. Columns CLAIM and EVIDENCE. Rows: Price signal means willingness to pay; Cost curve means producer break-even point.',
    );
    expect(recoverableTable.status).toBe('passed');
    expect(recoverableTable.artifacts[0].metrics.nonvisualRecovery[0]).toMatchObject({
      status: 'passed',
      mode: 'data-relationship-recovery',
      quantitativeDetailPresent: true,
    });

    const recoverableMatrix = await auditDescription(
      'cmVizMatrix',
      'Decision matrix. Options: Price ceiling; Supply subsidy; Housing voucher; Zoning reform.',
    );
    expect(recoverableMatrix.status).toBe('passed');

    const genericTable = await auditDescription('cmVizTable', 'Three-row table of market evidence signals.');
    expect(genericTable.status).toBe('failed');
    expect(genericTable.artifacts[0].findings.map((finding) => finding.code)).toContain(
      'functional-visual-nonvisual-recovery-missing',
    );
  });

  it('rejects decorative semantic visuals and generic worksheet names', async () => {
    const receipt = await capturePackageAccessibilityAuditV1({
      packageBytes: await packageBytes({ decorativeSemanticVisual: true, sheetName: 'Sheet1' }),
      packagePath: 'fixture.zip',
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.artifacts.flatMap((artifact) => artifact.findings.map((finding) => finding.code))).toEqual(
      expect.arrayContaining(['semantic-object-description-not-meaningful', 'non-descriptive-sheet-name']),
    );
  });

  it('detects receipt and package drift', async () => {
    const bytes = await packageBytes();
    const receipt = await capturePackageAccessibilityAuditV1({ packageBytes: bytes, packagePath: 'fixture.zip' });
    receipt.artifacts[0].metrics.headingCount = 999;
    const verification = await verifyPackageAccessibilityAuditV1({ packageBytes: bytes, receipt });
    expect(verification.status).toBe('failed');
    expect(verification.issues).toEqual(
      expect.arrayContaining([
        'accessibility-audit receipt digest does not reproduce',
        'accessibility-audit artifact results do not reproduce from the package ZIP',
      ]),
    );
  });
});
