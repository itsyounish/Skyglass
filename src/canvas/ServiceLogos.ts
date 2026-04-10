// ---------------------------------------------------------------------------
// Official cloud service icons from tf2d2/icons (GitHub, MIT license)
// Source: https://github.com/tf2d2/icons — official AWS/Azure/GCP architecture icons
// Fallback: local SVG for services without official icons (subnet)
// ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>()
const loadingSet = new Set<string>()
const failedSet = new Set<string>()

// ---------------------------------------------------------------------------
// Official icon URLs — verified, all return HTTP 200
// ---------------------------------------------------------------------------

const TF2D2 = 'https://raw.githubusercontent.com/tf2d2/icons/main'

const OFFICIAL_URLS: Record<string, string> = {
  // AWS
  ec2:               `${TF2D2}/aws/service/Compute/48/Amazon-EC2.svg`,
  rds:               `${TF2D2}/aws/service/Database/48/Amazon-RDS.svg`,
  lambda:            `${TF2D2}/aws/service/Compute/48/AWS-Lambda.svg`,
  s3:                `${TF2D2}/aws/service/Storage/48/Amazon-Simple-Storage-Service.svg`,
  cloudfront:        `${TF2D2}/aws/service/Networking-Content-Delivery/48/Amazon-CloudFront.svg`,
  ecs:               `${TF2D2}/aws/service/Containers/48/Amazon-Elastic-Container-Service.svg`,
  vpc:               `${TF2D2}/aws/service/Networking-Content-Delivery/48/Amazon-Virtual-Private-Cloud.svg`,
  secretsmanager:    `${TF2D2}/aws/service/Security-Identity-Compliance/48/AWS-Secrets-Manager.svg`,
  kms:               `${TF2D2}/aws/service/Security-Identity-Compliance/48/AWS-Key-Management-Service.svg`,
  ecr:               `${TF2D2}/aws/service/Containers/48/Amazon-Elastic-Container-Registry.svg`,
  redshift:          `${TF2D2}/aws/service/Analytics/48/Amazon-Redshift.svg`,
  'cloudwatch-logs': `${TF2D2}/aws/service/Management-Governance/48/Amazon-CloudWatch.svg`,

  // Azure
  aks:               `${TF2D2}/azure/containers/Kubernetes-Services.svg`,
  vnet:              `${TF2D2}/azure/networking/Virtual-Networks.svg`,
  cosmosdb:          `${TF2D2}/azure/databases/Azure-Cosmos-DB.svg`,
  'function-app':    `${TF2D2}/azure/compute/Function-Apps.svg`,
  'storage-account': `${TF2D2}/azure/storage/Storage-Accounts.svg`,
  'front-door':      `${TF2D2}/azure/networking/Front-Door-and-CDN-Profiles.svg`,
  'sql-server':      `${TF2D2}/azure/databases/SQL-Server.svg`,
  'sql-database':    `${TF2D2}/azure/databases/SQL-Database.svg`,
  redis:             `${TF2D2}/azure/databases/Cache-Redis.svg`,
  servicebus:        `${TF2D2}/azure/integration/Azure-Service-Bus.svg`,
  eventhub:          `${TF2D2}/azure/analytics/Event-Hubs.svg`,
  keyvault:          `${TF2D2}/azure/security/Key-Vaults.svg`,
  acr:               `${TF2D2}/azure/containers/Container-Registries.svg`,
  postgresql:        `${TF2D2}/azure/databases/Azure-Database-PostgreSQL-Server.svg`,
  appgateway:        `${TF2D2}/azure/networking/Application-Gateways.svg`,

  // GCP
  'cloud-run':         `${TF2D2}/gcp/cloud_run/cloud_run.svg`,
  bigquery:            `${TF2D2}/gcp/bigquery/bigquery.svg`,
  gcs:                 `${TF2D2}/gcp/cloud_storage/cloud_storage.svg`,
  pubsub:              `${TF2D2}/gcp/pubsub/pubsub.svg`,
  cdn:                 `${TF2D2}/gcp/cloud_cdn/cloud_cdn.svg`,
  'cloud-sql':         `${TF2D2}/gcp/cloud_sql/cloud_sql.svg`,
  'cloud-function':    `${TF2D2}/gcp/cloud_functions/cloud_functions.svg`,
  'memorystore-redis': `${TF2D2}/gcp/memorystore/memorystore.svg`,
  'cloud-dns':         `${TF2D2}/gcp/cloud_dns/cloud_dns.svg`,
  firestore:           `${TF2D2}/gcp/firestore/firestore.svg`,
  'cloud-tasks':       `${TF2D2}/gcp/cloud_tasks/cloud_tasks.svg`,
  'cloud-armor':       `${TF2D2}/gcp/cloud_armor/cloud_armor.svg`,
  'cloud-scheduler':   `${TF2D2}/gcp/cloud_scheduler/cloud_scheduler.svg`,
}

