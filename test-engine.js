// Standalone test harness for engine.js — runs under JavaScriptCore via
// `osascript -l JavaScript test-engine.js` (no Node.js runtime available
// in this environment).

const app = Application.currentApplication();
app.includeStandardAdditions = true;
const src = app.read(Path("/Users/kevin/gold-foil-experiment/engine.js"));
eval(src);
const E = GoldFoilEngine;

let passed = 0, failed = 0;
function approx(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-3 : tol); }
function check(name, cond) { if (cond) { passed++; } else { failed++; console.log("FAIL: " + name); } }

const straight = { bendStart: 50, bendLength: 20, thetaDeg: 0, sign: 1 };

// --- zero deflection: always a straight line, dy=0 everywhere ---
check("theta=0: dy=0 before bend", E.pathPoint(20, straight).dy === 0);
check("theta=0: dy=0 inside bend", approx(E.pathPoint(60, straight).dy, 0));
check("theta=0: dy=0 after bend", approx(E.pathPoint(200, straight).dy, 0));
check("theta=0: dx equals s before bend", E.pathPoint(20, straight).dx === 20);
check("theta=0: dx equals s after bend too (straight line)", approx(E.pathPoint(200, straight).dx, 200, 1e-6));

// --- before the bend zone: always heading 0, moving on the original line ---
check("before bend: heading is 0", E.pathPoint(10, Object.assign({}, straight, { thetaDeg: 90 })).headingDeg === 0);
check("before bend: dy is 0", E.pathPoint(10, Object.assign({}, straight, { thetaDeg: 90 })).dy === 0);

// --- sign flips mirror the path across the x-axis ---
{
  const posOpts = { bendStart: 50, bendLength: 20, thetaDeg: 45, sign: 1 };
  const negOpts = Object.assign({}, posOpts, { sign: -1 });
  [60, 70, 100, 150].forEach((s) => {
    const a = E.pathPoint(s, posOpts), b = E.pathPoint(s, negOpts);
    check("sign flip mirrors dy at s=" + s, approx(a.dy, -b.dy));
    check("sign flip mirrors heading at s=" + s, approx(a.headingDeg, -b.headingDeg));
    check("sign flip does not change dx at s=" + s, approx(a.dx, b.dx));
  });
}

// --- heading ramps smoothly from 0 to thetaDeg across the bend, then holds ---
{
  const opts = { bendStart: 50, bendLength: 30, thetaDeg: 60, sign: 1 };
  check("heading at bend start ~0", approx(E.pathPoint(50, opts).headingDeg, 0));
  check("heading at bend midpoint ~30 (half of 60)", approx(E.pathPoint(65, opts).headingDeg, 30, 0.5));
  check("heading at bend end == thetaDeg", approx(E.pathPoint(80, opts).headingDeg, 60));
  check("heading beyond bend end stays == thetaDeg", approx(E.pathPoint(200, opts).headingDeg, 60));
}

// --- after the bend: straight-line motion at the final heading (constant slope dy/dx) ---
{
  const opts = { bendStart: 50, bendLength: 30, thetaDeg: 40, sign: 1 };
  const p1 = E.pathPoint(90, opts), p2 = E.pathPoint(130, opts), p3 = E.pathPoint(170, opts);
  const slope12 = (p2.dy - p1.dy) / (p2.dx - p1.dx);
  const slope23 = (p3.dy - p2.dy) / (p3.dx - p2.dx);
  check("beyond bend: constant slope (straight line)", approx(slope12, slope23, 1e-4));
  check("beyond bend: slope matches tan(thetaDeg)", approx(slope12, Math.tan((40 * Math.PI) / 180), 1e-3));
}

// --- backscatter: a near-180deg bend should start moving back in -x ---
{
  const opts = { bendStart: 50, bendLength: 30, thetaDeg: 175, sign: 1 };
  const beforeBend = E.pathPoint(50, opts).dx;
  const longAfter = E.pathPoint(300, opts);
  check("near-180deg deflection: dx decreases well beyond the bend (moving backward)", longAfter.dx < beforeBend + 80 - 1); // allow for the bend's own forward travel
  check("near-180deg deflection: heading is close to 180", approx(longAfter.headingDeg, 175));
}

// --- continuity at both ends of the bend zone (no jumps in position) ---
{
  const opts = { bendStart: 50, bendLength: 25, thetaDeg: 70, sign: -1 };
  const justBefore = E.pathPoint(49.999, opts);
  const atStart = E.pathPoint(50, opts);
  check("continuous at bend start", approx(justBefore.dx, atStart.dx, 0.01) && approx(justBefore.dy, atStart.dy, 0.01));
  const atEnd = E.pathPoint(75, opts);
  const justAfter = E.pathPoint(75.001, opts);
  check("continuous at bend end", approx(atEnd.dx, justAfter.dx, 0.01) && approx(atEnd.dy, justAfter.dy, 0.01));
}

// --- approach-distance slider -> angle: monotonic, bounded, sensible endpoints ---
check("approach=0 (far) gives a small angle", E.angleFromApproach(0) < 5);
check("approach=100 (very close) gives a large angle", E.angleFromApproach(100) > 150);
{
  const angles = [0, 20, 40, 60, 80, 100].map(E.angleFromApproach);
  let increasing = true;
  for (let i = 1; i < angles.length; i++) if (angles[i] <= angles[i - 1]) increasing = false;
  check("angleFromApproach is monotonically increasing", increasing);
}
check("angleFromApproach never exceeds 178", E.angleFromApproach(100) <= 178);
check("angleFromApproach never negative", E.angleFromApproach(0) >= 0);

// --- category classification matches the documented angle ranges ---
check("classifyAngle(2) = through", E.classifyAngle(2) === "through");
check("classifyAngle(20) = deflected", E.classifyAngle(20) === "deflected");
check("classifyAngle(150) = backscattered", E.classifyAngle(150) === "backscattered");
check("classifyAngle(-150) = backscattered (sign-independent)", E.classifyAngle(-150) === "backscattered");

// --- category weights sum to 1, and the illustrative mix favors 'through' heavily ---
{
  const sum = E.CATEGORY_WEIGHTS.through + E.CATEGORY_WEIGHTS.deflected + E.CATEGORY_WEIGHTS.backscattered;
  check("category weights sum to 1", approx(sum, 1, 1e-9));
  check("'through' is the dominant category (matches real experiment's qualitative result)", E.CATEGORY_WEIGHTS.through > E.CATEGORY_WEIGHTS.deflected + E.CATEGORY_WEIGHTS.backscattered);
  check("'backscattered' is the rarest category", E.CATEGORY_WEIGHTS.backscattered < E.CATEGORY_WEIGHTS.deflected);
}

// --- content sanity ---
check("exactly 5 investigation questions", E.INVESTIGATION_QUESTIONS.length === 5);
check("exactly 5 quiz questions", E.QUIZ_QUESTIONS.length === 5);
check("every quiz question has exactly 4 choices", E.QUIZ_QUESTIONS.every((q) => q.choices.length === 4));
check("every quiz question has a valid correctIndex", E.QUIZ_QUESTIONS.every((q) => q.correctIndex >= 0 && q.correctIndex < q.choices.length));
check("no duplicate quiz ids", new Set(E.QUIZ_QUESTIONS.map((q) => q.id)).size === E.QUIZ_QUESTIONS.length);

console.log("\n" + passed + " passed, " + failed + " failed");
