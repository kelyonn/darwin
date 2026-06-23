#set page(
  paper: "a4",
  margin: (x: 2.2cm, y: 2.2cm),
  numbering: "1",
  footer: context [
    #set text(8pt, fill: rgb("#888"))
    Project Darwin — A Plain-Language Explainer
    #h(1fr)
    #counter(page).display()
  ],
)
#set text(size: 10.5pt, lang: "en")
#set par(justify: true, leading: 0.7em)
#show heading.where(level: 1): it => [
  #v(6pt)
  #block(fill: rgb("#4f46e5"), inset: (x: 10pt, y: 7pt), radius: 4pt, width: 100%)[
    #set text(fill: white, size: 14pt, weight: "bold")
    #it.body
  ]
  #v(4pt)
]
#show heading.where(level: 2): it => [
  #v(3pt)
  #set text(size: 12pt, fill: rgb("#4f46e5"), weight: "bold")
  #it.body
  #v(1pt)
]
#show heading.where(level: 3): it => [
  #set text(size: 10.5pt, fill: rgb("#1f2937"), weight: "bold")
  #it.body
]

// ---- callout helpers ----
#let keyidea(body) = block(
  fill: rgb("#eef2ff"), inset: 11pt, radius: 5pt, width: 100%,
  stroke: (left: 3pt + rgb("#4f46e5")),
)[#set text(size: 10pt); *Key idea.* #body]

#let analogy(body) = block(
  fill: rgb("#f0fdf4"), inset: 11pt, radius: 5pt, width: 100%,
  stroke: (left: 3pt + rgb("#16a34a")),
)[#set text(size: 10pt); *Analogy.* #body]

#let pitfall(body) = block(
  fill: rgb("#fef2f2"), inset: 11pt, radius: 5pt, width: 100%,
  stroke: (left: 3pt + rgb("#dc2626")),
)[#set text(size: 10pt); *Watch out.* #body]

// ============ COVER ============
#v(3cm)
#align(center)[
  #text(30pt, weight: "bold", fill: rgb("#4f46e5"))[Project Darwin]
  #v(6pt)
  #text(15pt, fill: rgb("#374151"))[A Plain-Language Explainer]
  #v(4pt)
  #text(11pt, style: "italic", fill: rgb("#6b7280"))[
    What this project is, why it is interesting, and every idea it rests on —\
    assuming you know none of them yet.
  ]
  #v(1.5cm)
  #block(width: 80%, align(left)[
    #set text(size: 10.5pt)
    This document teaches the project from zero. It does *not* assume you know what a
    neural network is, what evolution-as-an-algorithm means, or any jargon. Every term
    is built up from scratch. The four companion documents (PRD, Architecture,
    Environments, Research) are *specifications* — this one is the *understanding* you
    read first.
  ])
]
#pagebreak()

#outline(title: [Contents], depth: 2, indent: auto)
#pagebreak()

// ============ 1 ============
= 1. The whole project in one breath

Project Darwin is a program that *breeds* artificial brains, the way a farmer breeds
crops — by keeping the best and discarding the rest, over and over, until something
capable emerges. It does this in your web browser, with no special software, and the
entire thing is written from scratch (no borrowed "AI libraries").

The clever part is not any single brain. It is that *one unchanged piece of machinery*
can breed a brain that balances a pole, a brain that drives a car, a word that spells
itself out, a delivery route that shortens itself, and a pack of predators learning to
hunt — without that machinery ever being told what any of those problems *are*.

#keyidea[
  The project is built to prove a claim, not to solve a particular problem. The claim:
  *the breeding machine can be made completely ignorant of what it is breeding and what
  problem it is solving.* The wide variety of things it breeds is the *evidence* for that
  claim.
]

To understand why that is hard and interesting, you need two ideas: what a *neural
network* is, and what a *genetic algorithm* is. We build both from nothing.

// ============ 2 ============
= 2. Building block one: a neural network (an artificial brain)

Forget anything you have heard about AI. A neural network, at its core, is a very simple
thing: *a machine that takes in some numbers and gives back some numbers.* That is all.

