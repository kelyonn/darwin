# Project Darwin — Research Document

**Companion to the PRD. The PRD defends an *engineering* thesis (a representation-blind engine). This document asks whether the same artifact can carry a *research* contribution, what that contribution is, what prior work it sits inside, and how it would be evaluated.**

Status: pre-implementation. Everything here is a plan and a hypothesis, not a result. No numbers in this document are measured yet; any that appear are targets or placeholders marked `[TBD]`.

---

## 0. The honest framing (read this first)

A from-scratch reimplementation of known algorithms is **excellent engineering and zero research**. Novelty Search, MAP-Elites, NEAT, and the Hall of Fame are all published and battle-tested. Rebuilding them earns a portfolio, not a paper.

A paper needs a **delta** — a question prior work has not answered. This document's job is to locate a delta that is (a) genuinely open, (b) reachable on a laptop by one person, and (c) a natural *consequence* of the engine we are building anyway, so that the research is upside on top of a project that is already worth shipping.

The conclusion, stated up front so the rest can justify it:

> **The defensible research question is representation-invariance of coevolutionary dynamics.** Do the techniques that stabilise a competitive arms race — Hall of Fame, competitive fitness sharing, behaviourally-diverse opponent archives — behave the *same way* across structurally unrelated genome representations (strings, vectors, permutations, networks)? Nobody has asked this cleanly, because asking it requires a representation-blind coevolution engine, which almost nobody builds. **We are building exactly that engine for independent reasons.** The question falls out of the architecture for free.

Everything below supports or scopes that claim.

---

## 1. Background — the four search paradigms

The engine decouples three axes: **representation** (genome), **problem** (environment), and **selection pressure** (search paradigm). The third axis is the research surface. Four paradigms live on it:

| Paradigm | Optimises for | Output | Canonical source |
|---|---|---|---|
| **Objective GA** | a fixed fitness function | one champion | classical GA (Holland 1975) |
| **Novelty Search** | behavioural *novelty*, ignoring the objective | one champion, found by *not* aiming at it | Lehman & Stanley 2011 |
| **Quality-Diversity (MAP-Elites)** | best solution *per behaviour niche* | a diverse *archive* | Mouret & Clune 2015; Pugh et al. 2016 |
| **Competitive coevolution** | beating a *co-evolving opponent* | two adapted populations (an arms race) | Rosin & Belew 1997; Hillis 1990 |

The first is the baseline. The other three are *divergent* or *interactive* search, and they are where modern evolutionary computation actually lives (open-endedness, self-play, QD). The whole point of the engine is that all four run on the *same* genome-blind core.

---

## 2. Biological grounding (what the PRD is missing)

The PRD is computationally literate and biologically silent. For a research framing — and for the predator-prey "crown jewel" to be more than a cartoon — the biology must be cited, because the algorithms are direct transcriptions of biological theory.

### 2.1 The Red Queen — why an arms race never "finishes"

Leigh Van Valen's **"A New Evolutionary Law" (1973)** observed from the fossil record that a taxon's extinction probability is roughly constant over time, independent of how long it has already survived. His explanation: species coevolve, so every adaptation by one degrades the effective environment of others, and each must keep adapting *just to maintain the same relative fitness* — running to stay in place, after the Red Queen in *Through the Looking-Glass*.

This is **the exact reason coevolutionary fitness is non-stationary** and cannot be compared across generations (PRD §10 / predator-prey). A rabbit's absolute score is meaningless; only its score *relative to the current fox population* means anything. The Red Queen is not a metaphor we borrow — it is the literal dynamic the engine reproduces.

