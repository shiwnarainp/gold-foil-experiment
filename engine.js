/*
 * Rutherford Gold Foil Experiment — pure physics + content engine.
 * No DOM access, so this loads both in the browser and in the standalone
 * test harness (test-engine.js).
 *
 * Scattering model: an alpha particle travels in a straight line, passes
 * near a nucleus (modeled as a smooth electrostatic-repulsion bend, never
 * a hard bounce — per the brief), and continues in a straight line at the
 * new heading afterward. The bend is a continuous ramp of heading angle
 * over a short "bend zone" (arc length bendStart..bendStart+bendLength),
 * numerically integrated so position and heading stay continuous at both
 * ends of the ramp — the same technique used for the CRT beam's parabola.
 *
 * This simulation deliberately exaggerates how often large-angle and
 * backscatter events happen relative to Geiger & Marsden's real ~1-in-8000
 * rate, so a classroom can see all three outcomes in a short run. That is
 * stated explicitly in the UI, per the brief's "illustrative, not exact
 * historical measurements" requirement.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GoldFoilEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function headingDegAt(sLocal, bendLength, thetaDeg, sign) {
    if (sLocal <= 0) return 0;
    if (sLocal >= bendLength) return thetaDeg * sign;
    return thetaDeg * sign * (sLocal / bendLength);
  }

  /** Integrates the bend ramp from sLocal=0 to sLocal=upTo, returning the
   * displacement (dx,dy) accumulated purely within the bend zone. */
  function integrateBend(upTo, bendLength, thetaDeg, sign) {
    const clamped = Math.max(0, Math.min(upTo, bendLength));
    const N = 40;
    const ds = clamped / N;
    let x = 0, y = 0;
    for (let i = 1; i <= N; i++) {
      const si = i * ds;
      const hRad = (headingDegAt(si, bendLength, thetaDeg, sign) * Math.PI) / 180;
      x += Math.cos(hRad) * ds;
      y += Math.sin(hRad) * ds;
    }
    return { x, y };
  }

  /**
   * Position + heading of a particle after traveling arc-length `s` from
   * its start point (which is treated as local origin (0,0), heading 0 —
   * callers add their own startX/startY and initial travel direction).
   * opts: { bendStart, bendLength, thetaDeg, sign (+1/-1) }
   */
  function pathPoint(s, opts) {
    const { bendStart, bendLength, thetaDeg, sign } = opts;
    if (s <= bendStart) return { dx: s, dy: 0, headingDeg: 0 };
    const sLocal = s - bendStart;
    if (sLocal <= bendLength) {
      const p = integrateBend(sLocal, bendLength, thetaDeg, sign);
      return { dx: bendStart + p.x, dy: p.y, headingDeg: headingDegAt(sLocal, bendLength, thetaDeg, sign) };
    }
    const atBendEnd = integrateBend(bendLength, bendLength, thetaDeg, sign);
    const finalHeadingDeg = thetaDeg * sign;
    const extra = sLocal - bendLength;
    const hRad = (finalHeadingDeg * Math.PI) / 180;
    return {
      dx: bendStart + atBendEnd.x + Math.cos(hRad) * extra,
      dy: atBendEnd.y + Math.sin(hRad) * extra,
      headingDeg: finalHeadingDeg,
    };
  }

  /** Deflection angle (degrees) from an "approach distance" slider value
   * in [0,100]: 0 = far from any nucleus (no deflection), 100 = a
   * near head-on approach (close to full backscatter). Monotonically
   * decreasing distance -> monotonically increasing angle, matching the
   * real inverse relationship between impact parameter and scattering
   * angle, simplified for a classroom slider. */
  function angleFromApproach(approach0to100) {
    const a = Math.max(0, Math.min(100, approach0to100)) / 100; // 0 = far, 1 = near head-on
    const THETA_MAX = 174;
    const POWER = 4; // stays small for most of the range, then ramps up sharply near 100 — same qualitative falloff as real Coulomb scattering
    return THETA_MAX * Math.pow(a, POWER);
  }

  const CATEGORY_WEIGHTS = { through: 0.82, deflected: 0.13, backscattered: 0.05 };
  const CATEGORY_ANGLE_RANGE = {
    through: [0, 4],
    deflected: [8, 55],
    backscattered: [120, 172],
  };

  function classifyAngle(thetaDeg) {
    const a = Math.abs(thetaDeg);
    if (a >= CATEGORY_ANGLE_RANGE.backscattered[0]) return "backscattered";
    if (a >= CATEGORY_ANGLE_RANGE.deflected[0]) return "deflected";
    return "through";
  }

  const INVESTIGATION_QUESTIONS = [
    { id: "i1", prompt: "What happened to most alpha particles?", model: "Most alpha particles passed straight through the gold foil with little or no deflection, showing that atoms are mostly empty space." },
    { id: "i2", prompt: "What happened to some alpha particles?", model: "Some alpha particles were deflected at small-to-moderate angles as they passed near a gold nucleus, pushed off course by electrostatic repulsion between the positive alpha particle and the positive nucleus." },
    { id: "i3", prompt: "What happened to very few alpha particles?", model: "A very small number of alpha particles scattered through large angles — occasionally almost straight back the way they came." },
    { id: "i4", prompt: "Why were some positively charged alpha particles deflected?", model: "Alpha particles are positively charged, and gold nuclei are also positively charged. Like charges repel, so an alpha particle passing close to a nucleus is pushed away from it — the closer the approach, the stronger the repulsion and the larger the deflection." },
    { id: "i5", prompt: "What did Rutherford conclude about the structure of the atom?", model: "Rutherford concluded that an atom's positive charge and nearly all of its mass are concentrated in a tiny, dense nucleus, surrounded by a large region of mostly empty space — not spread evenly through the atom as Thomson's plum pudding model proposed." },
  ];

  const QUIZ_QUESTIONS = [
    {
      id: "q1",
      prompt: "What was the purpose of firing alpha particles at thin gold foil in Rutherford's experiment?",
      choices: ["To melt the gold foil", "To test how charge is distributed inside atoms", "To measure the speed of light", "To create new elements"],
      correctIndex: 1,
      explanation: "The experiment tested predictions about how positive charge (and mass) is distributed within an atom, by seeing how alpha particles scattered off gold atoms.",
    },
    {
      id: "q2",
      prompt: "Why did most alpha particles pass straight through the gold foil?",
      choices: ["Gold has no charge", "Atoms are mostly empty space", "Alpha particles are too small to interact with anything", "The foil was not actually there"],
      correctIndex: 1,
      explanation: "Most of an atom's volume is empty space, so most alpha particles never passed close enough to a nucleus to be affected.",
    },
    {
      id: "q3",
      prompt: "Why were some alpha particles deflected at an angle as they passed through the foil?",
      choices: [
        "They physically bounced off a solid electron",
        "They were slowed down by friction with the gold atoms",
        "Electrostatic repulsion from a nearby positively charged nucleus pushed them off course",
        "Magnetic fields in the foil redirected them",
      ],
      correctIndex: 2,
      explanation: "Alpha particles carry a positive charge, and passing near a gold nucleus (also positive) produces a repulsive electrostatic force that bends the particle's path — not a physical collision.",
    },
    {
      id: "q4",
      prompt: "What did the very rare backward-scattering alpha particles reveal about the nucleus?",
      choices: [
        "The nucleus is spread evenly throughout the atom",
        "The nucleus is small, dense, and concentrates most of the atom's positive charge and mass",
        "The nucleus has no charge at all",
        "There is no nucleus — atoms are uniform spheres",
      ],
      correctIndex: 1,
      explanation: "Only a very close, nearly head-on approach to something small and dense enough could repel an alpha particle strongly enough to send it almost straight back — evidence the positive charge and mass are concentrated in a tiny nucleus.",
    },
    {
      id: "q5",
      prompt: "How does Rutherford's nuclear model differ from Thomson's plum pudding model?",
      choices: [
        "Rutherford's model has no electrons at all",
        "Thomson's model concentrates charge in a nucleus; Rutherford's spreads it evenly",
        "Rutherford's model concentrates positive charge and mass in a tiny nucleus with mostly empty space around it, instead of spreading positive charge evenly through the atom",
        "The two models are actually the same",
      ],
      correctIndex: 2,
      explanation: "Thomson pictured positive charge spread evenly through the atom (like pudding) with electrons embedded in it. Rutherford's results showed that picture was wrong: positive charge and mass are concentrated in a tiny, dense nucleus, with electrons occupying a much larger, mostly empty surrounding region.",
    },
  ];

  return {
    pathPoint,
    angleFromApproach,
    classifyAngle,
    CATEGORY_WEIGHTS,
    CATEGORY_ANGLE_RANGE,
    INVESTIGATION_QUESTIONS,
    QUIZ_QUESTIONS,
  };
});
