// Small executable contracts, selected by the requested operation and explicit
// SI inputs. No course-name lookup, inferred values, eval or model-owned key.
const numeric = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const fmt = (n) => String(Number(n.toPrecision(10)));
const q = (question, answer, explanation) => ({ question, answer: String(answer), explanation });
function one(text, pattern) {
  const matches = [...text.matchAll(new RegExp(pattern, 'gi'))];
  if (matches.length !== 1) return null;
  const n = Number(matches[0][1]);
  return Number.isFinite(n) && Math.abs(n) <= 1e9 ? n : null;
}
export function checkedMechanicsPractice(title, brief) {
  const text = String(brief),
    context = String(title).toLowerCase();
  if (/\b(?:constant acceleration|uniform acceleration|kinematics)\b/.test(context)) {
    const a = one(text, `constant acceleration\\s*(?:of|=)?\\s*(${numeric})\\s*m\\s*\\/\\s*s(?:\\^2|²)`);
    const t = one(text, `(?:for|duration(?: of|=)?)\\s*(${numeric})\\s*s(?:econds?)?\\b`);
    if (a === null || t === null || a < 0 || t <= 0 || !/\b(?:starting|starts|start) at rest\b/i.test(text))
      return null;
    // Contradictory initial-state or multiple moving-body inputs are ambiguous.
    if (/\b(?:initial speed|initial velocity)\b/i.test(text)) return null;
    const v = a * t,
      s = (a * t * t) / 2,
      avg = v / 2;
    const problem = `A cart starting at rest has constant acceleration ${a} m/s^2 for ${t} s. Calculate final speed, distance and average speed in one-dimensional motion.`;
    const stem = `For a cart starting at rest with constant acceleration ${a} m/s^2 for ${t} s, `;
    return {
      kind: 'constant-acceleration',
      problem,
      questions: [
        q(stem + 'calculate final speed, with units.', `${fmt(v)} m/s`, `v=u+at=0+(${a})(${t})=${fmt(v)} m/s.`),
        q(
          stem + 'calculate distance traveled, with units.',
          `${fmt(s)} m`,
          `s=ut+(1/2)at^2=0+(1/2)(${a})(${t})^2=${fmt(s)} m; acceleration is nonnegative and there is no reversal.`,
        ),
        q(
          stem + 'state the initial speed and the evidence for it.',
          '0 m/s',
          'Starting at rest explicitly gives u=0 m/s; this is an input, not an inferred measurement.',
        ),
        q(
          stem + 'calculate average speed over the interval.',
          `${fmt(avg)} m/s`,
          `With constant acceleration and no reversal, average speed=(u+v)/2=${fmt(avg)} m/s; distance/time gives the same result.`,
        ),
        q(
          stem + 'check the distance using average speed.',
          `${fmt(s)} m`,
          `${fmt(avg)} m/s × ${t} s=${fmt(s)} m, matching the displacement formula.`,
        ),
        q(
          stem + 'recover acceleration from the speed change.',
          `${fmt(a)} m/s^2`,
          `(v-u)/t=(${fmt(v)}-0)/${t}=${fmt(a)} m/s^2.`,
        ),
        q(
          stem + 'explain when the formula v=u+at is valid.',
          'Acceleration must be constant over the stated interval.',
          'If acceleration varies, one constant value cannot determine the speed change without additional information.',
        ),
        q(
          stem + 'does doubling time double distance under the same starting conditions?',
          a === 0 ? 'The cart remains at rest; distance stays zero.' : 'No. Distance becomes four times as large.',
          'From rest under the same constant acceleration, distance is proportional to time squared. This is a hypothetical change to the same model.',
        ),
      ],
      terms: [
        { term: 'Initial speed', definition: 'Speed at the beginning of the time interval.' },
        {
          term: 'Constant acceleration',
          definition: 'Equal velocity change per unit time throughout the stated interval.',
        },
        { term: 'Average speed', definition: 'Total distance divided by elapsed time.' },
      ],
      table: {
        columnLabels: ['Quantity', 'Value'],
        rows: [
          ['Final speed', `${fmt(v)} m/s`],
          ['Distance', `${fmt(s)} m`],
          ['Average speed', `${fmt(avg)} m/s`],
        ],
      },
    };
  }
  if (/\b(?:newton(?:'?s)? second law|net force)\b/.test(context)) {
    const m = one(text, `mass\\s*(?:of|=)?\\s*(${numeric})\\s*kg\\b`);
    const f = one(text, `net force\\s*(?:of|=)?\\s*(${numeric})\\s*N\\b`);
    if (m === null || f === null || m <= 0) return null;
    const a = f / m;
    const problem = `A body of mass ${m} kg experiences a net force ${f} N. Use F_net=ma for constant mass in an inertial frame to calculate and interpret acceleration.`;
    const stem = `For mass ${m} kg and net force ${f} N, `;
    return {
      kind: 'net-force',
      problem,
      questions: [
        q(stem + 'calculate acceleration with units.', `${fmt(a)} m/s^2`, `a=F_net/m=${f}/${m}=${fmt(a)} m/s^2.`),
        q(
          stem + 'check the net force by multiplying mass and acceleration.',
          `${fmt(f)} N`,
          `${m} kg × ${fmt(a)} m/s^2=${fmt(f)} N.`,
        ),
        q(
          stem + 'what does net force mean?',
          'The vector sum of all external forces on the body.',
          'Use the resultant external force, not a single force when other external forces are present.',
        ),
        q(
          stem + 'can these inputs alone determine the final velocity?',
          'No. Initial velocity and the force or acceleration history over a time interval are also needed.',
          'F_net=ma determines instantaneous acceleration under these assumptions, not a final velocity without time and initial conditions.',
        ),
        q(
          stem + 'if mass doubles while the same net force acts, what is the acceleration?',
          `${fmt(a / 2)} m/s^2`,
          `a_new=${f}/(${2 * m})=${fmt(a / 2)} m/s^2; this is a hypothetical change to the stated model.`,
        ),
        q(
          stem + 'if net force doubles at the same mass, what is the acceleration?',
          `${fmt(2 * a)} m/s^2`,
          `a_new=${2 * f}/${m}=${fmt(2 * a)} m/s^2.`,
        ),
        q(
          stem + 'state the assumptions used in F_net=ma.',
          'Constant mass and an inertial reference frame.',
          'The elementary formula applies under these assumptions; the numbers alone do not verify them in a real experiment.',
        ),
        q(
          stem + 'express a newton in SI base units.',
          '1 N = 1 kg m/s^2',
          'Force has units of mass times acceleration, so dividing newtons by kilograms gives m/s^2.',
        ),
      ],
      terms: [
        { term: 'Net force', definition: 'The vector sum of external forces acting on a body.' },
        { term: 'Mass', definition: 'The inertial quantity relating net force to acceleration in this model.' },
        { term: 'Acceleration', definition: 'The rate of change of velocity.' },
      ],
      table: {
        columnLabels: ['Quantity', 'Value'],
        rows: [
          ['Mass', `${m} kg`],
          ['Net force', `${f} N`],
          ['Acceleration', `${fmt(a)} m/s^2`],
        ],
      },
    };
  }
  return null;
}
