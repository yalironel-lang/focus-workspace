import type { CourseTrapSubject } from './detectCourseTrapSubject';

export interface CourseTrapPrototype {
  id: string;
  subject: CourseTrapSubject;
  title: string;
  topic: string;
  excerpt: string;
  pathA: string;
  pathB: string;
  trapPath: 'A' | 'B';
  forkPhrase: string;
  reveal: {
    fork: string;
    trap: string;
    whyStudentsFall: string;
  };
  examLens: string;
}

export const COURSE_TRAP_PROTOTYPE_LIBRARY: CourseTrapPrototype[] = [
  // ── Calculus ──────────────────────────────────────────────────────────────
  {
    id: 'calc-01',
    subject: 'calculus',
    title: "L'Hôpital's Rule — differentiability check",
    topic: "L'Hôpital's Rule",
    excerpt:
      "When lim(x→0) f(x)/g(x) gives the indeterminate form 0/0, we can evaluate the limit by taking derivatives of the numerator and denominator separately, provided the conditions for L'Hôpital's Rule are satisfied.",
    pathA:
      "0/0 means I can differentiate top and bottom and plug in — that's L'Hôpital.",
    pathB:
      'First verify f and g are differentiable in a neighborhood of the point and g′ ≠ 0 before applying the rule.',
    trapPath: 'A',
    forkPhrase: 'evaluate the limit by taking derivatives',
    reveal: {
      fork: "When you read 'evaluate the limit by taking derivatives'…",
      trap: '…it is easy to apply the rule without checking differentiability at the point.',
      whyStudentsFall:
        'The 0/0 form feels like a green light. Many students skip the hypothesis check entirely.',
    },
    examLens: "They'll use |x|/x at x = 0 — not differentiable at the point.",
  },
  {
    id: 'calc-02',
    subject: 'calculus',
    title: 'Integration by parts — choosing u and dv',
    topic: 'Integration by Parts',
    excerpt:
      'To evaluate ∫ ln(x) dx, integration by parts is natural: choose u and dv, then apply ∫u dv = uv − ∫v du.',
    pathA: 'Let u = ln(x) and dv = x dx, so v = x²/2.',
    pathB: 'Let u = ln(x) and dv = dx, so v = x, then integrate carefully.',
    trapPath: 'A',
    forkPhrase: 'choose u and dv',
    reveal: {
      fork: "After choosing u = ln(x) and dv = x dx…",
      trap: '…v = x²/2 is wrong for that dv — you need dv = dx to get v = x after integration.',
      whyStudentsFall:
        'Students match ln(x) with x dx by habit without checking whether v comes out cleanly.',
    },
    examLens: 'Part (a) often uses a clean u/dv split; part (b) punishes a sloppy v.',
  },
  {
    id: 'calc-03',
    subject: 'calculus',
    title: 'Chain rule — inner derivative',
    topic: 'Chain Rule',
    excerpt:
      'If y = sin(x²), then dy/dx is found by differentiating the outer function and accounting for the inner function x².',
    pathA: 'The derivative is cos(x²) — same as the outer function evaluated at x².',
    pathB: 'The derivative is cos(x²) · 2x — outer derivative times inner derivative.',
    trapPath: 'A',
    forkPhrase: 'accounting for the inner function',
    reveal: {
      fork: "The phrase 'accounting for the inner function' is doing real work…",
      trap: '…cos(x²) alone forgets the factor of 2x from differentiating x².',
      whyStudentsFall:
        'Nested functions look like a single layer when you focus on the outer shape.',
    },
    examLens: 'Composite functions always hide a missing inner factor on exams.',
  },
  {
    id: 'calc-04',
    subject: 'calculus',
    title: 'Related rates — differentiating with respect to time',
    topic: 'Related Rates',
    excerpt:
      'A ladder slides down a wall. Both x and y depend on time t, so when we differentiate the Pythagorean relation, every variable must be differentiated with respect to t.',
    pathA: 'Differentiate x² + y² = L² with respect to x and solve for dy/dx.',
    pathB: 'Differentiate with respect to t using the chain rule on both x(t) and y(t).',
    trapPath: 'A',
    forkPhrase: 'depend on time t',
    reveal: {
      fork: "Once x and y 'depend on time t'…",
      trap: '…treating x as the independent variable gives a static slope, not a related rate.',
      whyStudentsFall:
        'Students default to implicit differentiation in x because the equation looks geometric.',
    },
    examLens: 'Related-rates problems always ask for dx/dt or dy/dt, not dy/dx.',
  },
  {
    id: 'calc-05',
    subject: 'calculus',
    title: 'Riemann sums — sample point choice',
    topic: 'Riemann Sums',
    excerpt:
      'Approximate ∫₀² x² dx using a Riemann sum with n subintervals of equal width Δx = 2/n, sampling at the right endpoint of each subinterval.',
    pathA: 'Use f(0) on every subinterval — the leftmost value is simplest.',
    pathB: 'Use f(xᵢ) at the right endpoint xᵢ of each subinterval as specified.',
    trapPath: 'A',
    forkPhrase: 'right endpoint of each subinterval',
    reveal: {
      fork: "The instructions say 'right endpoint'…",
      trap: '…using f(0) everywhere ignores which sample point the sum requires.',
      whyStudentsFall:
        'Students grab the easiest evaluation point instead of the one the setup names.',
    },
    examLens: 'Exam questions change left/mid/right endpoint to test whether you read the setup.',
  },
  {
    id: 'calc-06',
    subject: 'calculus',
    title: 'Improper integrals — convergence',
    topic: 'Improper Integrals',
    excerpt:
      'Evaluate ∫₁^∞ (1/x) dx by replacing the upper limit with b and taking the limit as b → ∞.',
    pathA: 'Antiderivative is ln(x), so ln(∞) − ln(1) = ∞ — done.',
    pathB: 'Write the limit explicitly and check whether the limit of ln(b) as b → ∞ diverges.',
    trapPath: 'A',
    forkPhrase: 'taking the limit as b → ∞',
    reveal: {
      fork: "Replacing ∞ with a limit means convergence is part of the question…",
      trap: "…stopping at 'diverges' without justification skips the limit argument exams require.",
      whyStudentsFall:
        'Students treat improper integrals like definite ones once they spot ln(x).',
    },
    examLens: "They ask 'convergent or divergent?' before asking for a value.",
  },
  {
    id: 'calc-07',
    subject: 'calculus',
    title: 'Taylor series — remainder conditions',
    topic: 'Taylor Series',
    excerpt:
      'The Taylor polynomial of degree n approximates f near a when f has sufficient derivatives at a; the remainder term controls the error of the approximation.',
    pathA: 'Write the Taylor formula and plug in — if derivatives exist at a, it works.',
    pathB: 'Check how many derivatives exist and whether the remainder bound applies on the interval.',
    trapPath: 'A',
    forkPhrase: 'sufficient derivatives at a',
    reveal: {
      fork: "'Sufficient derivatives' is not the same as 'one derivative'…",
      trap: '…a remainder bound may fail if higher derivatives blow up on the interval.',
      whyStudentsFall:
        'Students memorize the formula and skip the interval where the remainder is valid.',
    },
    examLens: 'Error-bound questions test the remainder term, not just the polynomial.',
  },
  {
    id: 'calc-08',
    subject: 'calculus',
    title: 'Partial fractions — repeated roots',
    topic: 'Partial Fractions',
    excerpt:
      'Decompose (x + 3) / ((x − 1)²(x + 2)) into partial fractions before integrating.',
    pathA: 'Use A/(x − 1) + B/(x + 2) — one term per factor in the denominator.',
    pathB: 'Use A/(x − 1) + B/(x − 1)² + C/(x + 2) because (x − 1) is repeated.',
    trapPath: 'A',
    forkPhrase: '(x − 1)²',
    reveal: {
      fork: 'A squared factor in the denominator…',
      trap: '…requires a separate term for each power of (x − 1), not one term only.',
      whyStudentsFall:
        'Students count distinct factors and stop, missing repeated-root structure.',
    },
    examLens: 'Repeated roots appear specifically to break the one-term-per-factor habit.',
  },
  {
    id: 'calc-09',
    subject: 'calculus',
    title: 'Volume of revolution — axis of rotation',
    topic: 'Volume of Revolution',
    excerpt:
      'Rotate the region under y = √x from x = 0 to x = 4 about the x-axis to find the solid volume.',
    pathA: 'Use disks perpendicular to the y-axis since the curve is y = √x.',
    pathB: 'Use disks (or washers) perpendicular to the x-axis because the rotation is about the x-axis.',
    trapPath: 'A',
    forkPhrase: 'about the x-axis',
    reveal: {
      fork: "Rotation 'about the x-axis' sets the disk direction…",
      trap: '…disks must be perpendicular to the axis of rotation, not to whichever variable looks easier.',
      whyStudentsFall:
        'Students pick the axis that matches the function orientation instead of the rotation axis.',
    },
    examLens: 'Shell vs disk questions hinge on which axis you rotate about.',
  },
  {
    id: 'calc-10',
    subject: 'calculus',
    title: 'Limit laws — zero denominator',
    topic: 'Limit Laws',
    excerpt:
      'Evaluate lim(x→2) (x² − 4)/(x − 2) by simplifying the rational expression before applying limit laws.',
    pathA: 'Apply the quotient law: numerator limit divided by denominator limit.',
    pathB: 'Factor x² − 4 = (x − 2)(x + 2), cancel, then substitute x = 2.',
    trapPath: 'A',
    forkPhrase: 'before applying limit laws',
    reveal: {
      fork: "The denominator limit is 0 at x = 2…",
      trap: '…the quotient law does not apply until the expression is simplified to remove the hole.',
      whyStudentsFall:
        'Limit laws feel like automatic rules — students apply them before checking denominators.',
    },
    examLens: 'They leave expressions that look legal until you substitute.',
  },

  // ── Economics ─────────────────────────────────────────────────────────────
  {
    id: 'econ-01',
    subject: 'economics',
    title: 'Slutsky — collapsing effects',
    topic: 'Consumer Theory',
    excerpt:
      'Decomposing a price change, we hold real income constant along the initial indifference curve to isolate the substitution effect, then allow income to change for the total effect.',
    pathA:
      'Price falls → I buy more of that good because it is cheaper — one combined effect.',
    pathB:
      'Separate substitution along the original indifference curve, then account for the real income change.',
    trapPath: 'A',
    forkPhrase: 'hold real income constant along the initial indifference curve',
    reveal: {
      fork: "When the text says 'hold real income constant'…",
      trap: '…collapsing into one step misses the substitution effect exams test separately.',
      whyStudentsFall:
        'Cheaper goods feel like a single story — decomposition feels like extra notation.',
    },
    examLens: 'Part (a) asks substitution only; students lose marks jumping to total effect.',
  },
  {
    id: 'econ-02',
    subject: 'economics',
    title: 'Income increase — inferior goods',
    topic: 'Consumer Theory',
    excerpt:
      'When the consumer\'s income increases and both goods are normal goods, the budget set expands outward and the optimum moves to a higher indifference curve.',
    pathA: 'Income rises → buy more of both goods — the budget shift means more of everything.',
    pathB: 'Check whether each good is normal or inferior before signing the income effect.',
    trapPath: 'A',
    forkPhrase: 'both goods are normal goods',
    reveal: {
      fork: "The passage assumes normal goods this time…",
      trap: "…carrying 'buy more of both' to every income question ignores inferior-good cases.",
      whyStudentsFall:
        'The normal-good setup trains a reflex that breaks on the very next exam question.',
    },
    examLens: 'Part (b) switches one good to inferior — same diagram, different sign.',
  },
  {
    id: 'econ-03',
    subject: 'economics',
    title: 'Perfect competition vs monopoly',
    topic: 'Market Structure',
    excerpt:
      'In perfect competition, each firm is a price taker and profit maximization implies P = MC at the optimum output level.',
    pathA: 'Maximize profit → set P = MC — that is the rule for any profit-maximizing firm.',
    pathB: 'P = MC uses price-taking; with downward-sloping demand, MR ≠ P.',
    trapPath: 'A',
    forkPhrase: 'each firm is a price taker',
    reveal: {
      fork: "'Price taker' is the hinge…",
      trap: '…monopoly faces downward-sloping demand, so MR = MC, not P = MC.',
      whyStudentsFall:
        'P = MC is the most memorized line — students export it to every market structure.',
    },
    examLens: 'Monopoly sections reuse the same graph with one changed assumption.',
  },
  {
    id: 'econ-04',
    subject: 'economics',
    title: 'Tax incidence — elasticity',
    topic: 'Tax Incidence',
    excerpt:
      'When a per-unit tax is imposed on sellers, the statutory incidence falls on sellers, but the economic burden depends on relative elasticities of supply and demand.',
    pathA: 'Tax on sellers → sellers pay the tax because the law says so.',
    pathB: 'Burden splits by elasticity — the more inelastic side bears more of the tax.',
    trapPath: 'A',
    forkPhrase: 'economic burden depends on relative elasticities',
    reveal: {
      fork: 'Statutory incidence is not economic incidence…',
      trap: '…who writes the check matters less than who cannot escape the price change.',
      whyStudentsFall:
        'Students anchor on who is taxed legally instead of who bears the wedge.',
    },
    examLens: 'Diagram questions move the tax to buyers with the same elasticity lesson.',
  },
  {
    id: 'econ-05',
    subject: 'economics',
    title: 'Elasticity — percent changes',
    topic: 'Elasticity',
    excerpt:
      'Price elasticity of demand is defined using percentage changes in quantity demanded relative to percentage changes in price.',
    pathA: 'Elasticity = ΔQ/ΔP — slope of the demand curve.',
    pathB: 'Elasticity = (%ΔQ)/(%ΔP) — scale-free percentage changes.',
    trapPath: 'A',
    forkPhrase: 'percentage changes',
    reveal: {
      fork: "The definition says 'percentage changes'…",
      trap: '…raw ΔQ/ΔP is slope, not elasticity, and depends on units.',
      whyStudentsFall:
        'Slopes are faster to compute — students treat elasticity as fancy slope notation.',
    },
    examLens: 'Unit changes (dollars vs cents) break ΔQ/ΔP but not percent elasticity.',
  },
  {
    id: 'econ-06',
    subject: 'economics',
    title: 'Comparative advantage — opportunity cost',
    topic: 'International Trade',
    excerpt:
      'Comparative advantage is determined by opportunity cost: the country gives up less of another good to produce one more unit should specialize.',
    pathA: 'Country A is faster at both goods → A should produce both.',
    pathB: 'Compare opportunity costs — absolute productivity is not the criterion.',
    trapPath: 'A',
    forkPhrase: 'opportunity cost',
    reveal: {
      fork: 'Comparative advantage is about opportunity cost, not absolute speed…',
      trap: '…being better at everything does not remove the gains from specialization.',
      whyStudentsFall:
        'Absolute advantage feels intuitive — opportunity cost requires one extra translation step.',
    },
    examLens: 'Classic table problems make the low-opportunity-cost country non-obvious.',
  },
  {
    id: 'econ-07',
    subject: 'economics',
    title: 'Monopsony — labor market',
    topic: 'Monopsony',
    excerpt:
      'A monopsonist in the labor market faces the upward-sloping market supply of labor and chooses employment where marginal expenditure equals marginal revenue product.',
    pathA: 'Hire until wage equals MRP — same as competitive labor demand.',
    pathB: 'Use ME = MRP because hiring more workers raises the wage on all units.',
    trapPath: 'A',
    forkPhrase: 'marginal expenditure equals marginal revenue product',
    reveal: {
      fork: 'Monopsony has marginal expenditure, not just wage…',
      trap: '…W = MRP is competitive; monopsony under-hires because ME > wage.',
      whyStudentsFall:
        'Students reuse competitive W = MRP without noticing supply is upward-sloping.',
    },
    examLens: 'Labor monopsony graphs mirror product monopoly with ME replacing MR.',
  },
  {
    id: 'econ-08',
    subject: 'economics',
    title: 'GDP — intermediate goods',
    topic: 'GDP Accounting',
    excerpt:
      'GDP measures the market value of all final goods and services produced within a country during a period, avoiding double counting of intermediate inputs.',
    pathA: 'Add the steel, tires, and car sale — each transaction adds to GDP.',
    pathB: 'Count only final goods (the car), not intermediate inputs already embedded.',
    trapPath: 'A',
    forkPhrase: 'avoiding double counting of intermediate inputs',
    reveal: {
      fork: "'Final goods' excludes inputs already counted in another product…",
      trap: '…summing every transaction double-counts value along the supply chain.',
      whyStudentsFall:
        'Every sale looks like output — students sum transactions instead of final value.',
    },
    examLens: 'Multi-stage production vignettes test whether you count once.',
  },
  {
    id: 'econ-09',
    subject: 'economics',
    title: 'Nash equilibrium — mutual best response',
    topic: 'Game Theory',
    excerpt:
      'A Nash equilibrium is a strategy profile where each player\'s strategy is a best response to the strategies of the other players.',
    pathA: 'Player 1 is playing their best strategy — that must be equilibrium.',
    pathB: 'Check best responses for every player simultaneously — equilibrium is mutual.',
    trapPath: 'A',
    forkPhrase: 'each player\'s strategy is a best response',
    reveal: {
      fork: "'Each player' means all players, not one…",
      trap: '…one-sided optimality can leave the other player wanting to deviate.',
      whyStudentsFall:
        'Students verify one row/column and stop — equilibrium requires checking both sides.',
    },
    examLens: 'Payoff matrices hide equilibria that fail for only one player.',
  },
  {
    id: 'econ-10',
    subject: 'economics',
    title: 'Budget line — opportunity cost',
    topic: 'Budget Constraints',
    excerpt:
      'Moving along the budget line, the opportunity cost of one more unit of good X is the amount of good Y that must be given up, determined by the slope −Pₓ/Pᵧ.',
    pathA: 'If I can afford it on the budget line, the cost is just Pₓ dollars.',
    pathB: 'The true cost is the foregone Y — slope tells you what you give up.',
    trapPath: 'A',
    forkPhrase: 'amount of good Y that must be given up',
    reveal: {
      fork: 'Money price is not opportunity cost on a two-good diagram…',
      trap: '…the budget slope converts price into units of Y forgone.',
      whyStudentsFall:
        'Dollar prices are concrete — foregone goods feel abstract until exams force units.',
    },
    examLens: 'Slope questions ask for Y given up, not dollars spent.',
  },

  // ── Physics ─────────────────────────────────────────────────────────────────
  {
    id: 'phys-01',
    subject: 'physics',
    title: 'Incline — force components',
    topic: 'Forces on Inclines',
    excerpt:
      'For a block on a frictionless incline, resolve the gravitational force into components parallel and perpendicular to the surface before writing Newton\'s second law.',
    pathA: 'Use mg straight down the plane — heavier means larger acceleration down the slope.',
    pathB: 'Resolve mg into mgsinθ parallel and mgcosθ perpendicular to the surface first.',
    trapPath: 'A',
    forkPhrase: 'resolve the gravitational force into components',
    reveal: {
      fork: "The instruction is to 'resolve into components'…",
      trap: '…full mg along the plane ignores the angle — only mgsinθ accelerates along the incline.',
      whyStudentsFall:
        'Gravity feels like it pulls straight down the ramp when you sketch quickly.',
    },
    examLens: 'Free-body diagrams on exams always require rotation into parallel/perpendicular axes.',
  },
  {
    id: 'phys-02',
    subject: 'physics',
    title: 'Torque — sign convention',
    topic: 'Rotational Statics',
    excerpt:
      'For a rigid body in equilibrium, choose a pivot and assign positive and negative signs to torques consistently based on their direction of rotation about that pivot.',
    pathA: 'Pick clockwise as positive because that matches the diagram.',
    pathB: 'Pick one convention, apply it to every force, and keep the pivot fixed for all torques.',
    trapPath: 'A',
    forkPhrase: 'consistently based on their direction of rotation',
    reveal: {
      fork: "'Consistently' means one convention for all torques about the same pivot…",
      trap: '…mixing ad hoc signs or switching pivots mid-problem breaks equilibrium equations.',
      whyStudentsFall:
        'Students assign signs from the picture instead of from a fixed convention.',
    },
    examLens: 'Multi-force beam problems punish inconsistent torque signs.',
  },
  {
    id: 'phys-03',
    subject: 'physics',
    title: 'Energy — friction is non-conservative',
    topic: 'Energy Conservation',
    excerpt:
      'When friction is present, mechanical energy is not conserved unless the work done by friction is included in the energy balance for the system.',
    pathA: 'Initial PE = final KE — energy is conserved because we learned conservation of energy.',
    pathB: 'Include W_friction in the energy account — friction removes mechanical energy as heat.',
    trapPath: 'A',
    forkPhrase: 'work done by friction is included',
    reveal: {
      fork: "The passage warns friction breaks mechanical conservation…",
      trap: '…KE + PE alone misses the energy dissipated by friction.',
      whyStudentsFall:
        'Conservation feels like a universal shortcut — students drop friction terms.',
    },
    examLens: 'Problem sets add friction on the second line of the same setup.',
  },
  {
    id: 'phys-04',
    subject: 'physics',
    title: 'Kinematics — velocity vs acceleration sign',
    topic: '1D Kinematics',
    excerpt:
      'An object moving downward can have negative velocity while its acceleration is positive upward if the motion is slowing during descent.',
    pathA: 'Negative velocity means negative acceleration — direction matches.',
    pathB: 'Velocity and acceleration are separate — slowing down means opposite signs.',
    trapPath: 'A',
    forkPhrase: 'slowing during descent',
    reveal: {
      fork: "'Slowing' tells you acceleration opposes velocity…",
      trap: '…same sign for v and a means speeding up in that direction, not slowing.',
      whyStudentsFall:
        "Students conflate 'negative' with 'slowing' without checking relative direction.",
    },
    examLens: 'Graph interpretation questions show velocity and acceleration with opposite signs.',
  },
  {
    id: 'phys-05',
    subject: 'physics',
    title: 'Circular motion — centripetal in inertial frame',
    topic: 'Uniform Circular Motion',
    excerpt:
      'In an inertial reference frame, uniform circular motion requires a centripetal acceleration directed toward the center of the circle.',
    pathA: 'There is an outward centrifugal force balancing the motion around the circle.',
    pathB: 'Only centripetal acceleration toward the center — no outward force in an inertial frame.',
    trapPath: 'A',
    forkPhrase: 'in an inertial reference frame',
    reveal: {
      fork: "'Inertial frame' rules out fictitious outward forces…",
      trap: '…centrifugal is a non-inertial artifact — the real acceleration points inward.',
      whyStudentsFall:
        "Everyday language ('thrown outward') fights the inertial-frame diagram.",
    },
    examLens: 'Rotating platform questions test centripetal direction, not centrifugal feel.',
  },
  {
    id: 'phys-06',
    subject: 'physics',
    title: 'Momentum — internal vs external forces',
    topic: 'Momentum Conservation',
    excerpt:
      'The total momentum of an isolated system is conserved when the net external force on the system is zero; internal forces cancel in pairs.',
    pathA: 'During the collision, each force changes momentum — include all of them in the system total.',
    pathB: 'Internal forces cancel — only external impulses change total system momentum.',
    trapPath: 'A',
    forkPhrase: 'internal forces cancel in pairs',
    reveal: {
      fork: 'Internal forces change individual momenta but not the system total…',
      trap: '…treating internal collision forces as external breaks conservation.',
      whyStudentsFall:
        'Students list every force in the collision instead of separating system boundaries.',
    },
    examLens: 'Two-block problems hinge on whether the surface exerts external friction.',
  },
  {
    id: 'phys-07',
    subject: 'physics',
    title: 'Waves — amplitude vs speed',
    topic: 'Wave Properties',
    excerpt:
      'On a stretched string, wave speed depends on tension and mass density; changing amplitude does not change the propagation speed of the wave.',
    pathA: 'A bigger amplitude means the wave moves faster — more energy, faster travel.',
    pathB: 'Speed is set by medium properties; amplitude changes energy, not v.',
    trapPath: 'A',
    forkPhrase: 'wave speed depends on tension and mass density',
    reveal: {
      fork: 'Speed is a medium property on a given string…',
      trap: '…amplitude and speed are independent for linear waves on a fixed string.',
      whyStudentsFall:
        'Bigger waves look faster — students confuse energy with propagation speed.',
    },
    examLens: 'They change amplitude while asking whether speed changes — it should not.',
  },
  {
    id: 'phys-08',
    subject: 'physics',
    title: 'Electric fields — vector superposition',
    topic: 'Electrostatics',
    excerpt:
      'The net electric field at a point due to multiple charges is the vector sum of the individual fields, paying attention to direction from each source charge.',
    pathA: 'Add the field magnitudes: E_total = E₁ + E₂.',
    pathB: 'Add field vectors with directions — opposite fields can partially cancel.',
    trapPath: 'A',
    forkPhrase: 'vector sum of the individual fields',
    reveal: {
      fork: "The text says 'vector sum'…",
      trap: '…scalar addition ignores cancellation when fields oppose.',
      whyStudentsFall:
        'Magnitudes are easier to add — direction feels optional until signs matter.',
    },
    examLens: 'Two-charge problems place fields on opposite sides of the test point.',
  },
  {
    id: 'phys-09',
    subject: 'physics',
    title: 'Free-body diagrams — correct body',
    topic: 'Free-Body Diagrams',
    excerpt:
      'Draw a free-body diagram for the block only, showing all external forces acting on the block — not forces the block exerts on other objects.',
    pathA: 'Include the force the block applies on the table — action-reaction pairs belong on the diagram.',
    pathB: 'Only forces on the block: weight, normal, friction, applied forces.',
    trapPath: 'A',
    forkPhrase: 'forces acting on the block',
    reveal: {
      fork: "FBD is for one chosen body…",
      trap: '…forces the block exerts elsewhere belong on a different diagram.',
      whyStudentsFall:
        'Third-law pairs feel like they must appear together on one picture.',
    },
    examLens: 'Multi-object setups ask for the block-only FBD first, then the table.',
  },
  {
    id: 'phys-10',
    subject: 'physics',
    title: 'Units — convert before solving',
    topic: 'Unit Consistency',
    excerpt:
      'Before substituting into kinematic equations, express all distances in meters and all times in seconds so units combine consistently.',
    pathA: 'Plug 50 cm/s and 2 m into v = d/t — the numbers look fine.',
    pathB: 'Convert 50 cm/s to 0.5 m/s first, then substitute with meters and seconds.',
    trapPath: 'A',
    forkPhrase: 'express all distances in meters',
    reveal: {
      fork: 'Mixed cm and m silently scales answers by 100…',
      trap: '…unit consistency is not optional algebra — it changes the numerical result.',
      whyStudentsFall:
        'Students treat units as labels instead of part of the calculation.',
    },
    examLens: 'Speed traps mix cm, mm, and km/h in the same line of givens.',
  },
];

export function getTrapsForSubject(subject: CourseTrapSubject): CourseTrapPrototype[] {
  return COURSE_TRAP_PROTOTYPE_LIBRARY.filter(t => t.subject === subject);
}

export function getTrapBySubjectIndex(
  subject: CourseTrapSubject,
  index: number,
): CourseTrapPrototype {
  const traps = getTrapsForSubject(subject);
  return traps[index % traps.length] ?? traps[0];
}

/** Three impulses for one round starting at startIndex (mod library size). */
export function getThreeTrapsForRound(
  subject: CourseTrapSubject,
  startIndex: number,
): CourseTrapPrototype[] {
  const traps = getTrapsForSubject(subject);
  if (traps.length === 0) return [];
  return [0, 1, 2].map(i => traps[(startIndex + i) % traps.length]!);
}
