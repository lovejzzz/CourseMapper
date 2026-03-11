import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import EditProposalPanel from '../EditProposalPanel';
import {
  QualityBadge, updatePath, E, ResizableTh, SaveToBankButton,
  StreamingBanner, ErrorState, WaitingState, EmptyState,
  CollapsibleCard, Badge, BloomsTag, SectionHeading,
  FEATURE_META
} from './shared/SharedComponents';

// ─── Slide type detection ───
function getSlideType(slide, index, deckTitle) {
  if (!slide) return 'content';
  // Prefer explicit type from AI
  if (slide.type) {
    const t = slide.type.toLowerCase();
    if (t === 'title') return 'title';
    if (t === 'agenda') return 'agenda';
    if (t === 'objectives' || t === 'learning_objectives') return 'objectives';
    if (t === 'bridge') return 'bridge';
    if (t === 'example') return 'example';
    if (t === 'keyterm' || t === 'key_term' || t === 'definition') return 'keyTerm';
    if (t === 'summary' || t === 'closing') return 'summary';
    if (t === 'activity' || t === 'exercise') return 'activity';
    if (t === 'question' || t === 'discussion') return 'question';
    if (t === 'content') return 'content';
  }
  const t = (slide.title || '').toLowerCase();
  if (index === 0) return 'title';
  if (/^agenda|outline|overview|today/i.test(t)) return 'agenda';
  if (/^learning obj|by the end|objectives/i.test(t)) return 'objectives';
  if (/bridge|last\s*time|previously/i.test(t)) return 'bridge';
  if (/example|case\s*study|scenario|illustration/i.test(t)) return 'example';
  if (/key\s*term|definition|concept|glossary/i.test(t)) return 'keyTerm';
  if (/summary|recap|key\s*take|wrap|review|conclusion/i.test(t)) return 'summary';
  if (/discussion|activity|exercise|practice|workshop|group/i.test(t)) return 'activity';
  if (/question|q\s*&\s*a|quiz/i.test(t)) return 'question';
  if (/thank|end$|closing/i.test(t)) return 'closing';
  return 'content';
}

// ─── Rich university slide color themes ───
const SLIDE_THEMES = [
  { name: 'Navy & Gold', primary: '#1E3A5F', secondary: '#2E86AB', accent: '#F6C90E', light: '#EEF4FF', sidebar: '#1E3A5F', titleText: '#FFFFFF', bodyText: '#1A1A2E', subtleText: '#6B7FA3' },
  { name: 'Forest & Amber', primary: '#1B4332', secondary: '#52B788', accent: '#F4A261', light: '#F0FFF4', sidebar: '#1B4332', titleText: '#FFFFFF', bodyText: '#1B2B1F', subtleText: '#52796F' },
  { name: 'Purple & Orange', primary: '#4A1C96', secondary: '#7B2FBE', accent: '#FF6B35', light: '#FAF5FF', sidebar: '#4A1C96', titleText: '#FFFFFF', bodyText: '#2D1B40', subtleText: '#7C3AED' },
  { name: 'Crimson & Gold', primary: '#8B0000', secondary: '#C62828', accent: '#FFD700', light: '#FFF9F9', sidebar: '#8B0000', titleText: '#FFFFFF', bodyText: '#2D0A0A', subtleText: '#9E3030' },
  { name: 'Ocean & Cyan', primary: '#0C3547', secondary: '#1565C0', accent: '#00BCD4', light: '#F0FBFF', sidebar: '#0C3547', titleText: '#FFFFFF', bodyText: '#0A1628', subtleText: '#2196F3' },
];

