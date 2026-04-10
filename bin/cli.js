#!/usr/bin/env node

import { createServer } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs'

// Persistence imports (server-side only, Node.js built-ins only)
import {
  initStore,
  saveSnapshot,
  listSnapshots,
  loadSnapshot,
  loadSnapshotFull,
  deleteSnapshot,
} from '../src/persistence/index.js'
import { diffGraphs } from '../src/persistence/diff.js'
import { exportJSON, exportDOT, exportCSV } from '../src/persistence/export.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const flags = { demo: false, redact: false }
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--provider' || args[i] === '-p') {
    flags.provider = args[++i]
  } else if (args[i] === '--region' || args[i] === '-r') {
    flags.region = args[++i]
  } else if (args[i] === '--project') {
    flags.project = args[++i]
  } else if (args[i] === '--subscription') {
    flags.subscription = args[++i]
  } else if (args[i] === '--profiles') {
    flags.profiles = args[++i]
  } else if (args[i] === '--port') {
    flags.port = parseInt(args[++i], 10)
  } else if (args[i] === '--demo' || args[i] === '-d') {
    flags.demo = true
  } else if (args[i] === '--from') {
    flags.from = args[++i]
  } else if (args[i] === '--redact') {
    flags.redact = true
  } else if (args[i] === '--generate-policy') {
    flags.generatePolicy = args[++i]
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
  skyglass — A looking glass for your cloud

  Usage:
    npx skyglass <provider>                      Scan and visualize your infrastructure
    npx skyglass --from <file>                   Import from Terraform state file
    npx skyglass --demo                          Launch with sample data (no credentials)
    npx skyglass --generate-policy <provider>    Output minimal IAM policy JSON

  Providers:
    aws                                          Scan AWS infrastructure
    azure                                        Scan Azure infrastructure
    gcp                                          Scan GCP infrastructure
    all                                          Scan all configured providers

  Options:
    --region, -r <region>                        Cloud region (default: us-east-1)
    --subscription <id>                          Azure subscription ID
    --project <id>                               GCP project ID
    --profiles <list>                            Comma-separated AWS profiles for multi-account scanning
    --from <path>                                Import from Terraform state file (.tfstate / .json)
    --redact                                     Strip sensitive metadata (IPs, ARNs, endpoints)
    --port <number>                              Viewer port (default: 4173)
    --demo, -d                                   Run with sample multi-cloud data
    --generate-policy <provider>                 Output minimal read-only IAM policy (aws|azure|gcp)
    --help, -h                                   Show this help

  Snapshot Management:
    npx skyglass history                         List all saved snapshots
    npx skyglass diff                            Diff latest vs previous snapshot
    npx skyglass diff --from <id> --to <id>      Diff two specific snapshots
    npx skyglass delete-snapshot <id>            Delete a snapshot

  Export:
    npx skyglass export --format json -o out.json   Export as JSON
    npx skyglass export --format dot -o out.dot     Export as Graphviz DOT
    npx skyglass export --format csv -o out.csv     Export as CSV
    npx skyglass export --snapshot <id> -f json     Export a specific snapshot

  Snapshot references:
    Full ID (e.g. 20260329-143000-a1b2), partial prefix, or #N index
    (#1 = most recent, #2 = second most recent, etc.)

  Examples:
    npx skyglass all                             Scan all configured providers
    npx skyglass all -r eu-west-1                Scan with specific region
    npx skyglass aws --profiles prod,staging     Multi-account AWS scan
    npx skyglass --from terraform.tfstate        Import Terraform state
    npx skyglass --from state.json --redact      Import and strip sensitive data
    npx skyglass --demo                          Interactive demo with sample data
    npx skyglass --generate-policy aws           Output AWS IAM policy JSON
    npx skyglass history                         Show scan history
    npx skyglass diff                            What changed since last scan?
    npx skyglass export -f dot -o infra.dot      Export for Graphviz

  Credentials:
    Uses your existing CLI credentials. No agents, no SaaS, no signup.
    AWS     ~/.aws/credentials, env vars, SSO
    Azure   az login, env vars, managed identity
    GCP     gcloud auth, GOOGLE_APPLICATION_CREDENTIALS

  All scans are read-only. No data leaves your machine.
`)
    process.exit(0)
  } else if (!args[i].startsWith('-') && !flags.provider) {
    // Positional argument = provider shorthand (e.g. "npx skyglass aws")
    flags.provider = args[i]
  }
}

// ---------------------------------------------------------------------------
// Subcommand routing
// Subcommand names get parsed as flags.provider by the positional arg handler.
// Intercept them here before the main scan/server flow.
// ---------------------------------------------------------------------------
const SUBCOMMANDS = new Set(['history', 'diff', 'export', 'delete-snapshot'])

if (flags.provider && SUBCOMMANDS.has(flags.provider)) {
  const subcmd = flags.provider
  flags.provider = undefined

  // Re-parse remaining args for subcommand-specific flags
  const subArgs = args.slice(1) // everything after the subcommand name
  const subFlags = {}
  for (let i = 0; i < subArgs.length; i++) {
    if (subArgs[i] === '--from') subFlags.from = subArgs[++i]
    else if (subArgs[i] === '--to') subFlags.to = subArgs[++i]
    else if (subArgs[i] === '--format' || subArgs[i] === '-f') subFlags.format = subArgs[++i]
    else if (subArgs[i] === '--output' || subArgs[i] === '-o') subFlags.output = subArgs[++i]
    else if (subArgs[i] === '--snapshot' || subArgs[i] === '-s') subFlags.snapshot = subArgs[++i]
    else if (!subArgs[i].startsWith('-')) subFlags.positional = subArgs[i]
  }

  switch (subcmd) {
    case 'history':
      handleHistory()
      break
    case 'diff':
      handleDiff(subFlags)
      break
    case 'export':
      handleExport(subFlags)
      break
    case 'delete-snapshot':
      handleDeleteSnapshot(subFlags)
      break
  }
}

// ---------------------------------------------------------------------------
// Subcommand: history — list all saved snapshots
// ---------------------------------------------------------------------------
function handleHistory() {
  initStore()
  const snapshots = listSnapshots()

  if (snapshots.length === 0) {
    console.log('')
    console.log('  No snapshots found.')
    console.log('  Run a scan first: npx skyglass aws')
    console.log('')
    process.exit(0)
  }

  const latest = snapshots[0]?.id ?? null

  console.log('')
  console.log('  Snapshots:')
  console.log('  ' + '\u2500'.repeat(65))

  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i]
    const num = String(i + 1).padStart(2, ' ')
    const ts = s.timestamp.slice(0, 19).replace('T', '  ')
    const providers = Array.isArray(s.providers) ? s.providers.join(',') : String(s.providers)
    const provStr = providers.padEnd(12)
    const nodeStr = `${s.nodeCount} nodes`.padEnd(12)
    const isLatest = s.id === latest ? '  latest' : ''
    const label = s.label ? `  [${s.label}]` : ''
    console.log(`  #${num}  ${s.id}  ${ts}  ${provStr}${nodeStr}${isLatest}${label}`)
  }

  console.log('')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Subcommand: diff — compare two snapshots
// ---------------------------------------------------------------------------
function handleDiff(subFlags) {
  initStore()

  let fromId = subFlags.from || null
  let toId = subFlags.to || null

  const snapshots = listSnapshots()

  // If no args: diff latest vs previous
  if (!fromId && !toId) {
    if (snapshots.length < 2) {
      console.log('')
      console.log('  Need at least 2 snapshots to diff.')
      console.log('  Run scans first: npx skyglass aws')
      console.log('')
      process.exit(1)
    }
    fromId = snapshots[1].id  // previous (second newest)
    toId = snapshots[0].id    // latest (newest)
  } else if (!fromId || !toId) {
    console.log('')
    console.log('  Usage:')
    console.log('    npx skyglass diff                          Compare latest vs previous')
    console.log('    npx skyglass diff --from <id> --to <id>    Compare two specific snapshots')
    console.log('')
    process.exit(1)
  }

  // Resolve shorthand references
  fromId = resolveSnapshotRef(fromId, snapshots)
  toId = resolveSnapshotRef(toId, snapshots)

  const beforeGraph = loadSnapshot(fromId)
  const afterGraph = loadSnapshot(toId)

  if (!beforeGraph) {
    console.error(`  Error: snapshot "${fromId}" not found.`)
    process.exit(1)
  }
  if (!afterGraph) {
    console.error(`  Error: snapshot "${toId}" not found.`)
    process.exit(1)
  }

  const diff = diffGraphs(beforeGraph, afterGraph)

  console.log('')
  console.log(`  Diff: ${fromId} \u2192 ${toId}`)
  console.log('  ' + '\u2500'.repeat(65))
  console.log(`  + ${diff.summary.added} added    - ${diff.summary.removed} removed    ~ ${diff.summary.modified} modified    = ${diff.summary.unchanged} unchanged`)
  console.log('')

  if (diff.addedNodes.length > 0) {
    console.log('  Added:')
    for (const node of diff.addedNodes) {
      console.log(`    + ${node.id} (${node.category}, ${node.region})`)
    }
    console.log('')
  }

  if (diff.removedNodes.length > 0) {
    console.log('  Removed:')
    for (const node of diff.removedNodes) {
      console.log(`    - ${node.id} (${node.category}, ${node.region})`)
    }
    console.log('')
  }

  if (diff.modifiedNodes.length > 0) {
    console.log('  Modified:')
    for (const entry of diff.modifiedNodes) {
      const changeStrs = Object.entries(entry.changes)
        .map(([key, val]) => `${key} ${val.old}\u2192${val.new}`)
        .join(', ')
      console.log(`    ~ ${entry.id}: ${changeStrs}`)
    }
    console.log('')
  }

  if (diff.addedEdges.length > 0) {
    console.log(`  + ${diff.addedEdges.length} new edges`)
  }
  if (diff.removedEdges.length > 0) {
    console.log(`  - ${diff.removedEdges.length} removed edges`)
  }
  if (diff.addedEdges.length > 0 || diff.removedEdges.length > 0) {
    console.log('')
  }

  process.exit(0)
}

// ---------------------------------------------------------------------------
// Subcommand: export — export graph to JSON, DOT, or CSV
// ---------------------------------------------------------------------------
function handleExport(subFlags) {
  initStore()

  const format = (subFlags.format || 'json').toLowerCase()
  const output = subFlags.output || null
  let snapshotId = subFlags.snapshot || null

  const validFormats = ['json', 'dot', 'csv']
  if (!validFormats.includes(format)) {
    console.error(`  Error: unsupported format "${format}". Use one of: ${validFormats.join(', ')}`)
    process.exit(1)
  }

  // Load graph: from specific snapshot, latest, or public/graph.json
  let graph = null

  if (snapshotId) {
    const snapshots = listSnapshots()
    snapshotId = resolveSnapshotRef(snapshotId, snapshots)
    graph = loadSnapshot(snapshotId)
    if (!graph) {
      console.error(`  Error: snapshot "${snapshotId}" not found.`)
      process.exit(1)
    }
  } else {
    // Try latest snapshot
    const snapshots = listSnapshots()
    if (snapshots.length > 0) {
      graph = loadSnapshot(snapshots[0].id)
    }

    // Fall back to public/graph.json
    if (!graph) {
      const graphPath = resolve(root, 'public', 'graph.json')
      if (existsSync(graphPath)) {
        try {
          graph = JSON.parse(readFileSync(graphPath, 'utf-8'))
        } catch { /* ignore */ }
      }
    }

    if (!graph) {
      console.error('  Error: no graph data found. Run a scan first or specify --snapshot <id>.')
      process.exit(1)
    }
  }

  // Generate export
  let content
  switch (format) {
    case 'json': content = exportJSON(graph); break
    case 'dot':  content = exportDOT(graph); break
    case 'csv':  content = exportCSV(graph); break
  }

  if (output) {
    const outputPath = resolve(process.cwd(), output)
    writeFileSync(outputPath, content, 'utf-8')
    console.log('')
    console.log(`  Exported ${format.toUpperCase()} to ${outputPath}`)
    console.log(`  ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
    console.log('')
  } else {
    // Print to stdout
    process.stdout.write(content)
    process.stdout.write('\n')
  }

  process.exit(0)
}

// ---------------------------------------------------------------------------
// Subcommand: delete-snapshot — remove a snapshot by ID
// ---------------------------------------------------------------------------
function handleDeleteSnapshot(subFlags) {
  initStore()

  const id = subFlags.positional
  if (!id) {
    console.error('  Usage: npx skyglass delete-snapshot <id>')
    process.exit(1)
  }

  const snapshots = listSnapshots()
  const resolvedId = resolveSnapshotRef(id, snapshots)

  const success = deleteSnapshot(resolvedId)
  if (success) {
    console.log(`  Deleted snapshot ${resolvedId}`)
  } else {
    console.error(`  Error: snapshot "${resolvedId}" not found.`)
    process.exit(1)
  }

  process.exit(0)
}

// ---------------------------------------------------------------------------
// Helper: resolve snapshot reference from user input
// Accepts full ID, partial prefix, or #N / N numeric index.
// ---------------------------------------------------------------------------
function resolveSnapshotRef(input, snapshots) {
  if (!input) return input

  // Numeric reference: #1 = most recent, #2 = second most recent
  const numMatch = input.match(/^#?(\d+)$/)
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1
    if (idx >= 0 && idx < snapshots.length) {
      return snapshots[idx].id
    }
    // Pure numeric that is out of range
    if (/^\d+$/.test(input) || /^#\d+$/.test(input)) {
      console.error(`  Error: snapshot index #${numMatch[1]} is out of range (have ${snapshots.length} snapshots).`)
      process.exit(1)
    }
  }

  // Partial ID match: find snapshot whose ID starts with the input
  const matches = snapshots.filter(s => s.id.startsWith(input))
  if (matches.length === 1) return matches[0].id
  if (matches.length > 1) {
    console.error(`  Error: ambiguous snapshot ID "${input}" matches ${matches.length} snapshots.`)
    process.exit(1)
  }

  // Exact fallback
  return input
}

// ---------------------------------------------------------------------------
// Handle --generate-policy (standalone mode, no server)
// ---------------------------------------------------------------------------
if (flags.generatePolicy) {
  async function generatePolicy() {
    const target = flags.generatePolicy.toLowerCase()
    // We need to use vite to load the TS module
    const server = await createServer({
      root,
      server: { port: 0, open: false, host: 'localhost' },
    })
    const policyModule = await server.ssrLoadModule('./src/scanner/iam-policy.ts')

    let policy
    let label
    if (target === 'aws') {
      policy = policyModule.generateAWSPolicy()
      label = 'AWS IAM Policy'
    } else if (target === 'azure') {
      policy = policyModule.generateAzureRoles()
      label = 'Azure Custom Role Definition'
    } else if (target === 'gcp') {
      policy = policyModule.generateGCPRoles()
      label = 'GCP Custom Role Permissions'
    } else {
      console.error(`  Unknown provider for --generate-policy: ${target}`)
      console.error('  Supported: aws, azure, gcp')
      process.exit(1)
    }

    console.log('')
    console.log(`  ${label}:`)
    console.log('')
    console.log(JSON.stringify(policy, null, 2))
    console.log('')

    await server.close()
  }

  generatePolicy().catch((err) => {
    console.error('  Failed to generate policy:', err.message)
    process.exit(1)
  })
  // Skip the rest of the CLI logic
} else {

const isDemo = flags.demo && !flags.provider && !flags.from
const isTerraformImport = !!flags.from
const port = flags.port || 4173

// If no provider and no --demo and no --from, show a helpful prompt
if (!flags.provider && !flags.demo && !flags.from) {
  console.log('')
  console.log('  skyglass — A looking glass for your cloud')
  console.log('')
  console.log('  Usage:')
  console.log('    npx skyglass all                Scan all your cloud providers')
  console.log('    npx skyglass --from state.json  Import Terraform state')
  console.log('    npx skyglass --demo             Try with sample data')
  console.log('    npx skyglass history             List saved snapshots')
  console.log('    npx skyglass diff                Diff latest vs previous')
  console.log('    npx skyglass export -f json -o out.json')
  console.log('')
  console.log('  Run npx skyglass --help for all options.')
  console.log('')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
console.log('')
console.log('  ╔══════════════════════════════════════╗')
console.log('  ║        skyglass  ·  v0.1.0           ║')
console.log('  ║  A looking glass for your cloud      ║')
console.log('  ╚══════════════════════════════════════╝')
console.log('')

// ---------------------------------------------------------------------------
// Build scan config
// ---------------------------------------------------------------------------
function buildScanConfig() {
  if (!flags.provider) return null

  const providers = []
  const requested = flags.provider === 'all'
    ? ['aws', 'azure', 'gcp']
    : flags.provider.split(',').map(p => p.trim().toLowerCase())

  // Parse --profiles flag (comma-separated AWS profile names)
  const profiles = flags.profiles
    ? flags.profiles.split(',').map(p => p.trim()).filter(Boolean)
    : undefined

  for (const p of requested) {
    if (p === 'aws') {
      providers.push({
        type: 'aws',
        config: {
          region: flags.region || 'us-east-1',
          profiles: profiles && profiles.length > 0 ? profiles : undefined,
        },
      })
    } else if (p === 'azure') {
      providers.push({ type: 'azure', config: { subscriptionId: flags.subscription || process.env.AZURE_SUBSCRIPTION_ID || '' } })
    } else if (p === 'gcp') {
      providers.push({ type: 'gcp', config: { projectId: flags.project || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '' } })
    } else {
      console.warn(`  ⚠ Unknown provider: ${p} (skipping)`)
    }
  }

  return providers.length > 0 ? { providers } : null
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------
async function scanWithVite(viteServer) {
  const config = buildScanConfig()
  if (!config) return false

  const providerNames = config.providers.map(p => {
    if (p.type === 'aws' && p.config.profiles) {
      return `aws (profiles: ${p.config.profiles.join(', ')})`
    }
    return p.type
  }).join(', ')
  console.log(`  Scanning: ${providerNames}`)
  console.log('  Using default credential chain...')
  console.log('')

  const scanStart = Date.now()

  try {
    const scannerModule = await viteServer.ssrLoadModule('./src/scanner/index.ts')
    let graph = await scannerModule.scanInfrastructure(config)

    if (graph.nodes.length === 0) {
      console.log('  ⚠ Scan returned 0 resources. Falling back to demo data.')
      console.log('')
      return false
    }

    // Apply redaction if requested
    if (flags.redact) {
      const terraformModule = await viteServer.ssrLoadModule('./src/scanner/terraform.ts')
      graph = terraformModule.redactGraph(graph)
      console.log('  ✓ Sensitive metadata redacted')
    }

    console.log(`  ✓ Found ${graph.nodes.length} resources, ${graph.edges.length} connections`)

    const publicDir = resolve(root, 'public')
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true })
    writeFileSync(resolve(publicDir, 'graph.json'), JSON.stringify(graph, null, 2))
    console.log('  ✓ Graph saved')

    // Auto-save as snapshot
    try {
      const scanEnd = Date.now()
      const providers = config.providers.map(p => p.type)
      const entry = saveSnapshot(graph, { providers, scanDurationMs: scanEnd - scanStart })
      console.log(`  ✓ Snapshot saved: ${entry.id}`)
    } catch (snapErr) {
      console.warn(`  ⚠ Snapshot save failed: ${snapErr.message}`)
    }

    console.log('')
    return true
  } catch (err) {
    console.log(`  ⚠ Scan failed: ${err.message}`)
    console.log('  Falling back to demo data.')
    console.log('')
    return false
  }
}

// ---------------------------------------------------------------------------
// Terraform state import
// ---------------------------------------------------------------------------
async function importTerraformState(viteServer) {
  const statePath = resolve(process.cwd(), flags.from)
  console.log(`  Importing Terraform state: ${flags.from}`)
  console.log('')

  try {
    const terraformModule = await viteServer.ssrLoadModule('./src/scanner/terraform.ts')
    let graph = await terraformModule.parseTerraformState(statePath)

    if (graph.nodes.length === 0) {
      console.log('  ⚠ Terraform state contained 0 managed resources. Falling back to demo data.')
      console.log('')
      return false
    }

    // Apply redaction if requested
    if (flags.redact) {
      graph = terraformModule.redactGraph(graph)
      console.log('  ✓ Sensitive metadata redacted')
    }

    console.log(`  ✓ Imported ${graph.nodes.length} resources, ${graph.edges.length} connections`)

    const publicDir = resolve(root, 'public')
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true })
    writeFileSync(resolve(publicDir, 'graph.json'), JSON.stringify(graph, null, 2))
    console.log('  ✓ Graph saved')

    // Auto-save as snapshot
    try {
      const entry = saveSnapshot(graph, { label: `terraform:${flags.from}` })
      console.log(`  ✓ Snapshot saved: ${entry.id}`)
    } catch (snapErr) {
      console.warn(`  ⚠ Snapshot save failed: ${snapErr.message}`)
    }

    console.log('')
    return true
  } catch (err) {
    console.log(`  ⚠ Terraform import failed: ${err.message}`)
    console.log('  Falling back to demo data.')
    console.log('')
    return false
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  const server = await createServer({
    root,
    server: { port, open: false, host: 'localhost' },
  })

  if (isDemo) {
    // Remove any stale graph.json so viewer falls back to mock data
    const graphPath = resolve(root, 'public', 'graph.json')
    if (existsSync(graphPath)) {
      const { unlinkSync } = await import('fs')
      unlinkSync(graphPath)
    }
    console.log('  Demo mode — sample multi-cloud infrastructure')
    console.log('')
  } else if (isTerraformImport) {
    await importTerraformState(server)
  } else {
    await scanWithVite(server)
  }

  await server.listen()
  const url = `http://localhost:${server.config.server.port}/`
  console.log(`  ✦ Viewer: ${url}`)
  console.log('')
  console.log('  Controls: drag=orbit, scroll=zoom, click=inspect, B=blast radius, C=costs')
  console.log('  Press Ctrl+C to stop')
  console.log('')

  // Open browser
  try {
    const { exec } = await import('child_process')
    const cmd = process.platform === 'darwin' ? 'open' :
                process.platform === 'win32' ? 'start' : 'xdg-open'
    exec(`${cmd} ${url}`)
  } catch {}
}

start().catch((err) => {
  console.error('  ✗ Failed to start:', err.message)
  process.exit(1)
})

} // end of else block (--generate-policy guard)