You feed it a list of numbers (the *inputs*). Inside, it multiplies and adds them
together in a fixed pattern (this is the "matrix math" you may hear mentioned). Out the
other end comes another list of numbers (the *outputs*).

#analogy[
  Think of a row of dials and sliders wired to some light bulbs. You set the dials
  (inputs); the wiring mixes their effects; some bulbs glow brighter than others
  (outputs). The *wiring strengths* — how much each dial affects each bulb — are called
  the *weights*. Change the weights and the same dials produce different bulbs glowing.
  The "brain" is nothing but a particular set of weights.
]

Here is the crucial and counter-intuitive part:

#keyidea[
  The network has *no idea what its numbers mean.* If the first input is the angle of a
  falling pole, the network does not know that. To it, it is just "the first number." The
  *meaning* is assigned entirely from outside. This is the network's "blindness," and it
  is what makes the whole project possible (Section 6).
]

So a brain is just a bag of weights that turns input-numbers into output-numbers. The
question becomes: *how do you find a good set of weights* — one that turns "pole angle"
numbers into "correct push" numbers? That is where evolution comes in.

// ============ 3 ============
= 3. Building block two: evolution as an algorithm

The usual way to find good weights is called "training" (nudging the weights with
calculus). This project deliberately does *not* do that. Instead it uses *evolution* —
the same process that produced real brains in nature — turned into a recipe a computer
can follow. This recipe is called a *genetic algorithm*.

Here is the entire recipe, in plain words:

#block(fill: rgb("#f9fafb"), inset: 12pt, radius: 5pt, stroke: 0.5pt + rgb("#d1d5db"))[
  + *Start with a crowd.* Make a few hundred brains with completely random weights. They
    are all terrible. This crowd is called the *population*.
  + *Score everyone.* Let each brain attempt the task and give it a score for how well it
    did. This score is its *fitness*.
  + *Keep the best, breed them.* Pick the higher-scoring brains (this picking is called
    *selection*). Combine pairs of them to make "children" — children mix the weights of
    two parents (*crossover*) and get small random tweaks (*mutation*).
  + *Replace and repeat.* The children become the next *generation*. Go back to step 2.
]

Repeat this loop hundreds or thousands of times. Each generation is, on average, slightly
better than the last, because you keep what works and throw away what doesn't. After
enough rounds, brains that can actually do the task emerge — *even though no one ever
told them how.*

#analogy[
  Imagine a thousand random recipes for a cake. You bake them all, taste them, keep the
  twenty least-awful, mix-and-match their ingredients with small random changes, and bake
  a thousand new ones. Do this for a hundred rounds. You will end up with a good cake
  without ever knowing the "correct" recipe in advance. Evolution is trial-and-error with
  memory.
]

A few pieces of vocabulary you will see, all from that loop:

#table(
  columns: (auto, 1fr),
  inset: 7pt,
  stroke: 0.5pt + rgb("#e5e7eb"),
  fill: (_, row) => if row == 0 { rgb("#eef2ff") } else { white },
  [*Term*], [*Plain meaning*],
  [Population], [The crowd of candidate solutions in the current generation.],
  [Fitness], [The score telling you how good one candidate is.],
  [Selection], [Choosing which candidates get to breed (usually a small tournament: pick a few at random, the best one wins a breeding slot).],
  [Crossover], [Making a child by mixing two parents.],
  [Mutation], [Random small changes, so new ideas can appear.],
  [Elitism], [Copying the very best few unchanged into the next generation, so you never accidentally lose your champion.],
  [Generation], [One full turn of the loop.],
)

#keyidea[
  Combine the two building blocks and you get *neuroevolution*: using evolution
  (Section 3) to find the weights of a neural network (Section 2). That is the engine at
  the heart of Project Darwin.
]

// ============ 4 ============
= 4. The two "blindnesses" — the heart of the project

Now we can state the actual thesis precisely. The project rests on *two* kinds of
deliberate ignorance, stacked on top of each other.

