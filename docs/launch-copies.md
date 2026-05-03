# Skyglass — copies de lancement (copier-coller)

Ce fichier centralise **toutes les copies prêtes à publier**, par canal, dans
l'ordre chronologique du jour J. Chaque section est autonome : tu copies, tu
colles, tu adaptes la dernière virgule, tu envoies.

> **Date de lancement recommandée** : **lundi 11 mai 2026, 10h00 ET (16h00 CET)**.
> — laisse 8 jours de prépa (DMs, blog, landing optionnelle) et évite Memorial Day (25 mai).
> Alternative serrée : **lundi 4 mai 2026** si tout est en place.

---

## 0 — Pre-flight checklist (J-1)

À cocher la veille au soir, dans l'ordre :

- [ ] `npm publish` exécuté → `npm view skyglass-cli version` retourne `0.1.1`
- [ ] `npx skyglass-cli@latest --demo` testé sur 1 machine vierge (autre que celle où le code a été écrit)
- [ ] `npx skyglass-cli@latest --demo` testé sur Linux/WSL (clean Ubuntu container OK)
- [ ] README s'affiche correctement sur GitHub (gif charge, badges OK, pas de lien cassé)
- [ ] LinkedIn Post Inspector + Twitter Card Validator → carte sociale propre
- [ ] Vidéos accessibles publiquement : `https://github.com/itsyounish/Skyglass/raw/main/docs/assets/hero-10s.mp4`
- [ ] HN account ≥ 1 an d'âge ou karma ≥ 50 (sinon le post est noyé immédiatement)
- [ ] Reddit karma ≥ 50 dans chacun des 4 subs ciblés (sinon ban modo auto)
- [ ] Compte X chargé, bio mise à jour, tweet épinglé prêt
- [ ] Compte LinkedIn : photo récente, headline mise à jour ("Building skyglass · open-source cloud visualizer")
- [ ] Tracking : Plausible ou Umami live sur la landing si tu en as une, sinon GitHub Insights ouvert
- [ ] **Bloque ton agenda** lundi 10h–16h ET : tu seras 100% en réponses comments

---

## T+0 — Show HN

### Titre (≤ 80 chars, pas de marketing-speak)

```
Show HN: Skyglass – See your entire AWS/Azure/GCP as a live graph (local-first)
```

**URL à coller** : `https://github.com/itsyounish/Skyglass`

### Premier commentaire OP — à publier dans les 60s suivant le post

```
Hey HN, author here.

I built Skyglass because I was tired of clicking through 40 tabs in the AWS
Console to understand the blast radius of a single RDS incident. Terraform
state has the answer, but as a JSON blob no human can read.

Skyglass scans AWS/Azure/GCP read-only, builds a dependency graph, and
renders it in your browser as an interactive 2D canvas — with official
service icons, semantic zoom, and a blast-radius mode that animates
cascading failures.

Technical choices I'd love feedback on:

- Canvas 2D, zero WebGL / Three.js. The 3D demos I prototyped looked great
  until ~200 nodes, then frame rate collapsed. Canvas 2D + sprite caching
  holds 60fps at 1000+ nodes on a MacBook Air.
- Barnes-Hut quadtree force layout in a Web Worker (O(n log n)).
- Local-first: credentials and scan results never leave your machine.
  The only network call is fetching official service icons from the
  public tf2d2/icons CDN on first load.
- Optional Terraform state import (`--from terraform.tfstate`) for teams
  who'd rather not run live scans.
- Read-only IAM: only `Describe*`, `List*`, `Get*` calls. There's a
  `--generate-policy` flag that prints a minimal IAM policy you can hand
  to your security team.

Try it without credentials:

    npx skyglass-cli --demo

Happy to dig into the rendering architecture, the force layout choices,
the cloud-SDK design, or anything else. Open issues if you find rough
edges — I reply fast.

Repo: https://github.com/itsyounish/Skyglass
```

### Règles HN absolues (rappel)

