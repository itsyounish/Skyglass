# Why I spent 3 months rendering AWS in a browser canvas

*Published on launch day. Republish target: Dev.to, Hashnode (canonical → your blog).*

---

It was 3am on a Tuesday and RDS was misbehaving. Not down — *misbehaving*. CPU spiking, latency creeping, but no clean error. The kind of incident where you have ten minutes to decide whether to fail over or hold the line.

Failing over a primary database is not the kind of decision you make blind. You need to know, immediately, what depends on it. Which services. Which queues. Which Lambdas. Which background workers that nobody on call has touched in six months. The answer to "what would break" is the answer to "should I do this."

So I opened the AWS Console.

The AWS Console is a beautiful thing if you want to know about *one* service. RDS dashboard for the database. CloudWatch for metrics. IAM for roles. Each one is a fine page. But to answer "what depends on this database," I needed to flip between RDS, then VPC routes, then security groups, then look at every EC2 instance, then every Lambda, then every ECS task, then every EKS workload that *might* be hitting it through a private endpoint, then verify that against secrets and SSM parameters that point at hostnames I had to read off the RDS endpoint manually. Forty tabs deep, my mental model of the dependency graph held together by browser scrollbars.

I opened our Terraform state. It is, in theory, the canonical answer. In practice it is a 14MB JSON blob with `aws_iam_role_policy_attachment` resources nested inside `for_each` blocks, and grep doesn't follow Terraform's symbolic references. I scrolled for thirty seconds and gave up.

The incident resolved itself before I'd finished mapping the graph. I never made the failover call I was preparing for. But I sat at my desk for another half hour, awake on adrenaline, thinking about how absurd it is that in 2026, I — a person who has worked on cloud infrastructure for a decade — cannot ask my own infrastructure the question "what depends on this" and get an answer faster than I can click through forty tabs.

I started building Skyglass that weekend. Three months later, I'm shipping it.

This is what I learned.

---

## The first decision: do not use WebGL

Cloud infrastructure visualization has been a quiet graveyard of beautiful 3D demos that fall apart at production scale. I tried six of them in my research phase. Every single one looked stunning at 50 nodes. Every single one stuttered or melted at 500. The hero animations on their landing pages were almost always shot with a single AWS account that fit on a phone screen.

The lesson was clear: a fancy 3D engine spends its budget on the *first impression* and runs out before it reaches the use case. WebGL is gorgeous when you have one camera, simple geometry, and a controlled scene. A multi-cloud topology graph is the opposite of that. You have a thousand nodes of varying importance, you need text labels readable at every zoom level, you need the user's hover and click to land on the right node within a single pixel, and you need the whole thing to feel snappy on a mid-range laptop with twelve other tabs open.

I picked Canvas 2D.

This is not a fashionable decision. Canvas 2D is the unsexy cousin of WebGL. No shaders. No GPU-accelerated particle systems. Just a 2D context, a draw call, and a tight rendering loop. But for the use case — read-heavy, label-heavy, hover-sensitive, *correct above flashy* — it is exactly the right tool.

The unexpected payoff: the entire front-end gzipped to 86 KB (284 KB minified). There is no Three.js shader compilation on first load. There is no WebGL context loss to recover from. There is no "your browser doesn't support this" error path. Canvas 2D has been universally available since 2009 and the browser vendors have spent the last decade making it absurdly fast.

The tradeoff I accepted: I would lose access to the GPU's parallelism. A canvas redraw at 1000 nodes is a thousand sequential paint calls on the CPU. So the second decision became inevitable.

---

## The second decision: pre-render every gradient

A naive Canvas 2D loop with 1000 nodes will collapse to 15fps the moment you introduce anything pretty. Gradients are particularly cruel. Each `createRadialGradient` call is cheap individually, but inside a tight render loop they're a death spiral.

The fix is unglamorous: pre-render every gradient and reused visual element to an off-screen canvas exactly once, cache it as an image bitmap, and from then on draw the bitmap. A node "orb" with a soft glow becomes a single `drawImage` call instead of seventeen `arc` and `fillStyle` calls. A blast-radius cascade particle becomes a single sprite reused at twenty positions per frame.

This is a technique borrowed from 1990s game engines, applied to a modern dependency-graph visualizer. It is the single largest performance win in the codebase. Profile a node-heavy frame before and after sprite caching and you go from 16ms (just barely 60fps) to 3ms (a generous budget for everything else the renderer does that frame).

The other tactic that did the heavy lifting: viewport culling. The camera knows its world-space bounds at all times. Before any node, edge, or label is drawn, the renderer skips it if it falls outside the visible viewport with a small padding. With thousands of nodes loaded, only the few hundred currently on screen ever hit a draw call. Off-screen content costs zero.

Together, sprite caching plus viewport culling plus dirty tracking — the third member of the trio, where the renderer skips entire frames if nothing has changed — made Canvas 2D not just acceptable but *fast*. The reference benchmark: 1000 nodes, 1500 edges, full force layout running in a Web Worker, 60fps sustained on a MacBook Air.

---

## The third decision: force layout in a worker, with a quadtree

Force-directed graph layout has the same trap as 3D rendering: it looks great until your dataset crosses some threshold and the algorithm becomes the bottleneck. Naive force layout is O(n²) — every node compares against every other node, every frame. At 200 nodes, that's 40,000 comparisons per frame. At 1000 nodes, it's a million. Your physics simulation eats your frame budget.