#block(fill: rgb("#f9fafb"), inset: 12pt, radius: 5pt, stroke: 0.5pt + rgb("#d1d5db"))[
  *Blindness 1 — the brain is blind to the world.* The network just turns numbers into
  numbers (Section 2). It never knows whether a number is a pole angle or a distance to
  food. Something *outside* the network decides what the numbers mean.

  *Blindness 2 — the breeding machine is blind to what it breeds.* The genetic algorithm
  (Section 3) never looks inside a candidate. It only ever asks four things of it: copy
  yourself, mutate yourself, breed with this other one, and here is your score. As long
  as a thing can answer those four, the machine can evolve it — be it a brain, a word, or
  a route.
]

#keyidea[
  Because of these two blindnesses, the *same* breeding machine drives a word-speller and
  a pole-balancer. The only thing that changes between two completely different problems
  is one small, self-contained file describing the new problem. Everything else is
  untouched. Proving that this is genuinely true — that nothing leaks across the
  boundary — is the entire point.
]

// ============ 5 ============
= 5. The keystone: the "Genome"

How do you let the breeding machine work on a brain *and* a word *and* a route without
knowing the difference? You make all of them agree to the same tiny contract. That
contract is called the *Genome*, and it has exactly four parts:

#table(
  columns: (auto, 1fr),
  inset: 7pt,
  stroke: 0.5pt + rgb("#e5e7eb"),
  fill: (_, row) => if row == 0 { rgb("#eef2ff") } else { white },
  [*The contract asks*], [*What it means*],
  [Clone yourself], [Make an exact copy (used to preserve champions).],
  [Mutate yourself], [Make a slightly-changed copy.],
  [Breed with another], [Combine yourself with a second one to make a child.],
  [Hold a fitness score], [A number the outside world writes onto you.],
)

Anything that can do those four things is a valid Genome, and the machine will happily
evolve it. The project deliberately ships *four wildly different* Genomes to hammer the
point home:

#table(
  columns: (auto, auto, 1fr),
  inset: 7pt,
  stroke: 0.5pt + rgb("#e5e7eb"),
  fill: (_, row) => if row == 0 { rgb("#eef2ff") } else { white },
  [*Genome*], [*"Mutate" means*], [*Used to*],
  [A string of letters], [flip a random letter], [spell a target word],
  [A list of numbers], [nudge the numbers], [find the lowest point of a landscape],
  [An ordering of stops], [swap two stops], [shorten a delivery route],
  [A neural network], [jiggle the weights], [balance poles, drive cars, hunt prey],
)

#analogy[
  It is like a universal power socket. A lamp, a laptop, and a kettle are utterly
  different inside, but they all expose the same plug. The socket (the breeding machine)
  doesn't care what's on the other end — it only speaks "plug." The Genome is that plug.
]

The first three Genomes use *no neural network at all.* They are the cleanest possible
proof that the machine is blind to what it breeds — and they double as the project's
self-tests.

// ============ 6 ============
= 6. How a problem gets scored: "Environments"

If the Genome is the thing being evolved, the *Environment* is the self-contained file
that defines a *problem*. Each environment does three jobs: it creates a starting
population of the right Genome type, it decides how to *score* one candidate, and it draws
the result on screen.

There are two flavours of scoring:

#block(fill: rgb("#f9fafb"), inset: 12pt, radius: 5pt, stroke: 0.5pt + rgb("#d1d5db"))[
  *One-shot:* the candidate is judged in a single instant. "How close is this word to the
  target?" No time, no simulation. (Spelling, route-finding, the landscape problem.)

  *Episodic:* the candidate is dropped into a little simulated world and judged over
  *time*. "How many seconds did the pole stay up?" The brain is consulted every tick of a
  tiny clock, and reward piles up. (Pole-balancing, car-driving, predators and prey.)
]

The breeding machine never knows which flavour it is dealing with. It just asks the
Environment "score this one," and a number comes back.

// ============ 7 ============
= 7. The famous trap: rewarding the wrong thing

This is the project's signature lesson, and it is worth understanding because it is a
live issue in real-world AI.