- Van Valen 1973, *A New Evolutionary Law*, Evolutionary Theory 1:1–30. Modern revisit: [Springer, Biological Theory 2021](https://link.springer.com/article/10.1007/s13752-021-00391-w).

### 2.2 Arms races and the life–dinner principle

Dawkins & Krebs, **"Arms races between and within species" (1979)**, formalised predator-prey escalation: an adaptation in predators changes selection pressure on prey, provoking a counter-adaptation, and reciprocally — a runaway escalation. Crucially they note **asymmetry**: "the rabbit runs faster than the fox, because the rabbit is running for its life while the fox is only running for its dinner" (the *life–dinner principle*). A lineage under stronger selection out-evolves a weakly selected one.

This maps directly onto the **disengagement failure mode** (§4.1): asymmetric selection pressure is *the* mechanism by which one population pulls away, flattens the other's gradient, and collapses the race. The biology predicts the bug.

- Dawkins & Krebs 1979, Proc. R. Soc. B 205(1161):489–511. [Royal Society](https://royalsocietypublishing.org/doi/10.1098/rspb.1979.0081).
- Fossil-record escalation (Vermeij): [Cambridge, *The Fossil Record of Predator-Prey Arms Races*](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/5967ADC32E5AA23E1A4731A9AC3B15F0/S1089332600001157a.pdf/div-class-title-the-fossil-record-of-predator-prey-arms-races-coevolution-and-escalation-hypotheses-div.pdf).

### 2.3 The bridge from biology to computation

Danny **Hillis (1990)** showed that adding *coevolving parasites* to a GA evolving sorting networks produced better solutions than evolving against a fixed objective — the first demonstration that a biological arms race is a *useful optimisation engine*, not just a model of nature. This is the intellectual hinge of the entire predator-prey environment and the historical origin of the Hall of Fame lineage.

- Hillis 1990, *Co-evolving parasites improve simulated evolution as an optimization procedure*, Physica D 42:228–234. (Canonical; foundational to competitive coevolution.)

### 2.4 Novelty, open-endedness, and "interestingness" in nature

Natural evolution has no objective function — it does not aim at humans, eyes, or wings; it accumulates whatever survives and is *different enough* to persist. Novelty Search (§3) is the computational claim that *abandoning the objective* can outperform pursuing it, precisely because nature does. This connects to **open-endedness**: the property of a process that keeps producing novel, increasingly complex artifacts indefinitely. It is currently one of the hottest framings in AI (see §5).

---

## 3. Technical lineage (the algorithms, with sources)

**Novelty Search** — Lehman & Stanley, *Abandoning Objectives: Evolution Through the Search for Novelty Alone* (Evolutionary Computation 19(2), 2011). Reward an individual for how *behaviourally different* it is from an archive of past behaviours, ignoring the goal entirely. Defeats deception. [PDF](https://www.cs.swarthmore.edu/~meeden/DevelopmentalRobotics/lehman_ecj11.pdf) · [MIT Press](https://direct.mit.edu/evco/article-abstract/19/2/189/1365/).

**MAP-Elites / Quality-Diversity** — Mouret & Clune, *Illuminating Search Spaces by Mapping Elites* (2015). Keep the best genome *per cell* of a behaviour-descriptor grid; return the filled archive, not one winner. [arXiv:1504.04909](https://arxiv.org/abs/1504.04909) · [tutorial notebook](https://github.com/jbmouret/map_elites_tutorial). Survey: Pugh, Soros & Stanley, *Quality Diversity: A New Frontier for Evolutionary Computation* (Frontiers in Robotics & AI, 2016).

**Competitive coevolution toolkit** — Rosin & Belew, *New Methods for Competitive Coevolution* (Evolutionary Computation 5(1), 1997). Source of the three stabilisers we implement: **Hall of Fame**, **competitive fitness sharing**, **shared sampling**. [MIT Press](https://direct.mit.edu/evco/article-abstract/5/1/1/790/).

**The failure modes, named** — Watson & Pollack / Cliff & Miller, *Challenges in Coevolutionary Learning: Arms-Race Dynamics, Open-Endedness, and Mediocre Stable States*. [ResearchGate](https://www.researchgate.net/publication/2765711). Long-term progress measurement: [*Long-Term Progress and Behavior Complexification in Competitive Co-Evolution* (arXiv:1909.08303)](https://arxiv.org/pdf/1909.08303).

**Evolving topology (deferred, but cite it)** — Stanley & Miikkulainen, *Evolving Neural Networks through Augmenting Topologies* (NEAT, Evolutionary Computation 10(2), 2002). PRD keeps topology fixed for the MVP; NEAT is the named extension. Modern accelerated variant: [*TensorNEAT* (arXiv:2504.08339)](https://arxiv.org/pdf/2504.08339), up to 500× via GPU tensorisation — relevant if the scale mandate (PRD §8) ever needs it.

---

## 4. The hard part — coevolutionary failure modes

The predator-prey environment is the centrepiece because it is the only one whose fitness *moves*. Four pathologies, each with the biological analogue and the algorithmic fix.

### 4.1 Disengagement / loss of gradient *(the main one)*
One population dominates so completely that every opponent scores identically; selection loses its signal, drifts, and both populations decay. Biological analogue: asymmetric selection / life–dinner principle (§2.2). Fix: **competitive fitness sharing** + **k-opponent sampling** to keep a gradient alive.

### 4.2 Cycling / intransitivity
Rock-paper-scissors strategy loops. Locally each generation improves; globally it is a circle. Fix: **Hall of Fame** — evaluating against archived past champions punishes forgetting old counters.

### 4.3 Forgetting
A population specialises against current opponents and loses to ones it already beat. Fix: **Hall of Fame** (same mechanism).

### 4.4 Mediocre stable states
Both sides settle into a dull truce and stop escalating. Fix: diversity pressure (fitness sharing, or a **behaviourally-diverse opponent archive** — §6).

### 4.5 The measurement problem (meta)
Because fitness is relative (§2.1), *you cannot tell from the fitness curve whether you are progressing*. This demands measurement tooling that does not depend on the moving fitness:

- **CIAO plot** (Current Individual vs Ancestral Opponents): heatmap of each generation's champion against *every past* opponent. Smooth gradient ⇒ genuine progress; diagonal banding ⇒ cycling. It renders the Red Queen on screen and is the single most valuable observability artifact in the project.
- **Dominance tournament** (Stanley): count how many past champions each new champion can beat — a monotonic progress proxy.
- **Frozen benchmark probe**: a hand-coded reference opponent measured against but *never selected on*, giving an absolute anchor.

---

## 5. The modern frontier (so we are not building something outdated)

Coevolution and QD are not dusty 1990s topics — they are the engine room of the current **open-endedness** wave:

- **POET** (Wang et al. 2019) — coevolves agents *and their environments*, open-endedly generating problems and their solutions. [arXiv:1901.01753].
- **Open-Endedness is Essential for Artificial Superhuman Intelligence** (DeepMind, Hughes et al. 2024) — argues open-ended discovery is a prerequisite for ASI; positions this whole family as central, not niche. [arXiv:2406.04268](https://arxiv.org/pdf/2406.04268).
- **OMNI-EPIC** (ICLR 2025) — foundation models generate the next *interesting* environment in code. [arXiv:2405.15568](https://arxiv.org/abs/2405.15568) · [code](https://github.com/maxencefaldor/omni-epic).
- **Foundation-Model Self-Play** (2025) — open-ended strategy innovation via FMs. [arXiv:2507.06466](https://arxiv.org/pdf/2507.06466).
- **Tournament-Informed Adversarial Quality Diversity** (Anne, Syrkis, … Risi, 2026) — **directly fuses QD with competitive coevolution via tournament-informed selection.** [arXiv:2601.19562](https://arxiv.org/pdf/2601.19562). *This is the closest prior work to our novel angle and must be cited as such — see §6.*

Curated trackers to stay current: [awesome-open-ended](https://github.com/jennyzzt/awesome-open-ended) · [divergence-and-quality-diversity](https://github.com/DanieleGravina/divergence-and-quality-diversity).

**Implication.** The QD × coevolution corner is *active and partly occupied* (Risi 2026). Naïve "let's combine QD and coevolution" is already taken and done with heavy GPU/JAX compute. Our contribution cannot be "combine them"; it must be something their setup structurally *cannot* do. That is what §6 identifies.

---

## 6. The research gap and the contribution

### 6.1 What is genuinely open

The 2026 tournament-QD work, POET, and OMNI-EPIC are all (a) **single-representation** (a fixed neural controller or a fixed env-encoding) and (b) **compute-heavy and non-reproducible on a laptop**. Two gaps follow directly:

**Gap A — representation-invariance (the strong angle).** Every coevolution and QD result in the literature is reported on *one* representation. Whether the stabilisers (Hall of Fame, fitness sharing, behaviourally-diverse opponent archives) are *representation-invariant* — i.e. help the same way for a string, a vector, a permutation, and a network — is **untested, because no one has a representation-blind coevolution engine to test it with.** Our architecture's entire reason for existing makes this question askable. This is the contribution most uniquely *ours*.

**Gap B — interpretable, reproducible coevolution dynamics (the accessibility angle).** The frontier work is opaque (high-dim robotics) and irreproducible (GPU clusters). A **zero-dependency, browser-native, fully seed-reproducible** testbed where coevolutionary dynamics are *visible* (CIAO plots, live arms-race rendering) on *legible* benchmarks is a real tools/reproducibility/education contribution. The big labs are not serving this niche; they cannot, by construction.

### 6.2 The hypothesis

> **H1 (representation-invariance).** Competitive-coevolution stabilisers (Hall of Fame, competitive fitness sharing) reduce disengagement and cycling *to a similar relative degree* across string, vector, permutation, and network genomes — i.e. the benefit is a property of the *search paradigm*, not the representation.
>
> **H2 (behaviourally-diverse Hall of Fame).** Replacing a "best-N" Hall of Fame with a **behaviourally-diverse** archive of past opponents (a QD-style HoF) further delays disengagement, because a behaviourally diverse opponent set is harder to collapse the gradient against. Measured by time-to-disengagement and CIAO-plot smoothness.

H1 is the defensible, uniquely-enabled core. H2 is the higher-risk, higher-reward swing that connects to the 2026 frontier while differing from it (lightweight, interpretable, cross-representation, archive-as-HoF rather than tournament-as-selection).

### 6.3 Three publication paths (ascending difficulty)

1. **Software / reproducibility paper — the floor (high confidence).** The platform itself: zero-dependency, browser-native, seed-reproducible, swappable genome × environment × paradigm. Venue: [JOSS](https://joss.theoj.org/) or a GECCO/EvoStar (EvoApps) software/education track. Contribution = accessibility + reproducibility. *This is achievable essentially as a byproduct of shipping.*
2. **Empirical study — the realistic target (medium confidence).** Run H1 as a controlled cross-representation study with proper statistics. New *measurements*, known methods. Workshop-tier at GECCO/ALIFE/EvoStar.
3. **Algorithmic result — the swing (lower confidence).** Establish H2 with significance and ablations, differentiated from Risi 2026 by interpretability + cross-representation generality. If it holds, a workshop or short conference paper.

**Recommended posture:** build for path 1 (free), design experiments for path 2 (the honest target), and frame predator-prey so path 3 is reachable but never load-bearing. Never delay shipping the engine for the paper — the paper is built *on* a working engine.

---

## 7. Experimental design (what a real study requires)

A demo proves it runs once; a paper proves it holds. The gap between them is this section, and it is a different time budget — budget it separately from the demo.

- **Seeds.** Every reported number is a mean over **≥30 seeded runs** with confidence intervals or a non-parametric test (Mann–Whitney U); the seeded PRNG (PRD §2) makes this exact and reproducible.
- **Baselines.** Vanilla coevolution (no stabiliser) vs +HoF vs +fitness-sharing vs +behaviourally-diverse-HoF (H2), each across all four genome types (H1).
- **Metrics.** (1) time-to-disengagement; (2) CIAO-plot progress score; (3) dominance-tournament monotonicity; (4) performance vs the frozen benchmark probe; (5) population behavioural diversity over time.
- **Ablations.** Vary HoF size, sampling k, archive resolution; show the effect is not a single lucky setting.
- **Headless batch mode.** These runs must execute *without rendering*, in parallel, off the browser — see ARCHITECTURE.md §language for why the core must run under a headless runtime (Bun/Node), not only in the browser.
- **Threats to validity.** Toy benchmarks may not transfer to high-dim tasks (acknowledge); behaviour-descriptor choice biases QD/novelty results (report sensitivity); "disengagement" needs an operational definition fixed *before* running.

---

## 8. Open research questions (ideation backlog)

- Does novelty-driven *coevolution* (select opponents for novelty, not just strength) escape mediocre stable states better than fitness-driven coevolution?
- Can a CIAO plot be turned into an **automatic** cycling detector that triggers a stabiliser online (close the loop)?
- Is there a representation for which coevolution stabilisers *fail* — a counterexample to H1? A negative result here is still publishable and more interesting than a clean confirmation.
- Minimal open-endedness: can the maze/gait environments be made to *generate their own* harder variants (a tiny POET), with zero ML libraries?

---

## 9. Master reference list

**Biology** — Van Valen 1973 (Red Queen); Dawkins & Krebs 1979 (arms races, life–dinner); Vermeij (escalation); Hillis 1990 (parasites as optimiser).
**Algorithms** — Lehman & Stanley 2011 (novelty); Mouret & Clune 2015 + Pugh et al. 2016 (QD); Rosin & Belew 1997 (coevolution toolkit); Stanley & Miikkulainen 2002 (NEAT); Watson/Cliff & Miller (failure modes).
**Frontier (recent)** — Wang et al. 2019 (POET); Hughes et al. 2024 (open-endedness & ASI); OMNI-EPIC 2025; Foundation-Model Self-Play 2025; Anne…Risi 2026 (tournament QD); TensorNEAT 2024.
**Trackers** — awesome-open-ended; divergence-and-quality-diversity.

(Full URLs inline in §§2–5.)