- Réponds à **tous** les commentaires en < 15 min sur les 2 premières heures.
- Ne te défends jamais ; remercie, puis explique le tradeoff.
- Jamais de "please upvote" nulle part (= shadowban en 5 min).
- Si quelqu'un demande une feature, ouvre l'issue GitHub *en live* et colle le lien.
- Si critique sur la sécurité (lecture cloud) : pointe `--generate-policy`, `--redact`, et la section "what we don't do" du README.

---

## T+5min — Twitter / X thread (compte perso)

> Tweet 1 = LE tweet. Le reste est du contenu support qui vit ou meurt avec lui.

**Tweet 1 — hook + hero vidéo 10s** (joindre `hero-10s.mp4`)

```
I spent 3 months killing one UX bug in cloud:
you can't see your infra.

→ npx skyglass-cli --demo

AWS + Azure + GCP as one live graph.
Local-first. MIT. One command.
```

**Tweet 2 — le problème**

```
The AWS Console shows you one service at a time.

Your Terraform state is a JSON blob no human can read.

CloudFormation outputs a wall of text.

A 200-resource cloud is a black box you debug by tab-switching.
```

**Tweet 3 — blast radius (clip 3s)**

```
Press B on any node:

Skyglass walks the dependency graph and animates the cascade.

You see what would break, in the order it would break, in red.

Designed for the 2am incident, not the architecture review.
```

**Tweet 4 — semantic zoom (clip 3s)**

```
4 zoom tiers, automatic crossfade:

macro → cluster → node → detail

A 1000-node cloud stays readable at every altitude.

No fog of war. No infinite scroll. Just look at it.
```

**Tweet 5 — tech choices**

```
Canvas 2D, zero WebGL or Three.js.
Barnes-Hut quadtree force layout in a Web Worker. O(n log n).
Sprite caches everywhere — never paint a gradient inside a tight loop.

86 KB gzipped. 60fps at 1000+ nodes on a MacBook Air.
```

**Tweet 6 — local-first**

```
Your credentials never leave your machine.
Your scan never leaves your machine.

The only network call is fetching official AWS/Azure/GCP service icons
from a public CDN on first load.

If you want to lock that down too, --redact strips IPs and ARNs.
```

**Tweet 7 — try it**

```
30 seconds, no signup, no credentials needed:

    npx skyglass-cli --demo

That's a real multi-cloud topology with 141 resources you can pan,
zoom, search, click, and blast.
```

**Tweet 8 — shape of the bet**

```
Solo dev. 3 months. MIT.
TypeScript strict. 86 KB gzipped.

I built this because I needed it.
The fact that it's open source is the side effect, not the strategy.
```

**Tweet 9 — repo + ask**

```
Repo: github.com/itsyounish/Skyglass

If it makes your week any easier, a star helps me know to keep building.
Issues open. PRs welcome.

Roadmap: Kubernetes support, snapshot diff, cost insights v2.
```

**Tweet 10 — RT-bait honnête**

```
Curious — what's your worst "I can't see what's connected to what"
moment in cloud?

I'll DM the next 10 people who reply with their pain a copy of
the deep-dive on how the force layout works under the hood.
```

---

## T+5min — LinkedIn (long form, vidéo native)

> Upload **hero-10s.mp4** directement (ne pas mettre un lien YouTube : autoplay LinkedIn = 3× engagement vs. lien externe).