Evolution optimises *exactly the number you write down* — not the thing you *meant.* If
your scoring formula has a loophole, evolution will find the loophole instead of solving
the problem, because the loophole scores higher.

#pitfall[
  *A true story the project is built around.* Suppose you are evolving spacecraft and you
  score them by "closeness to target, divided by fuel used" — sensible-sounding. But a
  spacecraft that *never fires its engines* uses almost zero fuel, and dividing by
  almost-zero gives a near-infinite score. So evolution proudly breeds spacecraft that do
  nothing at all. It optimised what you *wrote*, not what you *wanted*.
]

This is called *reward hacking*. The project's defence is a single rulebook applied to
every environment: never divide by a cost that could be zero, and always make *progress*
(distance covered, checkpoints reached) count for far more than *efficiency* (fuel saved).
Efficiency is only a tie-breaker after the task is basically solved.

#keyidea[
  The hard part of this kind of AI is usually not the algorithm — it is *designing the
  score so it can't be cheated.* That insight is more valuable than any single environment.
]

// ============ 8 ============
= 8. The third lever: *how* you search

So far the machine has one strategy: "keep the highest scorers." But that is only one way
to search, and sometimes a bad one. The project treats the *search strategy itself* as a
swappable part. Four strategies, in plain terms:

#table(
  columns: (auto, 1fr),
  inset: 7pt,
  stroke: 0.5pt + rgb("#e5e7eb"),
  fill: (_, row) => if row == 0 { rgb("#eef2ff") } else { white },
  [*Strategy*], [*The idea, plainly*],
  [Objective], [Keep whatever scores highest. The default. Simple, but can get stuck.],
  [Novelty search], [*Ignore the goal entirely* and reward anything that behaves in a new, unseen way. Surprisingly, "just explore" sometimes solves a problem that "aim at the goal" cannot — because aiming at the goal walks you into a dead end.],
  [Quality-Diversity], [Don't look for one winner. Collect a whole *gallery* of good-but-different solutions — a fast runner, a slow crawler, a hopper — and keep the best of each kind.],
  [Co-evolution], [Two populations evolve *against each other* — predators vs prey — so the problem itself keeps getting harder. (Section 9.)],
)

#keyidea[
  This is the project's "third axis." It already swaps *what* is evolved (Genome) and
  *what* problem (Environment). Adding swappable *search strategy* means one core can run
  four fundamentally different kinds of search — which, as we'll see, is also where the
  project's research contribution hides (Section 11).
]

#analogy[
  Looking for the best restaurant in a city. *Objective*: always walk toward wherever
  smells best — you may get stuck on one good street and never find the great one two
  blocks away. *Novelty*: deliberately visit neighbourhoods you've never seen — you cover
  far more ground. *Quality-Diversity*: keep the best restaurant of *each* cuisine, not
  one overall winner. Same city, three very different ways to explore it.
]

// ============ 9 ============
= 9. The crown jewel: predators, prey, and the Red Queen

The hardest and most striking part of the project is *co-evolution*: evolving foxes to
catch rabbits *and*, at the same time, rabbits to escape foxes. Neither side has a fixed
target — each is the other's moving target.

This is mesmerising to watch (an arms race anyone understands at a glance) and genuinely
difficult, for a deep reason:

#keyidea[
  *The Red Queen problem.* When your opponent is also evolving, "how good am I?" has no
  fixed answer. A rabbit that is brilliant against today's clumsy foxes may be hopeless
  against next month's clever ones. The score keeps shifting under your feet, so you can't
  even tell whether you're improving. (The name comes from Lewis Carroll: the Red Queen
  runs as fast as she can just to stay in the same place.) This is a real idea from
  evolutionary biology, not a programming quirk.
]

Co-evolution also fails in fascinating ways the project has to defend against. The worst:
one side gets *so* dominant that every member of the other side loses equally — so the
machine can no longer tell the losers apart, breeding becomes random, and *both* sides
collapse. (This is the same failure that makes certain modern AI systems, like the ones
behind image generators, unstable to train.) The fixes have names like "Hall of Fame"
(keep beating champions from the past, so you never forget old tricks), and the project
builds special charts just to *see* whether the arms race is genuinely progressing or
secretly running in circles.