// ─── SVG decorative elements for slides ───
function SlideDecor({ type, theme }) {
  const p = theme?.primary || '#1E3A5F';
  const s = theme?.secondary || '#2E86AB';
  const a = theme?.accent || '#F6C90E';
  const l = theme?.light || '#EEF4FF';

  if (type === 'title') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill={p} />
      <circle cx="82%" cy="22%" r="22%" fill={s} fillOpacity="0.35" />
      <circle cx="8%" cy="82%" r="14%" fill={a} fillOpacity="0.15" />
      <rect x="0" y="90%" width="100%" height="10%" fill={a} fillOpacity="0.18" />
      <line x1="7%" y1="8%" x2="30%" y2="8%" stroke={a} strokeWidth="1.5" strokeOpacity="0.35" />
    </svg>
  );
  if (type === 'summary' || type === 'closing') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill={p} />
      <circle cx="88%" cy="18%" r="20%" fill={s} fillOpacity="0.3" />
      <rect x="0" y="92%" width="100%" height="8%" fill={a} fillOpacity="0.22" />
    </svg>
  );
  if (type === 'activity' || type === 'question' || type === 'example') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill={type === 'example' ? '#FFFAF5' : '#FAFBFF'} />
      <rect x="0" y="0" width="100%" height="18%" fill={p} />
      <rect x="0" y="93%" width="100%" height="7%" fill={a} fillOpacity="0.3" />
      <circle cx="90%" cy="60%" r="15%" fill={a} fillOpacity="0.07" />
    </svg>
  );
  if (type === 'bridge') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill="#FFFFFF" />
      <rect x="0" y="0" width="42%" height="100%" fill={p} />
      <circle cx="8%" cy="82%" r="18%" fill={s} fillOpacity="0.3" />
      <rect x="0" y="98.5%" width="100%" height="1.5%" fill={a} />
    </svg>
  );
  if (type === 'keyTerm') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill={l} />
      <rect x="0" y="0" width="1.8%" height="100%" fill={p} />
      <circle cx="92%" cy="15%" r="18%" fill={s} fillOpacity="0.06" />
      <circle cx="8%" cy="88%" r="12%" fill={a} fillOpacity="0.06" />
    </svg>
  );
  if (type === 'agenda' || type === 'objectives') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill={type === 'objectives' ? l : '#FFFFFF'} />
      <rect x="0" y="0" width="1.8%" height="100%" fill={p} />
      <rect x="1.8%" y="0" width="100%" height="20%" fill={type === 'objectives' ? p : s} fillOpacity="0.95" />
      <circle cx="92%" cy="80%" r="18%" fill={l} fillOpacity="0.8" />
    </svg>
  );
  // content default — left sidebar + top accent
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill="#FFFFFF" />
      <rect x="0" y="0" width="1.8%" height="100%" fill={p} />
      <rect x="1.8%" y="0" width="100%" height="19%" fill={l} />
      <rect x="1.8%" y="18.5%" width="100%" height="0.8%" fill={a} fillOpacity="0.85" />
      <circle cx="92%" cy="88%" r="14%" fill={p} fillOpacity="0.03" />
    </svg>
  );
}

