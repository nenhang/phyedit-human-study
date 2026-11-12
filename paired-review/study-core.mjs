export const METRICS = ['task', 'flow', 'impact', 'av'];
export const PREFERENCES = ['A', 'tie', 'B', 'unable'];
export const SCORE_VALUES = [0, 1, 2, 3, 4, 'unable'];

export function participantFromCode(value) {
  const match = String(value || '').trim().match(/^(R0[1-8])-[A-Za-z0-9_-]{16,100}$/);
  return match ? match[1] : null;
}

export function assignmentsFor(study, participantId) {
  return (study.assignments[participantId] || []).map(function (assignment) {
    return { ...assignment, pair: study.pairs.find(function (pair) { return pair.id === assignment.pair_id; }) };
  });
}

export function pairReady(pair) {
  return Boolean(pair && pair.ready && pair.instruction && pair.clips.length === 2 && pair.clips.every(function (clip) {
    return clip.media && mediaUrl(clip.media.url) && clip.sha256 && /^[a-f0-9]{64}$/.test(clip.sha256);
  }));
}

export function emptyDraft() {
  return {
    preference: '',
    ratings: { A: { task: null, flow: null, impact: null, av: null }, B: { task: null, flow: null, impact: null, av: null } },
    reason: '',
    watch: { A: { played_seconds: 0, duration: null }, B: { played_seconds: 0, duration: null } },
    receipt: null,
    pending_record: null,
    supersedes_submission_id: null,
    history: []
  };
}

export function draftComplete(draft) {
  return PREFERENCES.includes(draft.preference) && ['A', 'B'].every(function (slot) {
    return METRICS.every(function (metric) { return SCORE_VALUES.includes(draft.ratings[slot][metric]); });
  });
}

export function draftKey(studyId, participantId, pair) {
  return [studyId, participantId, pair.id, pair.fingerprint].join(':');
}

export function mediaUrl(value, base = 'https://review.invalid/') {
  if (!value || /[\u0000-\u001f]/.test(value)) return null;
  try {
    const parsed = new URL(value, base);
    if (parsed.username || parsed.password) return null;
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)) ? parsed.href : null;
  } catch { return null; }
}

export function validGoogleEndpoint(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname === 'script.google.com' && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(parsed.pathname) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch { return false; }
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
}

export function newRecord(study, participantId, assignment, draft, profile) {
  if (!pairReady(assignment.pair) || !draftComplete(draft)) throw new Error('Incomplete review');
  return {
    schema_version: 'paired_video_human_review_v1',
    study_id: study.id,
    study_version: study.version,
    participant_id: participantId,
    pair_id: assignment.pair_id,
    pair_fingerprint: assignment.pair.fingerprint,
    submission_id: globalThis.crypto.randomUUID(),
    supersedes_submission_id: draft.supersedes_submission_id,
    presentation: { A: assignment.A, B: assignment.B },
    preference: draft.preference,
    ratings: structuredClone(draft.ratings),
    reason: String(draft.reason || '').slice(0, 2000),
    watch: structuredClone(draft.watch),
    profile: { consent: Boolean(profile.consent), editing_experience: profile.editing_experience || 'unspecified' },
    client_submitted_at: new Date().toISOString()
  };
}

export function assertDesign(study) {
  const participants = Object.keys(study.assignments);
  if (participants.length !== 8 || study.pairs.length !== 24) throw new Error('Expected eight participants and 24 pairs');
  const seen = new Map(study.pairs.map(function (pair) { return [pair.id, []]; }));
  for (const id of participants) {
    const assignments = study.assignments[id];
    if (assignments.length !== 6 || new Set(assignments.map(function (row) { return row.pair_id; })).size !== 6) throw new Error('Each participant needs six unique pairs');
    for (const row of assignments) {
      const pair = study.pairs.find(function (item) { return item.id === row.pair_id; });
      if (!pair || new Set([row.A, row.B]).size !== 2 || !pair.clips.every(function (clip) { return [row.A, row.B].includes(clip.id); })) throw new Error('Invalid clip binding');
      seen.get(row.pair_id).push({ participant: id, A: row.A, B: row.B });
    }
  }
  for (const rows of seen.values()) {
    if (rows.length !== 2 || rows[0].participant === rows[1].participant || rows[0].A !== rows[1].B || rows[0].B !== rows[1].A) throw new Error('Each pair needs two independent, counterbalanced reviews');
  }
  return true;
}