```
3 mois pour corriger un seul bug UX : tu ne peux pas voir ton cloud.

La AWS Console te montre un service à la fois.
Ton état Terraform est un blob JSON.
CloudFormation te crache un mur de texte.

Le déclic : 2h passées en pleine nuit pour comprendre quelle base de
données tombait avec quel service après un crash RDS. À 4h du matin,
j'avais 17 onglets ouverts et toujours pas de réponse claire.

J'ai construit Skyglass pour que ça ne m'arrive plus.

→ npx skyglass-cli --demo
→ AWS + Azure + GCP → un graph interactif dans ton navigateur
→ 100% local — credentials et données ne quittent jamais ta machine
→ Mode blast radius : clique une ressource, regarde ce qui tomberait
→ Import Terraform : npx skyglass-cli --from terraform.tfstate
→ MIT, zéro compte SaaS, zéro télémétrie

Choix techniques que je détaille volontiers si ça intéresse :
• Canvas 2D, pas de WebGL — performant et lisible à 1000+ ressources
• Barnes-Hut quadtree dans un Web Worker pour le force layout
• 86 KB gzippé (284 KB minifié), build TypeScript strict
• Read-only sur les API cloud (Describe*, List*, Get* uniquement)

C'est open source.
Si ça aide ton équipe, un partage m'aide à continuer à construire.
Retours bienvenus pour la v0.2.

GitHub : https://github.com/itsyounish/Skyglass

#devops #aws #azure #gcp #opensource #cloud #sre #platformengineering
```

---

## T+15min — Reddit (4 subs, wording DIFFÉRENT par sub)

> ⚠️ **Ne JAMAIS copier-coller le même texte sur 2 subs** — les modérateurs détectent en 5 min, ban automatique.

### r/devops (~700k members)

**Titre** :
```
I got tired of clicking through 40 AWS tabs during incidents — built an open-source CLI that draws your whole cloud as a live graph
```

**Corps** :
```
Last month at 3am, RDS hiccupped and I spent 90 minutes flipping between
the AWS Console, our Terraform state, and a Notion runbook trying to
figure out which services would cascade if I had to fail over. By the
time I had a mental picture, the issue was already mitigated, but the
mental picture itself took longer than the fix.

So I built Skyglass — a CLI that scans AWS/Azure/GCP read-only and
renders your full topology as an interactive 2D graph in the browser.

- Press a node, get its dependencies. Press B on it, watch the blast
  radius cascade in red.
- Search across 3 clouds at once. Zoom from "all of prod" down to a
  single Lambda.
- Local-first: nothing leaves your machine. Read-only IAM
  (Describe/List/Get only). There's a --generate-policy flag that
  prints the minimal IAM policy.
- Optional Terraform state import if you don't want live scans.

Try it without credentials:
    npx skyglass-cli --demo

It's MIT, solo project, 3 months in. Repo and feedback in the comments.

Most curious about: did anyone else build their own tool for this and
fail? I'd love to know what didn't work, so I don't repeat the mistake.
```