The Barnes-Hut quadtree approximation is the standard fix, and it really is the standard for a reason. You build a quadtree of all node positions each frame. When you compute the force on node A from a faraway cluster of nodes, you treat the cluster as a single weighted point at its center of mass instead of computing each pair individually. The complexity drops from O(n²) to O(n log n). The visual difference at the resolution most users care about: zero.

I implemented this in a Web Worker, which was a deliberate cost: workers communicate by message-passing, every interaction has a serialization tax, and debugging is harder. The alternative — running the simulation on the main thread — would have meant the user's mouse interactions stuttered every time the layout iterated. That's not a tradeoff worth making. The simulation lives in a worker, posts position deltas to the main thread at roughly 10Hz (not 60Hz, because the renderer interpolates), and the main thread stays responsive even while ten thousand iterations of physics run in parallel.

The other layout-level innovation, which I'm less sure was a good idea but happily works in practice: I added "category lanes." Nodes of the same category (database, compute, storage, etc.) get a small horizontal bias toward a category-specific lane. The result is that even in a chaotic graph, the layout self-organizes into readable bands. You see all your databases drift toward one altitude, all your compute toward another. It's not a true layout algorithm change — just an extra force term — but it makes the graph dramatically easier to scan.

---

## The fourth decision: semantic zoom

A graph that looks the same at every zoom level is unusable above a few hundred nodes. Either the labels overflow at the macro level, or the nodes become unrecognizable dots at the micro level. You have to draw differently at different altitudes.

Skyglass has four zoom tiers:

1. **Macro** (zoomed out): nodes become tiny dots, edges become near-invisible threads. Provider hulls become the dominant visual — you see "AWS over here, Azure over there, GCP over there." This is the "where is everything" view.
2. **Cluster** (medium-zoom out): groups by category become visible. You see "all databases here, all compute there." Labels appear on group hulls but not yet on individual nodes.
3. **Node** (medium-zoom in): individual nodes become recognizable orbs with service-icon insets. Edges reveal themselves as bezier curves. Labels appear on hover.
4. **Detail** (fully zoomed in): node labels become permanent, edges show flow particles, and tooltip cards appear above each node when hovered.

The transition between tiers is a continuous crossfade rather than a step function — there's no "jump" when you cross the zoom threshold. The renderer interpolates between the two adjacent tiers based on a normalized zoom value.

Building this was the part of the project where I came closest to giving up. Naively, "show different things at different zoom levels" is straightforward. In practice, every interaction tier has its own state machine: hover detection has to know which tier you're in, click targets resize, label-collision avoidance changes algorithm. I rewrote the zoom system three times. The current implementation is the simplest of the three and the only one that actually feels right.

---

## The fifth decision: local-first, always

Every cloud-visibility tool I evaluated was, at its core, a SaaS that ingests your account into a managed database and gives you a dashboard. Some are well-built. None are appropriate for the threat model of "I want to look at my own infrastructure on a plane."

Skyglass is a CLI. You install it from npm. You run `npx skyglass-cli aws` (or azure, or gcp, or all). It uses your existing cloud credentials — the same SDK chain as the AWS CLI, `az login`, `gcloud auth`. It runs *only* read-only API calls (Describe/List/Get; never any write or delete). It builds an in-memory graph. It launches a Vite preview server on localhost. Your browser opens. You see the graph.

Nothing about your cloud leaves your machine. Not your credentials, not your scan, not your topology, not the names of your resources, not the IP ranges of your VPCs. There is no telemetry. There is no "anonymous usage statistics." There is no opt-in cloud feature.

The only network call after install is fetching the official AWS / Azure / GCP service icons from a public GitHub CDN (`tf2d2/icons`) on first load. These are static SVG files. They don't see your cloud. If you want to harden further, you can vendor them locally with a flag I'll ship in v0.2.

The reason I make a point of this: the tools that have your cloud topology are the tools that own your blast radius. If their breach is your breach, the tool stops being a productivity gain and starts being a liability. A locally-running CLI is the only design that sidesteps this entirely.

---

## What's next

Skyglass is at v0.1.1 today. It works. It's fast. The blast radius mode is the feature I've gotten the most "wait, *what*?" reactions to in early demos. The cost-overlay mode is the feature my SRE friends have been asking for the most.

The roadmap from here:

- **`--from terraform.tfstate` improved**: the import works today, but I want to make it the *first*-class entry point for teams who'd rather not run live scans. Most "should I run this in prod?" questions disappear when you can produce the same graph from your state file.
- **Kubernetes support**: a `kubectl`-based scanner that emits the same `InfraGraph` abstraction. Treats pods, services, deployments, ingresses as first-class nodes alongside cloud resources.
- **Snapshot diff**: stash a graph today, run again next week, see what changed. The diff renderer is half-built — every change becomes a colored badge on the affected nodes.
- **Cost insights v2**: today the cost overlay is a per-resource estimate. v0.2 walks the graph and shows derived costs at every aggregation level (per-VPC, per-service, per-team if you tag for it).

Beyond that, the design is open. Skyglass is MIT-licensed. The codebase is a single TypeScript repository with clear module boundaries: scanner, force layout, renderer, UI, persistence. Issues and PRs are open. If you want a feature, the path to "I built it" is a single Friday afternoon.

---

If you've ever spent twenty minutes opening tabs to answer one question about your own cloud, you'll know exactly what this tool is for. Try it without credentials in thirty seconds:

    npx skyglass-cli --demo

The repo, the issues, the source code, and the community: [github.com/itsyounish/Skyglass](https://github.com/itsyounish/Skyglass)

I'd love your feedback — especially the part where you tell me what doesn't work yet.
