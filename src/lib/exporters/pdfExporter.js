import { loadPdfLibs, getDocx, getSaveAs, resolveFeatureLabel } from './exporterUtils.js';
import { deliverableToCsvRows } from './csvExporter.js';
import { formatOutcomeAlignment, formatRequiredText } from './syllabusExportUtils.js';

// PDF EXPORT
// ════════════════════════════════════════════════════════════════

export async function exportDeliverablePdf(featureId, data, courseName) {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const label = resolveFeatureLabel(featureId);
  const title = `${courseName || 'Course'} — ${label}`;

  // Syllabus gets a specially formatted multi-section PDF
  if (featureId === 'syllabus') {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const syl = data.syllabus || data;
    let y = 15;
    const lm = 14,
      rm = 196,
      pageH = 280;

    const checkPage = (needed = 10) => {
      if (y + needed > pageH) {
        doc.addPage();
        y = 15;
      }
    };

    const drawSectionHeading = (text) => {
      checkPage(12);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(43, 87, 154);
      doc.text(text, lm, y);
      doc.setDrawColor(43, 87, 154);
      doc.setLineWidth(0.4);
      doc.line(lm, y + 1.5, rm, y + 1.5);
      y += 7;
      doc.setTextColor(0, 0, 0);
    };

    const drawBodyText = (text, indent = 0) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(text || '', rm - lm - indent);
      lines.forEach((line) => {
        checkPage(5);
        doc.text(line, lm + indent, y);
        y += 5;
      });
    };

    const drawBoldLabel = (label, value) => {
      checkPage(6);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(label + ': ', lm, y);
      doc.setFont('helvetica', 'normal');
      const lw = doc.getTextWidth(label + ': ');
      const lines = doc.splitTextToSize(value || '', rm - lm - lw);
      doc.text(lines[0] || '', lm + lw, y);
      y += 5;
      for (let i = 1; i < lines.length; i++) {
        checkPage(5);
        doc.text(lines[i], lm + lw, y);
        y += 5;
      }
    };

    const drawPolicySection = (heading, text) => {
      if (!text) return;
      drawSectionHeading(heading);
      drawBodyText(text);
      y += 3;
    };

    // ── Title block ──
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(43, 87, 154);
    const titleLines = doc.splitTextToSize(syl.courseTitle || courseName || 'Course Syllabus', rm - lm);
    titleLines.forEach((line) => {
      doc.text(line, lm, y);
      y += 7;
    });
    y += 1;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    if (syl.semester) {
      doc.text(syl.semester, lm, y);
      y += 5;
    }
    const metaLines = [
      syl.credits && `Credits: ${syl.credits}`,
      syl.meetingPattern && `Meeting: ${syl.meetingPattern}`,
      syl.location && `Location: ${syl.location}`,
      syl.deliveryMode && `Delivery: ${syl.deliveryMode}`,
      syl.prerequisites && `Prerequisites: ${syl.prerequisites}`,
    ].filter(Boolean);
    doc.setFontSize(9);
    metaLines.forEach((l) => {
      doc.text(l, lm, y);
      y += 4.5;
    });
    doc.setTextColor(0, 0, 0);
    y += 3;

    // ── Instructor Information ──
    const instrLines = [
      syl.instructor && `Instructor: ${syl.instructor}`,
      syl.instructorEmail && `Email: ${syl.instructorEmail}`,
      syl.officeHours && `Office Hours: ${syl.officeHours}`,
      syl.officeLocation && `Office: ${syl.officeLocation}`,
    ].filter(Boolean);
    if (instrLines.length) {
      drawSectionHeading('Instructor Information');
      instrLines.forEach((l) => drawBoldLabel(l.split(': ')[0], l.split(': ').slice(1).join(': ')));
      y += 3;
    }
    drawPolicySection('Instructor Bio', syl.instructorBio);

    // ── Course Description ──
    if (syl.courseDescription) {
      drawSectionHeading('Course Description');
      drawBodyText(syl.courseDescription);
      y += 3;
    }
    drawPolicySection('Getting Started', syl.gettingStarted);
    drawPolicySection('Learner Introduction Activity', syl.learnerIntroActivity);

    // ── Learning Outcomes ──
    if (syl.learningOutcomes?.length) {
      drawSectionHeading('Student Learning Outcomes');
      drawBodyText('Upon successful completion of this course, students will be able to:');
      syl.learningOutcomes.forEach((o, i) => drawBodyText(`${i + 1}. ${o}`, 4));
      y += 3;
    }
    if (syl.outcomeAlignmentMatrix?.length) {
      drawSectionHeading('Outcome & Assessment Alignment');
      syl.outcomeAlignmentMatrix.forEach((row) => drawBodyText(`• ${formatOutcomeAlignment(row)}`, 4));
      y += 3;
    }

    // ── Required Texts ──
    if (syl.requiredTexts?.length) {
      drawSectionHeading('Required Texts & Materials');
      syl.requiredTexts.forEach((t) => drawBodyText(`• ${formatRequiredText(t)}`, 4));
      y += 3;
    }

    // ── Course Requirements & Grading ──
    const reqs = syl.courseRequirements || syl.gradingPolicy || [];
    if (reqs.length) {
      drawSectionHeading('Course Requirements & Grading');
      checkPage(20);
      const hasDesc = reqs.some((r) => r.description);
      if (hasDesc) {
        autoTable(doc, {
          head: [['Component', 'Weight', 'Description']],
          body: reqs.map((g) => [g.name || g.component || '', g.weight || '', g.description || '']),
          startY: y,
          styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 22 }, 2: { cellWidth: 'auto' } },
          margin: { left: lm, right: 14 },
        });
      } else {
        autoTable(doc, {
          head: [['Component', 'Weight']],
          body: reqs.map((g) => [g.name || g.component || '', g.weight || '']),
          startY: y,
          styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30 } },
          margin: { left: lm, right: 14 },
        });
      }
      y = doc.lastAutoTable.finalY + 5;
    }

    // ── Grading Scale ──
    if (syl.gradingScale?.length) {
      drawSectionHeading('Grading Scale');
      const scaleText = syl.gradingScale.map((g) => `${g.grade}: ${g.range}`).join('   |   ');
      drawBodyText(scaleText);
      y += 3;
    }

    // ── Course Schedule ──
    if (syl.weeklySchedule?.length) {
      drawSectionHeading('Course Schedule');
      checkPage(20);
      const hasDates = syl.weeklySchedule.some((w) => w.dates);
      if (hasDates) {
        autoTable(doc, {
          head: [['Week', 'Dates', 'Topic', 'Readings', 'Assignments']],
          body: syl.weeklySchedule.map((w) => [
            w.week || '',
            w.dates || '',
            w.topic || '',
            w.readings || '',
            w.assignments || '',
          ]),
          startY: y,
          styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          columnStyles: {
            0: { cellWidth: 13 },
            1: { cellWidth: 22 },
            2: { cellWidth: 45 },
            3: { cellWidth: 48 },
            4: { cellWidth: 48 },
          },
          margin: { left: lm, right: 14 },
        });
      } else {
        autoTable(doc, {
          head: [['Week', 'Topic', 'Readings', 'Assignments']],
          body: syl.weeklySchedule.map((w) => [w.week || '', w.topic || '', w.readings || '', w.assignments || '']),
          startY: y,
          styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 252] },
          columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 50 }, 2: { cellWidth: 55 }, 3: { cellWidth: 55 } },
          margin: { left: lm, right: 14 },
        });
      }
      y = doc.lastAutoTable.finalY + 5;
    }

    // ── Course Policies ──
    drawPolicySection('Attendance & Participation', syl.attendancePolicy);
    drawPolicySection('Late Work Policy', syl.latePolicy);
    drawPolicySection('Communication Policy', syl.communicationPolicy);
    drawPolicySection('Technology & Device Policy', syl.technologyPolicy);
    drawPolicySection('Technical Skills', syl.technicalSkills);
    drawPolicySection('Generative AI Policy', syl.aiPolicy);

    // ── University Policies & Resources ──
    drawPolicySection('Academic Integrity', syl.academicIntegrity);
    drawPolicySection('Technical Support', syl.technicalSupport);
    drawPolicySection('Disability & Accessibility Accommodations', syl.accommodations);
    drawPolicySection('Mental Health & Wellness Resources', syl.mentalHealth);
    drawPolicySection('Title IX / Non-Discrimination', syl.titleIX);
    drawPolicySection('Student Support Services', syl.supportServices);
    drawPolicySection('Data Privacy', syl.dataPrivacy);

    // ── Important Dates ──
    if (syl.importantDates?.length) {
      drawSectionHeading('Important Dates');
      syl.importantDates.forEach((d) => drawBoldLabel(d.date || '', d.event || ''));
    }
    if (syl.suggestedReviewDate || syl.contentOwnerGroup) {
      drawSectionHeading('Maintenance Notes');
      if (syl.suggestedReviewDate) drawBoldLabel('Suggested Review Date', syl.suggestedReviewDate);
      if (syl.contentOwnerGroup) drawBoldLabel('Content Owner Group', syl.contentOwnerGroup);
    }

    const fileName = `${courseName || 'Course'} - Syllabus.pdf`;
    doc.save(fileName);
    return fileName;
  }

  // All other deliverables: generic table-based PDF
  const { headers, rows } = deliverableToCsvRows(featureId, data);
  if (rows.length === 0) throw new Error('No data to export');

  const landscape = headers.length > 5;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 15);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 22,
    styles: {
      fontSize: 7,
      cellPadding: 2,
      overflow: 'linebreak',
      lineWidth: 0.1,
      lineColor: [180, 198, 231],
      valign: 'top',
    },
    headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [245, 247, 252] },
    margin: { top: 22, left: 8, right: 8 },
    tableWidth: 'auto',
  });

  const fileName = `${courseName || 'Course'} - ${label}.pdf`;
  doc.save(fileName);
  return fileName;
}

// ════════════════════════════════════════════════════════════════