// ── Extract lesson number from a title like "Lesson 6: Housing Policy..." ──
function extractLessonNumber(title, fallback) {
  if (!title) return fallback;
  const m = title.match(/^(?:Lesson|Week)\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : fallback;
}

// ─── Add-bullet button for slides ───
function AddBulletBtn({ dataKey, deckIndex, slideIndex, bulletsKey, currentCount, onEdit }) {
  if (!onEdit) return null;
  return (
    <button
      onClick={() => onEdit([dataKey, deckIndex, 'slides', slideIndex, bulletsKey, currentCount], 'New point')}
      className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-500 transition-colors opacity-0 group-hover/slide:opacity-100"
      title="Add bullet point"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Add point
    </button>
  );
}

// ─── Progress dots component ───
function ProgressDots({ slideIndex, totalSlides, theme, isDark }) {
  const maxDots = Math.min(totalSlides, 20);
  return (
    <div className="absolute bottom-1.5 left-4 flex gap-1 z-10">
      {Array.from({ length: maxDots }, (_, i) => (
        <div key={i} className="w-1.5 h-1.5 rounded-full transition-all" style={{
          background: i === slideIndex ? theme.accent : (isDark ? 'rgba(255,255,255,0.3)' : theme.primary),
          opacity: i === slideIndex ? 1 : 0.3,
        }} />
      ))}
    </div>
  );
}

// ─── Individual slide renderer ───
function SlideCanvas({ slide, slideIndex, totalSlides, deckTitle, dataKey, deckIndex, lessonNumber, onEdit, themeIndex }) {
  if (!slide) return null;
  const type = getSlideType(slide, slideIndex, deckTitle);
  const bullets = slide.bullets || slide.bulletPoints || [];
  const bulletsKey = slide.bullets ? 'bullets' : 'bulletPoints';
  const theme = themeIndex !== undefined && themeIndex !== null ? SLIDE_THEMES[themeIndex] : SLIDE_THEMES[(deckIndex || 0) % SLIDE_THEMES.length];
  const useTwoCol = type === 'content' && bullets.length >= 4;

  const headingFont = "'Montserrat', 'Inter', system-ui, sans-serif";
  const bodyFont = "'Open Sans', 'Inter', system-ui, sans-serif";

  // ── TITLE SLIDE ──────────────────────────────────────────────────────────
  if (type === 'title') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: headingFont }}>
      <SlideDecor type="title" theme={theme} />
      <div className="relative z-10 flex flex-col h-full px-10 pt-9 pb-7">
        <div className="mb-3">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: theme.accent }}>
            LESSON {lessonNumber || (deckIndex || 0) + 1}
          </span>
        </div>
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight mb-3" style={{ color: theme.titleText, textShadow: '0 1px 8px rgba(0,0,0,0.18)', fontFamily: headingFont, maxWidth: '60%' }}>
          <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[26px] font-extrabold text-white leading-tight" />
        </h1>
        <div className="mb-3 w-16 h-1 rounded-full" style={{ background: theme.accent }} />
        {bullets.length > 0 && (
          <p className="text-[14px] leading-relaxed" style={{ color: 'rgba(220,235,255,0.88)', maxWidth: '58%', fontFamily: bodyFont }}>
            <E value={bullets[0]} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, 0]} onEdit={onEdit} className="text-[14px] leading-relaxed" />
          </p>
        )}
        {deckTitle && <p className="mt-auto text-[9px] tracking-widest uppercase font-medium" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: bodyFont }}>
          Course: <E value={deckTitle} path={[dataKey, deckIndex, 'lessonTitle']} onEdit={onEdit} className="text-[9px] tracking-widest uppercase font-medium" />
        </p>}
      </div>
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} theme={theme} isDark />
      <div className="absolute bottom-2.5 right-3.5 text-[9px] font-bold z-10 px-2 py-0.5 rounded" style={{ background: theme.accent, color: theme.primary }}>
        {slideIndex + 1} / {totalSlides}
      </div>
    </div>
  );

  // ── OBJECTIVES SLIDE ─────────────────────────────────────────────────────
  if (type === 'objectives') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: bodyFont }}>
      <SlideDecor type="objectives" theme={theme} />
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex flex-col justify-center px-8 pb-1" style={{ paddingLeft: '10%', height: '22%' }}>
          <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-0.5" style={{ color: theme.accent }}>LEARNING OBJECTIVES</p>
          <h2 className="text-[18px] font-bold leading-tight" style={{ color: '#FFFFFF', fontFamily: headingFont }}>
            <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[18px] font-bold text-white leading-tight" />
          </h2>
        </div>
        <div className="flex-1 px-7 pt-3 pb-4 overflow-hidden" style={{ paddingLeft: '10%' }}>
          {bullets.length <= 4 ? (
            <div className="grid grid-cols-2 gap-3">
              {bullets.slice(0, 4).map((b, k) => (
                <div key={k} className="bg-white rounded-lg border p-3 shadow-sm" style={{ borderColor: theme.secondary + '40' }}>
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold" style={{ background: theme.secondary, color: '#FFFFFF' }}>{k + 1}</span>
                    <span className="text-[11px] leading-snug" style={{ color: theme.bodyText }}>
                      <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[11px] leading-snug" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ol className="space-y-2.5">
              {bullets.slice(0, 6).map((b, k) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold shadow-sm" style={{ background: k === 0 ? theme.accent : theme.light, color: k === 0 ? theme.primary : theme.secondary }}>{k + 1}</span>
                  <span className={`text-[13px] leading-snug ${k === 0 ? 'font-semibold' : ''}`} style={{ color: k === 0 ? theme.bodyText : '#555' }}>
                    <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[13px] leading-snug" />
                  </span>
                </li>
              ))}
            </ol>
          )}
          <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
        </div>
      </div>
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} theme={theme} />
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10" style={{ color: theme.primary + 'B3' }}>{slideIndex + 1} / {totalSlides}</div>
    </div>
  );

  // ── AGENDA SLIDE ─────────────────────────────────────────────────────────
  if (type === 'agenda') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: bodyFont }}>
      <SlideDecor type="agenda" theme={theme} />
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex flex-col justify-center px-8 pb-1" style={{ paddingLeft: '10%', height: '22%' }}>
          <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-0.5" style={{ color: theme.accent }}>TODAY'S AGENDA</p>
          <h2 className="text-[18px] font-bold leading-tight" style={{ color: '#FFFFFF', fontFamily: headingFont }}>
            <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[18px] font-bold text-white leading-tight" />
          </h2>
        </div>
        <div className="flex-1 px-7 pt-3 pb-4 overflow-hidden" style={{ paddingLeft: '10%' }}>
          <ol className="space-y-2.5">
            {bullets.slice(0, 6).map((b, k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold shadow-sm" style={{ background: k === 0 ? theme.accent : theme.light, color: k === 0 ? theme.primary : theme.secondary }}>
                  {k + 1}
                </span>
                <span className={`text-[13px] leading-snug ${k === 0 ? 'font-semibold' : ''}`} style={{ color: k === 0 ? theme.bodyText : '#555' }}>
                  <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[13px] leading-snug" />
                </span>
              </li>
            ))}
          </ol>
          <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
        </div>
      </div>
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} theme={theme} />
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10" style={{ color: theme.primary + 'B3' }}>{slideIndex + 1} / {totalSlides}</div>
    </div>
  );

  // ── BRIDGE / RECAP SLIDE ─────────────────────────────────────────────────
  if (type === 'bridge') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: bodyFont }}>
      <SlideDecor type="bridge" theme={theme} />
      <div className="relative z-10 flex h-full">
        {/* Left panel — recap */}
        <div className="w-[42%] flex flex-col px-6 py-5">
          <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-1" style={{ color: theme.accent }}>LAST TIME</p>
          <h2 className="text-[15px] font-bold leading-tight mb-3" style={{ color: '#FFFFFF', fontFamily: headingFont }}>
            <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[15px] font-bold text-white leading-tight" />
          </h2>
          <ul className="space-y-2 flex-1">
            {bullets.slice(0, Math.ceil(bullets.length / 2)).map((b, k) => (
              <li key={k} className="flex items-start gap-2 text-[11px] leading-relaxed" style={{ color: 'rgba(220,235,255,0.85)' }}>
                <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ color: theme.accent }}>
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[11px] leading-relaxed" />
              </li>
            ))}
          </ul>
        </div>
        {/* Arrow divider */}
        <div className="flex items-center justify-center w-[4%]">
          <span className="text-[22px] font-bold" style={{ color: theme.accent }}>→</span>
        </div>
        {/* Right panel — today */}
        <div className="w-[54%] flex flex-col px-6 py-5">
          <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-1" style={{ color: theme.primary }}>TODAY</p>
          <ul className="space-y-2.5 flex-1 pt-2">
            {bullets.slice(Math.ceil(bullets.length / 2)).map((b, k) => {
              const idx = Math.ceil(bullets.length / 2) + k;
              return (
                <li key={k} className="flex items-start gap-2.5 text-[12px] leading-relaxed" style={{ color: theme.bodyText }}>
                  <span className="text-[14px] flex-shrink-0" style={{ color: theme.secondary }}>▶</span>
                  <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, idx]} onEdit={onEdit} className="text-[12px] leading-relaxed" />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} theme={theme} />
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10" style={{ color: theme.primary + 'B3' }}>{slideIndex + 1} / {totalSlides}</div>
    </div>
  );

  // ── EXAMPLE / CASE STUDY SLIDE ───────────────────────────────────────────
  if (type === 'example') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: bodyFont }}>
      <SlideDecor type="example" theme={theme} />
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center gap-3 px-8" style={{ height: '20%' }}>
          <span className="px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wide uppercase flex-shrink-0" style={{ background: theme.accent, color: theme.primary }}>EXAMPLE</span>
          <h2 className="text-[16px] font-bold leading-tight text-white flex-1 min-w-0" style={{ fontFamily: headingFont }}>
            <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[16px] font-bold text-white" />
          </h2>
        </div>
        <div className="flex-1 mx-5 mb-3 mt-1 overflow-hidden">
          {/* Left accent border */}
          <div className="flex h-full">
            <div className="w-1 rounded-full flex-shrink-0 mr-4" style={{ background: theme.accent }} />
            <div className="flex-1 flex flex-col">
              <ul className="space-y-2 flex-1">
                {bullets.slice(0, -1).map((b, k) => (
                  <li key={k} className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: theme.bodyText }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2" style={{ background: theme.secondary }} />
                    <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[13px] leading-relaxed" />
                  </li>
                ))}
              </ul>
              {/* Key takeaway */}
              {bullets.length > 1 && (
                <div className="mt-2 px-3 py-2 rounded-lg border" style={{ background: theme.light, borderColor: theme.accent + '40' }}>
                  <p className="text-[11px] font-semibold" style={{ color: theme.primary }}>
                    💡 <E value={bullets[bullets.length - 1]} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, bullets.length - 1]} onEdit={onEdit} className="text-[11px] font-semibold" />
                  </p>
                </div>
              )}
            </div>
          </div>
          <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
        </div>
      </div>
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} theme={theme} />
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10" style={{ color: theme.primary + 'B3' }}>{slideIndex + 1} / {totalSlides}</div>
    </div>
  );

  // ── KEY CONCEPT / DEFINITION SLIDE ───────────────────────────────────────
  if (type === 'keyTerm') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: bodyFont }}>
      <SlideDecor type="keyTerm" theme={theme} />
      <div className="relative z-10 flex flex-col h-full items-center justify-center px-10 py-6">
        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: theme.primary }}>KEY CONCEPT</p>
        {/* Central card */}
        <div className="bg-white rounded-xl border-2 shadow-lg px-8 py-5 max-w-[75%] text-center" style={{ borderColor: theme.secondary + '60' }}>
          <div className="w-full h-1 rounded-full mb-4 mx-auto" style={{ background: theme.accent, maxWidth: '60%' }} />
          <h2 className="text-[20px] font-bold leading-tight mb-2" style={{ color: theme.primary, fontFamily: headingFont }}>
            <E value={bullets[0] || slide.title} path={bullets[0] ? [dataKey, deckIndex, 'slides', slideIndex, bulletsKey, 0] : [dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[20px] font-bold leading-tight" />
          </h2>
        </div>
        {/* Explanatory text below */}
        {bullets.length > 1 && (
          <div className="mt-4 max-w-[70%] text-center">
            {bullets.slice(1).map((b, k) => (
              <p key={k} className="text-[12px] leading-relaxed mb-1" style={{ color: theme.bodyText }}>
                <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k + 1]} onEdit={onEdit} className="text-[12px] leading-relaxed" />
              </p>
            ))}
          </div>
        )}
      </div>
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} theme={theme} />
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10" style={{ color: theme.primary + 'B3' }}>{slideIndex + 1} / {totalSlides}</div>
    </div>
  );

  // ── SUMMARY / CLOSING SLIDE ──────────────────────────────────────────────
  if (type === 'summary' || type === 'closing') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: headingFont }}>
      <SlideDecor type="summary" theme={theme} />
      <div className="relative z-10 flex flex-col h-full px-12 py-7" style={{ paddingLeft: '8%' }}>
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-1" style={{ color: theme.accent }}>KEY TAKEAWAYS</p>
        <h2 className="text-[22px] font-bold mb-2 leading-tight" style={{ color: '#FFFFFF' }}>
          <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[22px] font-bold text-white" />
        </h2>
        <div className="w-14 h-1 rounded-full mb-4" style={{ background: theme.accent }} />
        <ul className="space-y-3 flex-1" style={{ fontFamily: bodyFont }}>
          {bullets.map((b, k) => (
            <li key={k} className="flex items-start gap-3 text-[14px] leading-relaxed" style={{ color: 'rgba(220,235,255,0.9)' }}>
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ color: theme.accent }}>
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[14px] leading-relaxed" />
            </li>
          ))}
        </ul>
        <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
      </div>
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} theme={theme} isDark />
      <div className="absolute bottom-2.5 right-3.5 text-[9px] font-bold z-10 px-2 py-0.5 rounded" style={{ background: theme.accent, color: theme.primary }}>
        {slideIndex + 1} / {totalSlides}
      </div>
    </div>
  );

  // ── ACTIVITY / QUESTION SLIDE ────────────────────────────────────────────
  if (type === 'activity' || type === 'question') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: bodyFont }}>
      <SlideDecor type="activity" theme={theme} />
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center gap-3 px-8" style={{ height: '20%' }}>
          <span className="px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wide uppercase flex-shrink-0" style={{ background: theme.accent, color: theme.primary }}>
            {type === 'question' ? 'Q&A' : 'ACTIVITY'}
          </span>
          <h2 className="text-[16px] font-bold leading-tight text-white flex-1 min-w-0" style={{ fontFamily: headingFont }}>
            <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[16px] font-bold text-white" />
          </h2>
          {slide.timer && (
            <span className="text-[10px] font-semibold text-white/80 whitespace-nowrap flex-shrink-0">⏱ <E value={slide.timer} path={[dataKey, deckIndex, 'slides', slideIndex, 'timer']} onEdit={onEdit} className="text-[10px] font-semibold" /></span>
          )}
        </div>
        <div className="flex-1 mx-5 mb-4 mt-1 rounded-xl border-2 px-6 py-4 overflow-hidden" style={{ background: 'rgba(255,252,248,0.97)', borderColor: theme.accent + '60' }}>
          <ul className="space-y-3">
            {bullets.map((b, k) => (
              <li key={k} className="flex items-start gap-3 text-[13px] leading-relaxed" style={{ color: theme.bodyText }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5" style={{ background: theme.accent + '30', color: theme.primary }}>
                  {k + 1}
                </span>
                <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[13px] leading-relaxed" />
              </li>
            ))}
          </ul>
          <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
        </div>
      </div>
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} theme={theme} />
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10" style={{ color: theme.primary + 'B3' }}>{slideIndex + 1} / {totalSlides}</div>
    </div>
  );

  // ── DEFAULT CONTENT SLIDE (with two-column for 4+ bullets) ───────────────
  return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: bodyFont }}>
      <SlideDecor type="content" theme={theme} />
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center px-7" style={{ paddingLeft: '9%', height: '22%' }}>
          <h2 className="text-[18px] font-bold leading-tight" style={{ color: theme.primary, fontFamily: headingFont }}>
            <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[18px] font-bold leading-tight" />
          </h2>
        </div>
        <div className="flex-1 px-7 pt-2 pb-4 overflow-hidden" style={{ paddingLeft: '9%' }}>
          {useTwoCol ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              {bullets.map((b, k) => (
                <div key={k} className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: k === 0 ? theme.bodyText : '#444444' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: theme.secondary }} />
                  <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[13px] leading-relaxed" />
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-3">
              {bullets.map((b, k) => (
                <li key={k} className="flex items-start gap-3 text-[14px] leading-relaxed" style={{ color: k === 0 ? theme.bodyText : '#444444' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: theme.secondary }} />
                  <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[14px] leading-relaxed" />
                </li>
              ))}
            </ul>
          )}
          <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
        </div>
      </div>
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} theme={theme} />
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10 px-2 py-0.5 rounded" style={{ background: theme.primary, color: '#FFFFFF' }}>
        {slideIndex + 1} / {totalSlides}
      </div>
    </div>
  );
}