// Aliases for services that share an icon with another service
const SERVICE_ALIASES: Record<string, string> = {
  subnet: 'vpc',       // AWS subnet uses VPC icon (no official subnet icon)
  deployment: 'aks',   // K8s deployments use AKS/Kubernetes icon
}

// ---------------------------------------------------------------------------
// Local SVG fallback (for subnet and any failed loads)
// ---------------------------------------------------------------------------

function svgWrap(inner: string, c: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="${c}">${inner}</svg>`
}

const LOCAL_FALLBACKS: Record<string, string> = {
  subnet: svgWrap(
    `<circle cx="32" cy="10" r="5" fill="#8C4FFF"/><line x1="32" y1="15" x2="32" y2="32" stroke="#8C4FFF" stroke-width="2.5"/>
     <line x1="32" y1="32" x2="14" y2="50" stroke="#8C4FFF" stroke-width="2"/><line x1="32" y1="32" x2="32" y2="52" stroke="#8C4FFF" stroke-width="2"/>
     <line x1="32" y1="32" x2="50" y2="50" stroke="#8C4FFF" stroke-width="2"/>
     <circle cx="14" cy="52" r="3.5" fill="#8C4FFF"/><circle cx="32" cy="54" r="3.5" fill="#8C4FFF"/><circle cx="50" cy="52" r="3.5" fill="#8C4FFF"/>`,
    '#8C4FFF',
  ),
}

// Generic fallback circle
const GENERIC_FALLBACK = svgWrap(
  `<circle cx="32" cy="32" r="20" fill="none" stroke="#888" stroke-width="3"/><circle cx="32" cy="32" r="4" fill="#888"/>`,
  '#888',
)

function getLocalFallback(serviceType: string): HTMLImageElement {
  const key = `local-${serviceType}`
  if (imageCache.has(key)) return imageCache.get(key)!

  const svgStr = LOCAL_FALLBACKS[serviceType] || GENERIC_FALLBACK
  const img = new Image()
  img.src = 'data:image/svg+xml,' + encodeURIComponent(svgStr)
  imageCache.set(key, img)
  return img
}

// ---------------------------------------------------------------------------
// Image loader
// ---------------------------------------------------------------------------

function loadOfficialIcon(serviceType: string): HTMLImageElement | null {
  // Resolve aliases
  const resolved = SERVICE_ALIASES[serviceType] || serviceType
  const url = OFFICIAL_URLS[resolved]
  if (!url) return null

  const key = `official-${resolved}`
  if (imageCache.has(key)) return imageCache.get(key)!
  if (failedSet.has(key)) return null
  if (loadingSet.has(key)) return null

  loadingSet.add(key)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { imageCache.set(key, img); loadingSet.delete(key) }
  img.onerror = () => { failedSet.add(key); loadingSet.delete(key) }
  img.src = url
  return null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Draw a service logo. Tries official icon first, falls back to local SVG.
 */
export function drawServiceLogo(
  ctx: CanvasRenderingContext2D,
  provider: string,
  serviceType: string,
  x: number,
  y: number,
  size: number,
): boolean {
  // Try official icon
  const resolved = SERVICE_ALIASES[serviceType] || serviceType
  const officialKey = `official-${resolved}`

  if (imageCache.has(officialKey)) {
    const img = imageCache.get(officialKey)!
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size)
      return true
    }
  }

  // Start loading if not already
  loadOfficialIcon(serviceType)

  // Fallback to local SVG
  const local = getLocalFallback(serviceType)
  if (local.complete && local.naturalWidth > 0) {
    ctx.drawImage(local, x - size / 2, y - size / 2, size, size)
    return true
  }

  return false
}

export function getServiceColor(serviceType: string): string {
  return '#888888'
}
