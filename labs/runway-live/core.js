// A cue is a held moment: the learner may inspect preview before taking it live.
export const CAMERAS = [
  { id: 1, role: 'Presenter', place: 'Presenter position' },
  { id: 2, role: 'Wide safety', place: 'Back of audience' },
  { id: 3, role: 'Feet-to-head tilt', place: 'Center, runway end' },
  { id: 4, role: 'Entrance and exit', place: 'Stage left' },
  { id: 5, role: 'Three-quarter detail', place: 'Runway side' },
];

export const CUES = [
  { id: 'intro', place: 'Presenter', position: null, action: 'Presenter introduces the look', allowed: [1], preferred: 1 },
  { id: 'entry', place: 'Stage left', position: [18, 26], action: 'Model enters from the left', allowed: [4, 2], preferred: 4 },
  { id: 'center', place: 'Center of the T', position: [50, 26], action: 'Model reaches the center', allowed: [2, 4], preferred: 2 },
  { id: 'outbound', place: 'Down the runway', position: [50, 59], action: 'Model walks towards the audience', allowed: [2, 5], preferred: 2 },
  { id: 'tilt', place: 'Runway end', position: [50, 83], action: 'Show the outfit from feet to head', allowed: [3], preferred: 3, needsSweep: true },
  { id: 'turn', place: 'Turn at the end', position: [50, 83], action: 'Model turns', allowed: [5, 2], preferred: 5 },
  { id: 'return', place: 'Back to center', position: [50, 47], action: 'Model walks back up the runway', allowed: [2, 5], preferred: 2 },
  { id: 'exit', place: 'Exit left', position: [18, 26], action: 'Model leaves by stage left', allowed: [4, 2], preferred: 4 },
  { id: 'outro', place: 'Presenter', position: null, action: 'Presenter takes the word again', allowed: [1], preferred: 1 },
];

export const PLAN_ROLES = CAMERAS.map(c => c.role);
export function planIsCorrect(roles) {
  return Array.isArray(roles) && roles.length === 5 && roles.every((role, i) => role === PLAN_ROLES[i]);
}
export function cueResult(cueIndex, program, sweepComplete = false) {
  const cue = CUES[cueIndex];
  if (!cue) return { ok: false, reason: 'missing' };
  if (!cue.allowed.includes(program)) return { ok: false, reason: 'camera' };
  if (cue.needsSweep && !sweepComplete) return { ok: false, reason: 'sweep' };
  return { ok: true, preferred: cue.preferred === program };
}
export function cameraHasSubject(camera, cueIndex) {
  const cue = CUES[cueIndex];
  if (!cue) return false;
  if (camera === 1) return true; // Presenter camera stays framed throughout the show.
  if (!cue.position) return false;
  if (camera === 2) return true;
  if (camera === 3) return ['outbound', 'tilt', 'turn'].includes(cue.id);
  if (camera === 4) return ['entry', 'center', 'exit'].includes(cue.id);
  return ['outbound', 'tilt', 'turn', 'return'].includes(cue.id);
}