// ─── Slide thumbnail (mini version) ───
function SlideThumbnail({ slide, slideIndex, deckTitle, deckIndex, themeIndex }) {
  const type = getSlideType(slide, slideIndex, deckTitle);
  const bullets = slide ? (slide.bullets || slide.bulletPoints || []) : [];
  const isDark = type === 'title' || type === 'summary' || type === 'closing';
  const theme = themeIndex !== undefined && themeIndex !== null ? SLIDE_THEMES[themeIndex] : SLIDE_THEMES[(deckIndex || 0) % SLIDE_THEMES.length];

  const decorType = type === 'closing' ? 'summary' : (type === 'objectives' ? 'objectives' : type);

  return (
    <div className="w-full aspect-[16/10] rounded overflow-hidden relative" style={{ fontSize: 0 }}>
      <SlideDecor type={decorType} theme={theme} />
      <div className="relative z-10 flex flex-col h-full px-2 py-1.5 overflow-hidden">
        {type === 'title' ? (
          <div className="flex-1 flex flex-col justify-center pl-1">
            <p className="text-[6px] font-bold leading-tight truncate max-w-[65%]" style={{ color: theme.titleText, fontFamily: "'Montserrat', sans-serif" }}>{slide?.title || 'Untitled'}</p>
            <div className="w-4 h-0.5 mt-0.5 rounded-full" style={{ background: theme.accent }} />
          </div>
        ) : type === 'bridge' ? (
          <div className="flex h-full">
            <div className="w-[42%] flex flex-col justify-center pl-1">
              <p className="text-[4px] font-bold truncate" style={{ color: theme.accent }}>RECAP</p>
              <p className="text-[5px] font-bold leading-tight truncate" style={{ color: theme.titleText }}>{slide?.title || ''}</p>
            </div>
            <div className="w-[58%] flex flex-col justify-center pl-1.5">
              <p className="text-[4px] font-bold" style={{ color: theme.primary }}>TODAY</p>
              {bullets.slice(Math.ceil(bullets.length / 2), Math.ceil(bullets.length / 2) + 2).map((b, k) => (
                <p key={k} className="text-[4px] leading-tight truncate" style={{ color: '#666' }}>▶ {b}</p>
              ))}
            </div>
          </div>
        ) : type === 'keyTerm' ? (
          <div className="flex-1 flex flex-col items-center justify-center px-1">
            <p className="text-[4px] font-bold tracking-wider mb-0.5" style={{ color: theme.primary }}>KEY CONCEPT</p>
            <div className="bg-white rounded px-2 py-1 border text-center" style={{ borderColor: theme.secondary + '40' }}>
              <p className="text-[5px] font-bold leading-tight" style={{ color: theme.primary }}>{(bullets[0] || slide?.title || 'Concept').substring(0, 40)}</p>
            </div>
          </div>
        ) : isDark ? (
          <>
            <p className="text-[6px] font-bold leading-tight truncate pl-1 mt-1" style={{ color: theme.accent }}>{slide?.title || 'Untitled'}</p>
            <div className="w-3 h-px mt-0.5 mb-0.5 ml-1 rounded-full" style={{ background: theme.accent + '60' }} />
            <div className="space-y-px flex-1 overflow-hidden pl-1">
              {bullets.slice(0, 3).map((b, k) => (
                <p key={k} className="text-[4px] leading-tight truncate" style={{ color: 'rgba(220,235,255,0.8)' }}>✓ {b}</p>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-[6px] font-bold leading-tight truncate" style={{ color: (type === 'agenda' || type === 'objectives') ? '#FFFFFF' : theme.primary, paddingLeft: type === 'content' ? '8%' : '0' }}>{slide?.title || 'Untitled'}</p>
            <div className="w-3 h-px rounded-full mt-0.5 mb-0.5" style={{ background: theme.accent, marginLeft: type === 'content' ? '8%' : '0' }} />
            <div className="space-y-px flex-1 overflow-hidden" style={{ paddingLeft: type === 'content' ? '8%' : '0' }}>
              {bullets.slice(0, 3).map((b, k) => (
                <p key={k} className="text-[4px] leading-tight truncate" style={{ color: '#666' }}>
                  {type === 'agenda' || type === 'objectives' ? `${k + 1}. ` : type === 'example' ? '• ' : '• '}{b}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Slide Decks (Google-Slides-style UI) ───
export default function SlideDecksView({ data, isStreaming, onEdit, slideTheme, onSlideThemeChange }) {
  const [activeDeck, setActiveDeck] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [editingDeckTab, setEditingDeckTab] = useState(null);
  const [deckTabDraft, setDeckTabDraft] = useState('');
  const deckTabRef = useRef(null);

  // ── All hooks MUST come before any early returns (Rules of Hooks) ──
  const key = data?.decks ? 'decks' : 'slideDecks';
  const decks = data?.[key] || [];

  const commitDeckTitle = useCallback((i) => {
    if (deckTabDraft && deckTabDraft !== (decks[i]?.lessonTitle || '') && onEdit) {
      onEdit([key, i, 'lessonTitle'], deckTabDraft);
    }
    setEditingDeckTab(null);
  }, [deckTabDraft, decks, key, onEdit]);

  useEffect(() => {
    if (editingDeckTab !== null && deckTabRef.current) {
      deckTabRef.current.focus();
      deckTabRef.current.select();
    }
  }, [editingDeckTab]);

  // ── Early returns after all hooks ──
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  if (decks.length === 0 && !isStreaming) return <EmptyState />;

  const deck = decks[activeDeck] || decks[0];
  const slides = deck?.slides || [];
  const slide = slides[activeSlide] || slides[0];
  const deckTitle = deck?.lessonTitle || '';
  const themeIndex = slideTheme !== undefined && slideTheme !== null ? slideTheme : undefined;

  const handleDeckChange = (i) => { setActiveDeck(i); setActiveSlide(0); };

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* Theme picker + Deck tabs row */}
      <div className="flex items-center gap-0 px-2 pt-2 border-b border-slate-200/60 bg-slate-50/50 overflow-x-auto flex-shrink-0">
        {/* Theme picker */}
        <div className="flex items-center gap-1.5 mr-3 pl-1 flex-shrink-0">
          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">Theme</span>
          {SLIDE_THEMES.map((t, ti) => (
            <button
              key={ti}
              onClick={() => onSlideThemeChange?.(ti)}
              title={t.name}
              aria-label={`Select ${t.name} theme`}
              aria-pressed={themeIndex === ti}
              className={`w-5 h-5 rounded-full border-2 transition-all flex-shrink-0 ${
                themeIndex === ti
                  ? 'ring-2 ring-offset-1 ring-indigo-400 scale-110'
                  : 'hover:scale-110 opacity-70 hover:opacity-100'
              }`}
              style={{
                background: `linear-gradient(135deg, ${t.primary} 50%, ${t.accent} 50%)`,
                borderColor: themeIndex === ti ? t.primary : 'transparent',
              }}
            />
          ))}
        </div>
        <div className="w-px h-5 bg-slate-200/60 mr-2 flex-shrink-0" />
        {/* Deck tabs */}
        {decks.length > 1 && decks.map((d, i) => (
          editingDeckTab === i ? (
            <input
              key={i}
              ref={deckTabRef}
              value={deckTabDraft}
              onChange={e => setDeckTabDraft(e.target.value)}
              onBlur={() => commitDeckTitle(i)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitDeckTitle(i); }
                if (e.key === 'Escape') { setEditingDeckTab(null); }
              }}
              className="px-2 py-1.5 text-[11px] font-medium border border-indigo-300 rounded bg-white text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[100px]"
            />
          ) : (
            <button
              key={i}
              onClick={() => {
                if (i === activeDeck && onEdit) {
                  setEditingDeckTab(i);
                  setDeckTabDraft(d.lessonTitle || `Deck ${i + 1}`);
                } else {
                  handleDeckChange(i);
                }
              }}
              title={i === activeDeck && onEdit ? 'Click to edit title' : undefined}
              className={`px-4 py-2 text-[11px] font-medium whitespace-nowrap transition-all border-b-2 ${
                i === activeDeck
                  ? 'border-indigo-500 text-indigo-700 bg-white'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100/60'
              } ${i === activeDeck && onEdit ? 'cursor-text' : ''}`}
            >
              {d.lessonTitle || `Deck ${i + 1}`}
              <span className={`ml-1.5 text-[9px] ${i === activeDeck ? 'text-indigo-400' : 'text-slate-300'}`}>
                ({d.slides?.length || 0})
              </span>
            </button>
          )
        ))}
      </div>

      {/* Main area: thumbnails + preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Thumbnail panel */}
        <div className="w-48 flex-shrink-0 border-r border-slate-200/60 bg-gradient-to-b from-slate-50 to-slate-100/80 overflow-y-auto py-3 px-2.5 space-y-2">
          {slides.map((s, j) => {
            const isActive = j === activeSlide;
            return (
              <button
                key={j}
                onClick={() => setActiveSlide(j)}
                aria-label={`Go to slide ${j + 1}${s.title ? ': ' + s.title : ''}`}
                aria-current={isActive ? 'true' : undefined}
                className={`w-full text-left transition-all group ${
                  isActive ? '' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex gap-2 items-start">
                  <span className={`text-[9px] font-bold mt-2 w-5 text-right flex-shrink-0 tabular-nums ${isActive ? 'text-indigo-500' : 'text-slate-400'}`}>{j + 1}</span>
                  <div className={`flex-1 rounded-md overflow-hidden transition-all ${
                    isActive
                      ? 'ring-2 ring-indigo-500 ring-offset-1 shadow-md'
                      : 'ring-1 ring-slate-200 hover:ring-slate-300 shadow-sm'
                  }`}>
                    <SlideThumbnail slide={s} slideIndex={j} deckTitle={deckTitle} deckIndex={activeDeck} themeIndex={themeIndex} />
                  </div>
                </div>
              </button>
            );
          })}
          {isStreaming && slides.length > 0 && (
            <div className="flex items-center justify-center py-3 gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <span className="text-[9px] text-slate-400">Generating...</span>
            </div>
          )}
        </div>

        {/* Right: Slide preview + notes */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-200 dark:bg-slate-800">
          {/* Slide canvas area */}
          <div className="flex-1 flex items-center justify-center p-8 min-h-0">
            {slide ? (
              <div className="w-full max-w-3xl">
                <SlideCanvas
                  slide={slide}
                  slideIndex={activeSlide}
                  totalSlides={slides.length}
                  deckTitle={deckTitle}
                  dataKey={key}
                  deckIndex={activeDeck}
                  lessonNumber={extractLessonNumber(deckTitle, activeDeck + 1)}
                  onEdit={onEdit}
                  themeIndex={themeIndex}
                />

                {/* Navigation bar below slide */}
                <div className="flex items-center justify-between mt-4 px-1">
                  <button
                    onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
                    disabled={activeSlide === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white/60 hover:bg-white hover:text-slate-700 shadow-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Prev
                  </button>
                  <span className="text-[11px] text-slate-500 font-semibold bg-white/60 px-3 py-1 rounded-full shadow-sm tabular-nums">
                    {activeSlide + 1} / {slides.length}
                  </span>
                  <button
                    onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))}
                    disabled={activeSlide >= slides.length - 1}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white/60 hover:bg-white hover:text-slate-700 shadow-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400">
                <p className="text-sm font-medium">No slides yet</p>
                {isStreaming && <p className="text-xs mt-1">Generating...</p>}
              </div>
            )}
          </div>

          {/* Speaker notes panel */}
          {(slide?.notes || slide?.activityType || slide?.bloomsLevel) && (
            <div className="border-t border-slate-300/40 bg-white flex-shrink-0">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="w-full flex items-center gap-2 px-5 py-2 text-left hover:bg-slate-50/80 transition-colors"
                aria-expanded={showNotes}
                aria-label={showNotes ? 'Collapse speaker notes' : 'Expand speaker notes'}
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Speaker Notes</span>
                {/* Metadata chips */}
                <div className="flex items-center gap-1.5 ml-2">
                  {slide?.activityType && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                      <E value={slide.activityType} path={[key, activeDeck, 'slides', activeSlide, 'activityType']} onEdit={onEdit} className="text-[9px] font-semibold text-amber-700" />
                    </span>
                  )}
                  {slide?.timer && (
                    <span className="text-[9px] text-slate-400">⏱ <E value={slide.timer} path={[key, activeDeck, 'slides', activeSlide, 'timer']} onEdit={onEdit} className="text-[9px] text-slate-400" /></span>
                  )}
                  {slide?.bloomsLevel && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">
                      <E value={slide.bloomsLevel} path={[key, activeDeck, 'slides', activeSlide, 'bloomsLevel']} onEdit={onEdit} className="text-[9px] font-semibold text-violet-600" />
                    </span>
                  )}
                </div>
                <svg className={`w-3 h-3 text-slate-400 ml-auto transition-transform ${showNotes ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showNotes && slide?.notes && (
                <div className="px-5 pb-3 max-h-32 overflow-y-auto">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <E value={slide.notes} path={[key, activeDeck, 'slides', activeSlide, 'notes']} onEdit={onEdit} className="text-xs text-slate-600 leading-relaxed" multiline />
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

