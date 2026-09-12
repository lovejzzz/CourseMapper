export function startCourseMapActivity(expectedLessons = 0, now = Date.now()) {
  return {
    startedAt: now,
    lastUpdateAt: now,
    characters: 0,
    expectedLessons,
    draftLessons: [],
    phase: 'preparing',
    attempt: 1,
  };
}

export function receiveCourseMapText(previous, text, partial, now = Date.now()) {
  if (!text || (previous.characters > 0 && text.length >= previous.characters && now - previous.lastUpdateAt < 1000))
    return previous;
  const sessions = Array.isArray(partial?.sessions) ? partial.sessions : [];
  const draftLessons = sessions.flatMap((session, index) =>
    typeof session?.title === 'string' && session.title.trim().length >= 3
      ? [{ number: Number(session.order) || index + 1, title: session.title.trim().slice(0, 140) }]
      : [],
  );
  return { ...previous, lastUpdateAt: now, characters: text.length, draftLessons, phase: 'writing', message: '' };
}

export function receiveCourseMapActivityEvent(previous, event, now = Date.now()) {
  if (!previous.startedAt || (event.task && !['nativeSkeleton', 'course-map'].includes(event.task))) return previous;
  if (event.type === 'localModelProgress') {
    return {
      ...previous,
      lastUpdateAt: now,
      phase: 'preparing',
      message: event.label || 'Preparing AI…',
      modelProgress: event.progress,
      modelPhase: event.runtimePhase,
    };
  }
  if (event.type === 'streamRetryCall') {
    return {
      ...previous,
      lastUpdateAt: now,
      phase: 'retrying',
      message: 'The outline needs another attempt. Retrying automatically…',
      characters: 0,
      draftLessons: [],
    };
  }
  if (event.type === 'providerRequestStart') {
    return {
      ...previous,
      lastUpdateAt: now,
      phase: 'writing',
      message: '',
      characters: 0,
      draftLessons: [],
      attempt: Number(event.attempt) || previous.attempt,
    };
  }
  if (event.type === 'providerResponseDone') {
    return {
      ...previous,
      lastUpdateAt: now,
      phase: 'checking',
      message: 'Checking the outline before showing your lessons…',
    };
  }
  return previous;
}