(Lien repo + npm dans le **premier commentaire** d'OP, pas dans le post.)

---

### r/aws (~300k members)

**Titre** :
```
A read-only CLI that renders your whole AWS account as a graph (open source, local-first)
```

**Corps** :
```
Posting because the AWS Console design hasn't materially changed in 5
years and I needed a different way to look at my account.

Skyglass is a CLI you run as `npx skyglass-cli aws`. It uses your
existing AWS credentials (same SDK chain as the AWS CLI), runs only
Describe/List/Get calls, and opens a browser tab with your entire
account drawn as an interactive force-directed graph.

What it surfaces by default:
- VPCs, subnets, route tables, security groups
- EC2, RDS, Lambda, ECS, EKS, S3, CloudFront
- IAM relationships (which role can assume which)
- Cross-region and cross-cloud dependencies if you also scan Azure/GCP
- Cost-per-resource overlay (press C)
- Blast radius mode (press B on any node)

What it doesn't do:
- No SaaS, no account, no telemetry
- Doesn't write anything to your account — IAM permissions are read-only
- Doesn't cache anywhere except your local filesystem

You can also import a Terraform state file (`--from terraform.tfstate`)
if you'd rather not run a live scan, and there's a `--redact` flag that
strips IPs and ARNs before opening the viewer.

Try the demo (no credentials):
    npx skyglass-cli --demo

Repo + minimal IAM policy generator in comments. Honestly curious what
AWS folks here would want it to do that it doesn't yet.
```

---

### r/selfhosted (~450k members)

**Titre** :
```
Built a cloud infrastructure visualizer that runs 100% locally — no SaaS, no account, no telemetry
```

**Corps** :
```
Most "cloud visibility" tools are SaaS dashboards that ingest your
account and store it on someone else's server. Hard pass.

Skyglass is a CLI. You run `npx skyglass-cli aws` (or azure, gcp, all),
it scans read-only, builds a graph in memory, opens a viewer at
localhost:4173. The viewer is static HTML+JS bundled with the CLI.
Nothing about your cloud leaves your machine.

The only network call after install is fetching official AWS/Azure/GCP
service icons from a public GitHub CDN (tf2d2/icons) on first load —
and even that is cacheable / blockable if you don't want it.

- MIT, source on GitHub
- Read-only IAM (`--generate-policy` flag prints the minimal policy)
- `--redact` to strip IPs / ARNs / endpoints before rendering
- Snapshots stored as plain JSON in ~/.skyglass/, no DB
- Works offline once installed (with --demo or a saved snapshot)

Demo without any cloud creds:
    npx skyglass-cli --demo

Posting here because this sub historically gets the local-first
philosophy. Curious if anything is missing for it to fit your threat
model — I'd rather know now than after 1.0.
```

---

### r/opensource (~250k members)

**Titre** :
```
Solo dev, 3 months, MIT — Skyglass: a multi-cloud infrastructure visualizer in 86 KB gzipped
```

**Corps** :
```
Sharing my project, looking for honest critique.

Skyglass is a CLI + browser viewer that draws your cloud (AWS, Azure,
GCP) as an interactive graph. The interesting bits from a build
perspective:

- TypeScript strict, no `any` outside one cloud-SDK shim
- 86 KB gzipped front-end (284 KB minified), zero WebGL
- Barnes-Hut quadtree force layout in a Web Worker, O(n log n)
- Canvas 2D rendering with sprite caches and viewport culling
- Read-only cloud SDKs as optionalDependencies (Vite tree-shakes the
  ones you don't use, so an AWS-only user never installs Azure/GCP code)
- Vitest + jsdom for everything except the worker (separate harness)
- Vite preview as the production server, no Express, no Node runtime
  on the client side

What I'd love feedback on:
- Project structure (single repo, clear module boundaries?)
- Test coverage strategy (canvas rendering is hard to assert on)
- Whether the optionalDependencies pattern is clean or sneaky
- README structure and "Why" framing

Try it:
    npx skyglass-cli --demo

Repo: https://github.com/itsyounish/Skyglass — issues / PRs welcome.
```

---

## T+30min — Product Hunt

**Tagline (60 chars max)** :
```
See your entire cloud in one graph
```

**Description courte** :
```
Skyglass is an open-source CLI that scans your AWS, Azure, and GCP
infrastructure read-only and renders it as an interactive 2D graph in
your browser. Local-first, MIT, one command — try it instantly with
npx skyglass-cli --demo.
```

**Maker comment** (publier dans les 5 min suivant le launch PH) :
```
Hi PH! Maker here.

Skyglass started after one too many incidents where I spent more time
figuring out what was connected to what than fixing the actual issue.
The AWS Console shows you one service at a time. Terraform state is a
JSON blob. CloudFormation is a wall of text.

So I built the tool I wanted: a single command that scans your cloud
read-only and draws the whole thing — services, dependencies, blast
radius — in a canvas you can actually understand.

A few things that make Skyglass different:
• 100% local. Your credentials and scan data never leave your machine.
• Zero SaaS. No account, no telemetry, no waitlist.
• Multi-cloud out of the box (AWS + Azure + GCP, with cross-cloud edges).
• Blast radius mode — press B on any node, see the cascade.
• Terraform state import if you'd rather not run live scans.

Try it without credentials in 30 seconds:
    npx skyglass-cli --demo

Honest feedback, feature requests, bug reports — all welcome. I reply
to everything here today.
```

**Hunter à viser** : compte ≥ 500 followers PH qui hunt des dev tools (chercher les hunters de Cal.com, Dub, Resend, Linear). Ne *jamais* utiliser un hunter random.

---

## T+1h — 8 newsletters (templates personnalisés)

> Format : 1 paragraphe + lien vidéo + lien repo + ce qui est pertinent pour leurs lecteurs.
> Envoyer dès T+1h pour rentrer dans le cycle éditorial du jour ou du lendemain.

### TLDR Dev (`tldr.tech/submit`)
```
Subject: Show HN front page today — open-source multi-cloud visualizer (skyglass)

Hi TLDR team,

Launched today on HN: Skyglass, a CLI that scans AWS/Azure/GCP
read-only and renders the whole topology as an interactive 2D graph
in the browser. Local-first, MIT, `npx skyglass-cli --demo` for an
instant try without credentials.

Why your devs would care: it kills the "open 40 tabs to understand a
single incident" problem in <30 seconds. The blast-radius mode is the
piece readers tend to screenshot most.

Hero video (10s): https://github.com/itsyounish/Skyglass/raw/main/docs/assets/hero-10s.mp4
Repo: https://github.com/itsyounish/Skyglass
HN thread: {coller le lien après le post HN}

Happy to send a longer pitch or a screenshot pack if useful. Thanks
for considering.

— Younish
```

### Pointer.io (SRE / DevOps)
```
Subject: For Pointer — open-source blast radius visualizer for multi-cloud

Hi Suraj (or Pointer team),

I think your readers would resonate with this: Skyglass is an
open-source CLI that draws your AWS/Azure/GCP topology as an
interactive graph, with a dedicated blast-radius mode (press B on any
node, watch the cascade). Read-only, local-first, MIT.

The architectural piece your audience might enjoy: 1000+ nodes at
60fps using Canvas 2D + Barnes-Hut quadtree in a Web Worker, no WebGL.

Demo: npx skyglass-cli --demo
Repo: https://github.com/itsyounish/Skyglass
HN: {lien}

— Younish
```

### Console.dev (dev tools)
```
Subject: Skyglass — local-first multi-cloud visualizer (one command, MIT)

Hi David,

I'm building Skyglass, an open-source CLI that turns your cloud
infrastructure into a live, interactive 2D graph. Console.dev's
audience seems exactly aligned with the local-first, no-SaaS angle.

Two things make it interesting from a tooling perspective:
1. The whole thing ships as `npx skyglass-cli` — no install, no auth,
   demo runs without credentials.
2. Read-only cloud SDKs as optionalDependencies — AWS-only users never
   install Azure/GCP code paths.

Hero (10s): https://github.com/itsyounish/Skyglass/raw/main/docs/assets/hero-10s.mp4
Repo: https://github.com/itsyounish/Skyglass

— Younish
```

### Last Week in AWS (Corey Quinn)
```
Subject: For LWiAWS — a CLI that finally makes the AWS Console look slow

Hi Corey,

Long-time reader. I just shipped Skyglass: a CLI that scans your AWS
account read-only and renders the whole thing as an interactive graph
in your browser, in less time than the Console takes to load a single
service tab. Open source, MIT, local-first, no SaaS.

You'll appreciate the blast-radius mode and that the entire frontend
is 86 KB gzipped (284 KB minified) with zero WebGL. Cross-account / cross-region / cross-cloud
edges in the same view, which AWS itself still hasn't shipped.

npx skyglass-cli --demo
Repo: https://github.com/itsyounish/Skyglass

If it earns a Snark grade, I'll take what I can get.

— Younish
```

### Changelog News
```
Subject: Skyglass — visualizing AWS/Azure/GCP in the browser, MIT

Hi Adam (or Changelog editorial),

Just launched Skyglass on HN: an open-source CLI that scans
multi-cloud infrastructure and renders it as an interactive 2D graph,
locally. MIT, TypeScript strict, 86 KB gzipped front-end, no WebGL. Solo
project, 3 months.

Worth covering because the blast-radius cascade animation is the
most-screenshotted feature in the early demo footage, and the Canvas
2D + Barnes-Hut architecture is a clean counter-example to "every
graph viz needs WebGL."

npx skyglass-cli --demo
https://github.com/itsyounish/Skyglass

— Younish
```

### DevOps'ish (Chris Short)
```
Subject: Skyglass for the DevOps'ish weekly — open-source multi-cloud graph

Hi Chris,

Launched today: Skyglass, a CLI that scans AWS/Azure/GCP read-only
and renders the topology as an interactive graph in your browser.
Local-first, MIT, includes a blast-radius mode for incident triage
(press B on any node, watch the cascade).

Works on Terraform state too: `npx skyglass-cli --from terraform.tfstate`.

Demo: npx skyglass-cli --demo
Repo: https://github.com/itsyounish/Skyglass

— Younish
```

### Platform Engineering Weekly
```
Subject: Open-source platform tool — see your whole stack as a live graph

Hi team,

If your readers run platforms across AWS/Azure/GCP, Skyglass might
fit your selection criteria: it's an open-source CLI that renders the
full multi-cloud topology as an interactive 2D graph in the browser,
with semantic zoom and a blast-radius mode that animates dependencies.

Local-first (credentials never leave the machine), read-only, MIT,
TypeScript strict.

Demo without credentials:
    npx skyglass-cli --demo

Repo: https://github.com/itsyounish/Skyglass

— Younish
```

### Cloud Native Now
```
Subject: For CNCF-adjacent readers — Skyglass, multi-cloud topology viewer

Hi team,

Open-source release today: Skyglass, a CLI that turns your AWS,
Azure, and GCP into a single interactive graph. MIT, local-first,
zero SaaS, zero telemetry. Renders in Canvas 2D — no WebGL — and
hits 60fps at 1000+ nodes thanks to a Barnes-Hut quadtree force
layout in a Web Worker.

Kubernetes-native scan is on the roadmap (S+4) — happy to coordinate
on that piece if you want a heads-up before announcement.

npx skyglass-cli --demo
https://github.com/itsyounish/Skyglass

— Younish
```

---

## J-5 → J-1 — Pre-warmup DMs (Liste A, personnalisés)

> Règle d'or : **jamais le même texte deux fois**. Personnalise au moins le 1er paragraphe et le pourquoi-tu-spécifiquement.
> Envoie via X DM (ou email pro si tu l'as) entre J-5 et J-2.
> Aucune obligation de relayer — la valeur, c'est l'avant-première.

### Corey Quinn (@QuinnyPig)
```
Salut Corey,

Long-time reader of LWiAWS — surtout ton bashing chronique de la
Console AWS, qui a guidé ce que j'ai voulu construire à l'inverse.

Lundi je lance Skyglass : un CLI qui scanne AWS read-only et rend
TOUT ton compte comme un graph interactif dans le browser, plus vite
que la Console n'ouvre un seul onglet. MIT, local-first, no SaaS.
Mode blast radius pour le 2am de ta vie.

Avant-première de la démo (10s, muet) :
{lien}

Aucune obligation de relayer — un retour honnête (surtout si c'est
"ça craint") aurait plus de valeur pour moi qu'un RT.

Merci d'avoir regardé.
— Younish
```

### Kelsey Hightower (@kelseyhightower)
```
Hi Kelsey,

Your essays on local-first dev tooling shaped a real design decision
for me, so I wanted to send this in advance.

Launching Monday: Skyglass — a CLI that scans your cloud read-only
and renders it as a graph, all locally. No SaaS, no telemetry, no
account. MIT.

`npx skyglass-cli --demo` runs in 10 seconds.

Demo preview (10s, muted):
{link}

No expectation — honest feedback would be worth more than a
retweet. Thanks for taking a look.

— Younish
```

### Adrian Cockcroft (@adrianco)
```
Hi Adrian,

Your "blast radius" framing from the Netflix days literally inspired
the name of one of the modes in this tool, so I'd love your eye on
it before I post it publicly Monday.

Skyglass is an open-source CLI that scans AWS/Azure/GCP read-only
and renders the topology in the browser, with a Press-B blast radius
cascade. MIT, local-first.

Preview (10s):
{link}

Genuinely no obligation — if you have 30 seconds and a brutal
opinion, that would mean more than a share.

— Younish
```

### Thorsten Ball (@thorstenball)
```
Hi Thorsten,

I've been a Sourcegraph reader for a while and your taste in
"finished" dev tools is part of why I kept polishing this one before
shipping.

Monday I'm launching Skyglass: open-source CLI that draws your cloud
infra as an interactive 2D graph. TypeScript strict, 86 KB gzipped,
no WebGL, Barnes-Hut force layout in a Web Worker. MIT.

10s demo:
{link}

If you have any feedback (especially "this part is unfinished"), I'd
take it over a share any day.

Thanks,
Younish
```

### Julia Evans (@b0rk)
```
Hi Julia,

Your zines literally changed how I onboard new engineers to systems
work, so I'm genuinely a little nervous sending this.

Launching Monday: Skyglass — a tiny CLI that draws your cloud as a
graph. The thing I'm most curious about: whether the visual model
helps people who *don't* live in AWS dashboards reason about a cloud
they didn't build.

Preview (10s):
{link}

Aucune obligation — your honest take, even harsh, would be priceless.

Thanks for the years of teaching.
— Younish
```

### Matt Pocock (@mattpocockuk)
```
Hi Matt,

Strict TypeScript, no `any`, generic-heavy worker / canvas types — I
think you'd appreciate the type system on this one.

Launching Monday: Skyglass, an open-source multi-cloud visualizer
CLI. The interesting TS bits: phantom-typed `Provider`-tagged unions
for cross-cloud edges, branded `WorldCoord` vs `ScreenCoord` to
prevent the camera-math footguns I kept hitting.

10s demo:
{link}

If you want to look at the types, repo'll go public Monday — happy
to send the codebase early if it's useful.

— Younish
```

### Guillermo Rauch (@rauchg)
```
Hi Guillermo,

Vercel's bar for hero animations is the reason I rewrote the
blast-radius cascade three times before I was happy.

Launching Monday: Skyglass, an open-source CLI that renders your
cloud as an interactive graph. Local-first, MIT, 86 KB gzipped, hero
moments tuned to feel right at 60fps.

Preview (10s, muted):
{link}

No ask — a 30-second "this part feels off" would be worth more than
a share.

— Younish
```

### DHH (@dhh)
```
Hi David,

The local-first / no-SaaS philosophy you've championed for years is
a non-negotiable in the design of this tool. Wanted to send before I
go public Monday.

Skyglass is a CLI: `npx skyglass-cli --demo`. It scans your cloud
read-only, renders the topology in your browser, and never sends
anything anywhere. MIT, solo, 3 months.

10s demo:
{link}

No obligation — I'd just rather your sharp eye see this before HN
does.

— Younish
```

### Dax Raad (@thdxr)
```
Hey Dax,

SST has set the bar I tried to clear for "feels designed by an
engineer who actually uses it." Wanted to send Skyglass early.

It's an open-source CLI that renders AWS/Azure/GCP as an interactive
graph. Read-only, local-first, MIT. Blast radius mode is the feature
I'd most love your read on — it's where SST users would feel the
difference vs the AWS Console.

10s demo:
{link}

Happy with brutal feedback.

— Younish
```

### Martin Kleppmann (@martinkl)
```
Hi Martin,

DDIA + your local-first papers have been load-bearing in how I
thought about this, so I wanted to send it before public launch.

Skyglass is an open-source CLI that scans cloud APIs read-only and
renders the topology entirely in the browser. Snapshots are plain
JSON in the user's filesystem — no DB, no sync server, no SaaS.

10s demo:
{link}

Genuinely no expectation. A correction or warning would be worth
more than a share.

Thanks.
— Younish
```

### Reminder J+0 (à envoyer à ceux qui ont répondu favorablement à l'avant-première)
```
{prénom} — pour info, le lancement est en ligne maintenant sur HN.
Aucune obligation, mais si ça te parle et que tu as 10s, un commentaire HN
vaudrait bien plus qu'un RT pour la traction organique. Merci encore
d'avoir regardé en avant-première.

{lien HN}
```

---

## Templates de réponse (à garder ouverts pendant les 6h critiques)

### Quelqu'un teste et like
```
🙏 Thank you. If you hit any rough edge, issues are open and I reply
fast. The one thing I'm especially looking for feedback on is blast
radius — try it on the biggest node in your graph.
```

### Critique technique constructive sur HN/Reddit
```
Fair point, and honestly I agree with the concern about {X}. The
reason I made that tradeoff: {courte raison technique}. That said,
if {Y} is a blocker for your use case, I just opened an issue to
track it: {lien}. Thanks for taking the time to dig in.
```

### "Why not just use {existing tool}?"
```
Good question. {Tool} is solid for {its strength}. Where Skyglass is
trying to be different: {1 phrase précise}. Genuinely curious whether
that gap matters for your work — if not, I'd love to know what *would*.
```

### "Is this safe to run in prod?"
```
Yes — every cloud SDK call is read-only (Describe/List/Get only). You
can audit the exact calls in `src/scanner/`, and `--generate-policy`
prints the minimal IAM policy for your security team to review before
you grant access. Nothing leaves your machine.
```

### "What about Kubernetes?"
```
On the roadmap for S+4. The current scanner emits an InfraGraph
abstraction that's K8s-shaped already — adding a kubectl-based scanner
is mostly mechanical at this point. If you want to be the first beta,
ping me at {email or GitHub}.
```

### "Cool but I'd never run this against production"
```
Totally fair — that's why `--from terraform.tfstate` exists. Same
graph, no live scan. And `--redact` strips IPs / ARNs / endpoints so
you can share screenshots without leaking topology details. I'd love
to know what would have to be true for you to trust a live scan
someday.
```

---

## Anti-patterns (pendant les 6h)

1. ❌ "Please upvote on HN" écrit nulle part → tueur n°1
2. ❌ Cross-poster le même wording sur 4 subs Reddit → ban garanti
3. ❌ Répondre défensivement à une critique → tue la traction en 20 min
4. ❌ Répondre en retard (>30 min) à un commentaire HN → algo descend le post
5. ❌ Buy upvotes / lever des comptes pour upvoter → blacklist permanente
6. ❌ Modifier le titre HN après publication → reset l'algo de ranking
7. ❌ Poster sur des subs où tu n'as jamais commenté → modération auto
8. ❌ Bouger les yeux du compte perso vers compte marque → casse la chaîne humaine
9. ❌ Annoncer sur 14 plateformes en même temps → personne n'amplifie
10. ❌ Linker la landing depuis HN si elle a un *bug* → screenshots viraux du bug

---

## Checklist amplification J+1 → J+7

- [ ] **J+1 matin** : tweet bilan stars/visiteurs (chiffres → chiffres)
- [ ] **J+1 matin** : si HN top 20, écrire follow-up `Show HN: one day later — what I learned`
- [ ] **J+1 soir** : screenshot de la trending page GitHub si tu y es
- [ ] **J+2** : publier l'article blog deep-dive (`docs/blog-post.md`)
- [ ] **J+2** : poster l'article sur Dev.to + Hashnode (canonical → ton blog)
- [ ] **J+3** : reach-out 5 podcasts (Software Engineering Daily, The Changelog, Rework, LWiAWS, Platform Engineering)
- [ ] **J+5** : tweet récap chiffres (stars, npm downloads, top issue, top country)
- [ ] **J+7** : post blog `Week 1 in the open: what happened after launching on HN` (méta-pic)
- [ ] **S+2** : ship + annoncer feature `--from terraform.tfstate` complet (pic #2)
- [ ] **S+4** : ship + annoncer Kubernetes support (pic #3)

---

**Bonne chasse.**
