# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-15

### Added
- Multi-cloud infrastructure scanning (AWS, Azure, GCP)
- Interactive 2D force-directed graph with semantic zoom (macro, cluster, node, detail)
- Official AWS/Azure/GCP service icons via tf2d2/icons
- Blast radius mode with cascading failure visualization
- Edge type coloring (green=network, cyan=data, violet=dependency, white=cross-cloud)
- Animated fly-to camera on node selection
- Provider clustering (AWS orange, Azure blue, GCP green)
- Interactive detail panel with resource metadata, ARN, cost, status
- Search and filter panel (by name, type, provider, region, status)
- Cost analysis panel with per-provider and per-category breakdown
- Light / dark theme toggle (T key), persisted in localStorage
- Keyboard controls (B=blast, T=theme, F=fullscreen, /=search, C=costs, P=screenshot, Esc=deselect)
- CLI with `--demo`, `--provider`, and `--from` flags
- Terraform state file import (v4 format, 100+ resource types)
- Snapshot persistence and diff engine
- Export to JSON, DOT (Graphviz), CSV, and PNG screenshot
- Zero-config demo mode with realistic mock data (141 nodes, 162 edges across 3 providers)
