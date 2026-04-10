# Contributing to skyglass

Thank you for your interest in contributing. This guide covers everything you need to get started.

## Quick Start

```bash
git clone https://github.com/itsyounish/skyglass.git
cd skyglass
npm install
npm run dev
```

The dev server starts at `http://localhost:5173` using built-in demo data — no cloud credentials required.

## Project Structure

```
src/
  canvas/       # 2D rendering engine — nodes, edges, groups, camera
  scanner/      # Cloud provider SDKs (AWS, Azure, GCP) and resource parsers
  ui/           # UI overlays — detail panel, search, cost, tooltips
  hooks/        # Custom hooks: force-directed layout, blast radius logic
  data/         # Mock infrastructure data used in demo mode
  workers/      # Web Worker for force simulation (Barnes-Hut quadtree)
```

## Adding a New Resource Type

1. **Scanner** — add a descriptor in `src/scanner/descriptors.ts` (AWS), `src/scanner/azure-descriptors.ts`, or `src/scanner/gcp-descriptors.ts`. Each descriptor defines the SDK client, list method, and `mapResource` function.
2. **Mock data** — add a representative entry to `src/data/mock-aws.ts`, `mock-azure.ts`, or `mock-gcp.ts` so the demo reflects the new type.
3. **Rendering** — the node renderer in `src/canvas/NodeRenderer.ts` picks up colors and icons automatically from provider/category. For custom icons, add an entry in `src/canvas/ServiceLogos.ts`.
4. **Type definitions** — if needed, extend the `NodeCategory` union in `src/types.ts`.

## Adding a New Cloud Provider

1. Create `src/scanner/<provider>.ts` exporting an async scan function.
2. Add credential handling following the pattern in `src/scanner/aws.ts`.
3. Register the provider in `src/scanner/index.ts`.
4. Add mock data in `src/data/mock-<provider>.ts`.
5. Add the provider flag to the CLI entry point in `bin/`.
6. Document required IAM permissions / roles in `README.md`.

## Code Style

- **TypeScript strict mode** is enforced. No `any`, no disabled rules without a comment explaining why.
- **Force layout in Web Worker** — the force simulation (Barnes-Hut quadtree) runs in a Web Worker to avoid blocking the main thread. Keep React state updates throttled (~10 Hz).
- **Canvas performance** — never allocate gradients or images inside the render loop. Pre-render sprites and cache them. Use dirty tracking to skip frames when nothing changed.
- Use named exports only (no default exports outside route-level files).

## Pull Request Guidelines

- Use a descriptive title: `feat: add RDS cluster node type` or `fix: correct edge color for peering links`.
- Include screenshots or screen recordings for any visual change.
- Keep PRs focused — one concern per PR.
- All TypeScript errors must be resolved before requesting review (`npm run build` must pass).
- If your change touches the scanner, document the minimum required cloud permissions.