// ============ 10 ============
= 10. Making it fast (and why that's a good story)

A demo that only runs on a powerful computer is unimpressive. The interesting engineering
is making hundreds — eventually *tens of thousands* — of brains run smoothly at 60 frames
per second, even on a phone.

The headline trick: the most-repeated piece of math (running every brain forward) is
written *once* behind a single "slot," with *three* interchangeable engines that can fill
that slot:

#table(
  columns: (auto, 1fr),
  inset: 7pt,
  stroke: 0.5pt + rgb("#e5e7eb"),
  fill: (_, row) => if row == 0 { rgb("#eef2ff") } else { white },
  [*Engine*], [*What it is, plainly*],
  [Plain JavaScript], [The simple, always-works version, readable line by line.],
  [Rust to WebAssembly], [Rewrite *only* the hot inner loop in a faster language, then *measure* exactly how much faster. The story isn't "I used a fast language" — it's "I found the bottleneck, fixed it, and proved the speed-up with numbers."],
  [WebGPU], [Hand the work to the graphics card, which can run thousands of brains *at once* (each brain is independent, which is exactly what graphics cards are good at). This is the leap from "hundreds of agents" to "tens of thousands."],
)

#keyidea[
  The prize is a *comparison table* — the same task run on all three engines, with real
  measured numbers. "One piece of math, three engines, here's the head-to-head" is a
  stronger demonstration of skill than adding yet another environment.
]

// ============ 11 ============
= 11. Could this be real research? (yes, in a specific way)

Re-building known methods is excellent craftsmanship but not, by itself, *research* —
research needs a question nobody has answered. The project has one, and it falls out of
its own design for free:

#keyidea[
  *The open question.* The tricks that keep a predator-prey arms race healthy were all
  invented and tested on *one* kind of brain. Do they work the same way on *every* kind of
  thing you might evolve — a word, a list of numbers, a route, a brain? Nobody has
  checked, because checking requires a machine that can evolve all of those *identically*
  — which is *exactly the machine this project is.* The architecture makes the question
  askable almost by accident.
]

The likely finding, stated plainly: the stabilising tricks probably *do* carry across all
representations *in kind*, but the *amount* you need of them changes depending on how
"big a jump" each kind of mutation makes. Even more interesting would be finding a kind of
thing where the tricks *break* — a clean counter-example. Either way, it is a real,
publishable result, and it is one only this particular engine can produce. (Full detail in
the Research document.)

// ============ 12 ============
= 12. How it actually gets built (the order)

The project is built in a deliberate order, where each step adds *exactly one* new idea
and ends with something visibly running. You never move on until the current thing works.

#block(fill: rgb("#f9fafb"), inset: 12pt, radius: 5pt, stroke: 0.5pt + rgb("#d1d5db"))[
  + The breeding machine + the Genome contract. No problem yet — just the engine.
  + *Weasel:* evolve a random string into a target word. First thing on screen. No maths,
    no brain. (Already a real little project on its own.)
  + *Landscape* and *Route* problems: prove the same engine handles totally different
    Genomes.
  + *XOR:* the first actual neural network, on the smallest possible task, so the maths is
    easy to check.
  + *Pole-balancing*, then *car-driving:* the first problems that play out over *time*.
  + The dashboard: charts that make the learning visible.
  + The speed pass: make it fast, measure honestly.
  + *Predators and prey:* the crown jewel.
  + *Maze + novelty* and *gait + gallery:* prove the swappable search strategies.
  + Scale it up (WebGPU), publish the demo, write the research study.
]

#keyidea[
  Crucially, you do *not* have to reach the end for this to be worth showing. Steps 1–5,
  put online, already demonstrate "built entirely from scratch" and "cleanly decoupled
  design." Everything after is upside.
]

// ============ 13 ============
= 13. What "finished" looks like

The project is considered done when all of these are true:

- Four totally different Genomes (word, numbers, route, brain) all evolve through *one
  unchanged* breeding machine.
- The core engine genuinely imports nothing problem-specific — the separation is enforced,
  not just claimed.
- Running it twice with the same starting seed gives an *identical* result, every time
  (so bugs are reproducible and demos are stable).
- The brain's maths is proven correct by its own tests, *separately* from whether
  evolution works.
- No scoring formula can be cheated by a do-nothing candidate.
- It opens in any browser with zero setup and lands on the predator-prey arms race.
- It holds 60 frames per second at a *measured* number of agents — with the number stated
  honestly, including on a phone.

// ============ 14 ============
= 14. The family of documents

This explainer is the front door. Behind it are four specifications, each going deep on
one face of the project:

#table(
  columns: (auto, 1fr),
  inset: 7pt,
  stroke: 0.5pt + rgb("#e5e7eb"),
  fill: (_, row) => if row == 0 { rgb("#eef2ff") } else { white },
  [*Document*], [*What it covers*],
  [This explainer], [The ideas, from zero. Read first.],
  [PRD], [The product pitch: the thesis, the tech choices, the deliverables, the résumé framing.],
  [Architecture], [How the code is structured: the three swappable axes, the interfaces, the speed engines, the language choice.],
  [Environments], [Every problem in detail: inputs, outputs, scoring, what each one proves.],
  [Research], [The biology and the prior science, the open question, and how a real study would be run.],
)

// ============ GLOSSARY ============
= 15. Glossary

#table(
  columns: (auto, 1fr),
  inset: 6pt,
  stroke: 0.5pt + rgb("#e5e7eb"),
  fill: (_, row) => if calc.odd(row) { white } else { rgb("#f9fafb") },
  [*Neural network*], [A machine that turns input numbers into output numbers via fixed multiply-and-add steps. Its behaviour is decided by its "weights."],
  [*Weights*], [The adjustable numbers inside a network that determine what it does. Finding good weights is the whole game.],
  [*Genetic algorithm*], [Finding good solutions by repeatedly scoring a crowd, keeping the best, and breeding them with random tweaks.],
  [*Neuroevolution*], [Using a genetic algorithm to find a neural network's weights (instead of "training" them with calculus).],
  [*Population*], [The crowd of candidate solutions in one generation.],
  [*Fitness*], [A candidate's score — how well it did the task.],
  [*Selection*], [Choosing which candidates breed, usually favouring higher fitness.],
  [*Crossover*], [Making a child by combining two parents.],
  [*Mutation*], [Small random changes that introduce new possibilities.],
  [*Elitism*], [Copying the best few candidates forward unchanged.],
  [*Generation*], [One full round of score-select-breed-replace.],
  [*Genome*], [The minimal four-part contract (clone, mutate, breed, hold a score) that lets the engine evolve anything.],
  [*Environment*], [A self-contained file defining one problem: how to score it and how to draw it.],
  [*One-shot / Episodic*], [Scored in a single instant / scored over simulated time.],
  [*Reward hacking*], [Evolution exploiting a loophole in your scoring instead of solving the real problem.],
  [*Novelty search*], [Rewarding new behaviour while ignoring the goal — a way to escape dead ends.],
  [*Quality-Diversity*], [Collecting a gallery of good-but-different solutions rather than one winner.],
  [*Co-evolution*], [Two populations evolving against each other (e.g. predators and prey).],
  [*Red Queen*], [The idea that when your opponent also evolves, you must keep improving just to hold your ground.],
  [*Hall of Fame*], [Keeping past champions around to keep testing against, so you never forget old skills.],
  [*Seed / seeded randomness*], [A starting value that makes "random" choices repeatable, so a run can be reproduced exactly.],
  [*WebGPU / WebAssembly*], [Browser technologies used to make the maths run much faster (on the graphics card / in a fast compiled language).],
)

#v(8pt)
#align(center)[#text(9pt, style: "italic", fill: rgb("#6b7280"))[
  End of explainer. Next stop: the PRD, or — better — watch Step 2 (Weasel) run on screen.
]]
