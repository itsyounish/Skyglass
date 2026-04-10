/**
 * Terraform State Importer
 *
 * Parses Terraform state file v4 format (JSON) and converts resources into
 * InfraGraph (nodes + edges) that the viewer can render.
 *
 * Supports AWS, Azure, and GCP resource types. Extracts edges from:
 * - `depends_on` explicit dependencies
 * - Attribute references (vpc_id, subnet_ids, security_group_ids, etc.)
 * - Parent-child relationships (subnet -> VPC)
 */

import type {
  InfraNode,
  InfraEdge,
  InfraGraph,
  Provider,
  NodeCategory,
  HealthStatus,
} from '../types'

// ---------------------------------------------------------------------------
// Terraform state v4 types (subset we care about)
// ---------------------------------------------------------------------------

interface TerraformState {
  version: number
  terraform_version: string
  serial: number
  lineage: string
  outputs?: Record<string, unknown>
  resources: TerraformResource[]
}

interface TerraformResource {
  module?: string
  mode: 'managed' | 'data'
  type: string
  name: string
  provider: string
  instances: TerraformInstance[]
}

interface TerraformInstance {
  schema_version: number
  attributes: Record<string, any>
  sensitive_attributes?: string[]
  private?: string
  dependencies?: string[]
  index_key?: string | number
}

// ---------------------------------------------------------------------------
// Resource type -> category mapping
// ---------------------------------------------------------------------------

interface ResourceMapping {
  category: NodeCategory
  provider: Provider
  importance: number
  /** Extract a human-readable label from the Terraform attributes */
  label: (attrs: Record<string, any>, name: string) => string
  /** Extract metadata (non-sensitive) from the Terraform attributes */
  metadata: (attrs: Record<string, any>) => Record<string, string>
  /** Determine health status from attributes */
  status: (attrs: Record<string, any>) => HealthStatus
  /** Extract the region from attributes (provider-specific) */
  region: (attrs: Record<string, any>) => string
  /** Extract reference attributes that should become edges */
  references: (attrs: Record<string, any>) => ReferenceEdge[]
  /** If this resource is a child of another, return the parent attribute key */
  parentRef?: string
}

interface ReferenceEdge {
  targetAttr: string // The raw attribute value (e.g. a VPC id)
  type: 'network' | 'data' | 'dependency' | 'cross-cloud'
  label: string
}

// ---------------------------------------------------------------------------
// Helper: extract region from ARN or provider string
// ---------------------------------------------------------------------------

function regionFromArn(arn: string): string {
  if (!arn) return 'unknown'
  // arn:aws:service:region:account:...
  const parts = arn.split(':')
  return parts[3] || 'unknown'
}

function awsRegion(attrs: Record<string, any>): string {
  if (attrs.arn) return regionFromArn(attrs.arn)
  if (attrs.region) return attrs.region
  if (attrs.availability_zone) {
    return attrs.availability_zone.replace(/-[a-z]$/, '')
  }
  return 'us-east-1'
}

function azureRegion(attrs: Record<string, any>): string {
  return attrs.location || 'unknown'
}

function gcpRegion(attrs: Record<string, any>): string {
  if (attrs.location) return attrs.location
  if (attrs.region) return attrs.region
  if (attrs.zone) return attrs.zone.replace(/-[a-z]$/, '')
  return 'unknown'
}

function str(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val)
}

// ---------------------------------------------------------------------------
// Attribute-based reference extractors
// ---------------------------------------------------------------------------

function awsVpcRef(attrs: Record<string, any>): ReferenceEdge[] {
  const refs: ReferenceEdge[] = []
  if (attrs.vpc_id) {
    refs.push({ targetAttr: attrs.vpc_id, type: 'network', label: 'in VPC' })
  }
  return refs
}

function awsSubnetRefs(attrs: Record<string, any>): ReferenceEdge[] {
  const refs: ReferenceEdge[] = []
  if (attrs.subnet_id) {
    refs.push({ targetAttr: attrs.subnet_id, type: 'network', label: 'in subnet' })
  }
  const subnetIds = attrs.subnet_ids || attrs.subnets || []
  if (Array.isArray(subnetIds)) {
    for (const sid of subnetIds) {
      refs.push({ targetAttr: sid, type: 'network', label: 'in subnet' })
    }
  }
  return refs
}

function awsSgRefs(attrs: Record<string, any>): ReferenceEdge[] {
  const refs: ReferenceEdge[] = []
  const sgIds = attrs.security_groups || attrs.vpc_security_group_ids || []
  if (Array.isArray(sgIds)) {
    for (const sgId of sgIds) {
      refs.push({ targetAttr: sgId, type: 'network', label: 'security group' })
    }
  }
  return refs
}

// ---------------------------------------------------------------------------
// Resource type registry
// ---------------------------------------------------------------------------

const RESOURCE_MAPPINGS: Record<string, ResourceMapping> = {
  // ========================= AWS =========================

  aws_instance: {
    category: 'compute',
    provider: 'aws',
    importance: 7,
    label: (attrs, name) => attrs.tags?.Name || attrs.id || name,
    metadata: (attrs) => ({
      instanceId: str(attrs.id),
      instanceType: str(attrs.instance_type),
      ami: str(attrs.ami),
      state: str(attrs.instance_state),
      privateIp: str(attrs.private_ip),
      publicIp: str(attrs.public_ip),
      arn: str(attrs.arn),
      az: str(attrs.availability_zone),
    }),
    status: (attrs) => {
      const s = (attrs.instance_state || '').toLowerCase()
      if (s === 'running') return 'healthy'
      if (s === 'stopped' || s === 'stopping') return 'warning'
      return 'error'
    },
    region: awsRegion,
    references: (attrs) => [
      ...awsVpcRef(attrs),
      ...awsSubnetRefs(attrs),
      ...awsSgRefs(attrs),
    ],
    parentRef: 'subnet_id',
  },

  aws_db_instance: {
    category: 'database',
    provider: 'aws',
    importance: 9,
    label: (attrs, name) => attrs.identifier || attrs.id || name,
    metadata: (attrs) => ({
      dbInstanceId: str(attrs.identifier),
      engine: `${str(attrs.engine)} ${str(attrs.engine_version)}`.trim(),
      class: str(attrs.instance_class),
      storage: `${str(attrs.allocated_storage)} GB`,
      multiAz: str(attrs.multi_az),
      endpoint: str(attrs.endpoint),
      port: str(attrs.port),
      status: str(attrs.status),
      arn: str(attrs.arn),
    }),
    status: (attrs) => {
      const s = (attrs.status || '').toLowerCase()
      if (s === 'available') return 'healthy'
      if (s === 'creating' || s === 'modifying') return 'warning'
      return 'error'
    },
    region: awsRegion,
    references: (attrs) => [
      ...awsVpcRef(attrs),
      ...awsSubnetRefs(attrs),
      ...awsSgRefs(attrs),
    ],
  },

  aws_lambda_function: {
    category: 'serverless',
    provider: 'aws',
    importance: 6,
    label: (attrs, name) => attrs.function_name || name,
    metadata: (attrs) => ({
      functionName: str(attrs.function_name),
      runtime: str(attrs.runtime),
      handler: str(attrs.handler),
      memory: `${str(attrs.memory_size)} MB`,
      timeout: `${str(attrs.timeout)}s`,
      arn: str(attrs.arn),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: (attrs) => {
      const refs: ReferenceEdge[] = [...awsVpcRef(attrs), ...awsSubnetRefs(attrs), ...awsSgRefs(attrs)]
      // Check VPC config
      if (attrs.vpc_config && Array.isArray(attrs.vpc_config)) {
        const vc = attrs.vpc_config[0]
        if (vc) {
          if (vc.vpc_id) refs.push({ targetAttr: vc.vpc_id, type: 'network', label: 'in VPC' })
          for (const sid of vc.subnet_ids || []) {
            refs.push({ targetAttr: sid, type: 'network', label: 'in subnet' })
          }
          for (const sg of vc.security_group_ids || []) {
            refs.push({ targetAttr: sg, type: 'network', label: 'security group' })
          }
        }
      }
      return refs
    },
  },

  aws_s3_bucket: {
    category: 'storage',
    provider: 'aws',
    importance: 6,
    label: (attrs, name) => attrs.bucket || name,
    metadata: (attrs) => ({
      bucketName: str(attrs.bucket),
      arn: str(attrs.arn),
      region: str(attrs.region),
      acl: str(attrs.acl),
    }),
    status: () => 'healthy',
    region: (attrs) => attrs.region || awsRegion(attrs),
    references: () => [],
  },

  aws_vpc: {
    category: 'network',
    provider: 'aws',
    importance: 8,
    label: (attrs, name) => attrs.tags?.Name || attrs.id || name,
    metadata: (attrs) => ({
      vpcId: str(attrs.id),
      cidr: str(attrs.cidr_block),
      arn: str(attrs.arn),
      isDefault: str(attrs.default),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: () => [],
  },

  aws_subnet: {
    category: 'network',
    provider: 'aws',
    importance: 4,
    label: (attrs, name) => attrs.tags?.Name || attrs.id || name,
    metadata: (attrs) => ({
      subnetId: str(attrs.id),
      cidr: str(attrs.cidr_block),
      az: str(attrs.availability_zone),
      mapPublicIp: str(attrs.map_public_ip_on_launch),
      arn: str(attrs.arn),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: (attrs) => awsVpcRef(attrs),
    parentRef: 'vpc_id',
  },

  aws_security_group: {
    category: 'network',
    provider: 'aws',
    importance: 5,
    label: (attrs, name) => attrs.tags?.Name || attrs.name || name,
    metadata: (attrs) => ({
      sgId: str(attrs.id),
      name: str(attrs.name),
      description: str(attrs.description),
      arn: str(attrs.arn),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: (attrs) => awsVpcRef(attrs),
    parentRef: 'vpc_id',
  },

  aws_lb: {
    category: 'network',
    provider: 'aws',
    importance: 7,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      name: str(attrs.name),
      arn: str(attrs.arn),
      dnsName: str(attrs.dns_name),
      type: str(attrs.load_balancer_type),
      scheme: str(attrs.internal ? 'internal' : 'internet-facing'),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: (attrs) => [
      ...awsVpcRef(attrs),
      ...awsSubnetRefs(attrs),
      ...awsSgRefs(attrs),
    ],
  },

  aws_alb: {
    category: 'network',
    provider: 'aws',
    importance: 7,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      name: str(attrs.name),
      arn: str(attrs.arn),
      dnsName: str(attrs.dns_name),
      type: 'application',
      scheme: str(attrs.internal ? 'internal' : 'internet-facing'),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: (attrs) => [
      ...awsVpcRef(attrs),
      ...awsSubnetRefs(attrs),
      ...awsSgRefs(attrs),
    ],
  },

  aws_ecs_cluster: {
    category: 'container',
    provider: 'aws',
    importance: 8,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      clusterName: str(attrs.name),
      arn: str(attrs.arn),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: () => [],
  },

  aws_eks_cluster: {
    category: 'container',
    provider: 'aws',
    importance: 9,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      clusterName: str(attrs.name),
      arn: str(attrs.arn),
      version: str(attrs.version),
      endpoint: str(attrs.endpoint),
      status: str(attrs.status),
    }),
    status: (attrs) => {
      const s = (attrs.status || '').toUpperCase()
      if (s === 'ACTIVE') return 'healthy'
      if (s === 'CREATING' || s === 'UPDATING') return 'warning'
      return 'error'
    },
    region: awsRegion,
    references: (attrs) => {
      const refs: ReferenceEdge[] = []
      if (attrs.vpc_config && Array.isArray(attrs.vpc_config)) {
        const vc = attrs.vpc_config[0]
        if (vc) {
          if (vc.vpc_id) refs.push({ targetAttr: vc.vpc_id, type: 'network', label: 'in VPC' })
          for (const sid of vc.subnet_ids || []) {
            refs.push({ targetAttr: sid, type: 'network', label: 'in subnet' })
          }
          for (const sg of vc.security_group_ids || vc.cluster_security_group_id ? [vc.cluster_security_group_id] : []) {
            if (sg) refs.push({ targetAttr: sg, type: 'network', label: 'security group' })
          }
        }
      }
      return refs
    },
  },

  aws_sqs_queue: {
    category: 'messaging',
    provider: 'aws',
    importance: 6,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      queueName: str(attrs.name),
      arn: str(attrs.arn),
      url: str(attrs.url || attrs.id),
      fifo: str(attrs.fifo_queue),
      visibilityTimeout: str(attrs.visibility_timeout_seconds),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: (attrs) => {
      const refs: ReferenceEdge[] = []
      if (attrs.redrive_policy) {
        try {
          const policy = typeof attrs.redrive_policy === 'string'
            ? JSON.parse(attrs.redrive_policy)
            : attrs.redrive_policy
          if (policy.deadLetterTargetArn) {
            refs.push({ targetAttr: policy.deadLetterTargetArn, type: 'data', label: 'dead letter queue' })
          }
        } catch { /* ignore parse errors */ }
      }
      return refs
    },
  },

  aws_sns_topic: {
    category: 'messaging',
    provider: 'aws',
    importance: 6,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      topicName: str(attrs.name),
      arn: str(attrs.arn),
      displayName: str(attrs.display_name),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: () => [],
  },

  aws_dynamodb_table: {
    category: 'database',
    provider: 'aws',
    importance: 8,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      tableName: str(attrs.name),
      arn: str(attrs.arn),
      billingMode: str(attrs.billing_mode),
      hashKey: str(attrs.hash_key),
      rangeKey: str(attrs.range_key),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: () => [],
  },

  aws_elasticache_cluster: {
    category: 'database',
    provider: 'aws',
    importance: 7,
    label: (attrs, name) => attrs.cluster_id || name,
    metadata: (attrs) => ({
      clusterId: str(attrs.cluster_id),
      engine: str(attrs.engine),
      engineVersion: str(attrs.engine_version),
      nodeType: str(attrs.node_type),
      numNodes: str(attrs.num_cache_nodes),
      arn: str(attrs.arn),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: (attrs) => {
      const refs: ReferenceEdge[] = []
      if (attrs.subnet_group_name) {
        refs.push({ targetAttr: attrs.subnet_group_name, type: 'network', label: 'subnet group' })
      }
      const sgIds = attrs.security_group_ids || []
      for (const sg of sgIds) {
        refs.push({ targetAttr: sg, type: 'network', label: 'security group' })
      }
      return refs
    },
  },

  aws_route53_zone: {
    category: 'network',
    provider: 'aws',
    importance: 7,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      zoneName: str(attrs.name),
      zoneId: str(attrs.zone_id || attrs.id),
      arn: str(attrs.arn),
      comment: str(attrs.comment),
    }),
    status: () => 'healthy',
    region: () => 'global',
    references: (attrs) => awsVpcRef(attrs),
  },

  aws_api_gateway_rest_api: {
    category: 'serverless',
    provider: 'aws',
    importance: 7,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      apiName: str(attrs.name),
      arn: str(attrs.arn),
      apiId: str(attrs.id),
      description: str(attrs.description),
    }),
    status: () => 'healthy',
    region: awsRegion,
    references: () => [],
  },

  aws_cloudfront_distribution: {
    category: 'cdn',
    provider: 'aws',
    importance: 7,
    label: (attrs, name) => attrs.domain_name || name,
    metadata: (attrs) => ({
      distributionId: str(attrs.id),
      domainName: str(attrs.domain_name),
      arn: str(attrs.arn),
      status: str(attrs.status),
      enabled: str(attrs.enabled),
    }),
    status: (attrs) => (attrs.status === 'Deployed' ? 'healthy' : 'warning'),
    region: () => 'global',
    references: () => [],
  },

  // ========================= Azure =========================

  azurerm_kubernetes_cluster: {
    category: 'container',
    provider: 'azure',
    importance: 9,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      resourceId: str(attrs.id),
      resourceGroup: str(attrs.resource_group_name),
      kubernetesVersion: str(attrs.kubernetes_version),
      fqdn: str(attrs.fqdn),
      dnsPrefix: str(attrs.dns_prefix),
    }),
    status: () => 'healthy',
    region: azureRegion,
    references: () => [],
  },

  azurerm_cosmosdb_account: {
    category: 'database',
    provider: 'azure',
    importance: 8,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      resourceId: str(attrs.id),
      resourceGroup: str(attrs.resource_group_name),
      kind: str(attrs.kind),
      documentEndpoint: str(attrs.endpoint),
      offerType: str(attrs.offer_type),
    }),
    status: () => 'healthy',
    region: azureRegion,
    references: () => [],
  },

  azurerm_virtual_network: {
    category: 'network',
    provider: 'azure',
    importance: 8,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      resourceId: str(attrs.id),
      resourceGroup: str(attrs.resource_group_name),
      addressSpace: Array.isArray(attrs.address_space) ? attrs.address_space.join(', ') : str(attrs.address_space),
    }),
    status: () => 'healthy',
    region: azureRegion,
    references: () => [],
  },

  azurerm_function_app: {
    category: 'serverless',
    provider: 'azure',
    importance: 5,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      resourceId: str(attrs.id),
      resourceGroup: str(attrs.resource_group_name),
      defaultHostname: str(attrs.default_hostname),
    }),
    status: () => 'healthy',
    region: azureRegion,
    references: () => [],
  },

  // ========================= GCP =========================

  google_compute_instance: {
    category: 'compute',
    provider: 'gcp',
    importance: 7,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      name: str(attrs.name),
      machineType: str(attrs.machine_type),
      zone: str(attrs.zone),
      selfLink: str(attrs.self_link),
      status: str(attrs.current_status),
    }),
    status: (attrs) => {
      const s = (attrs.current_status || '').toUpperCase()
      if (s === 'RUNNING') return 'healthy'
      if (s === 'STAGING' || s === 'PROVISIONING') return 'warning'
      return 'error'
    },
    region: gcpRegion,
    references: (attrs) => {
      const refs: ReferenceEdge[] = []
      const ifaces = attrs.network_interface || []
      for (const iface of ifaces) {
        if (iface.network) refs.push({ targetAttr: iface.network, type: 'network', label: 'in network' })
        if (iface.subnetwork) refs.push({ targetAttr: iface.subnetwork, type: 'network', label: 'in subnetwork' })
      }
      return refs
    },
  },

  google_sql_database_instance: {
    category: 'database',
    provider: 'gcp',
    importance: 8,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      name: str(attrs.name),
      databaseVersion: str(attrs.database_version),
      region: str(attrs.region),
      selfLink: str(attrs.self_link),
      connectionName: str(attrs.connection_name),
    }),
    status: () => 'healthy',
    region: gcpRegion,
    references: () => [],
  },

  google_cloud_run_service: {
    category: 'container',
    provider: 'gcp',
    importance: 6,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      name: str(attrs.name),
      location: str(attrs.location),
      project: str(attrs.project),
    }),
    status: () => 'healthy',
    region: gcpRegion,
    references: () => [],
  },

  google_pubsub_topic: {
    category: 'messaging',
    provider: 'gcp',
    importance: 7,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      name: str(attrs.name),
      project: str(attrs.project),
    }),
    status: () => 'healthy',
    region: () => 'global',
    references: () => [],
  },

  google_bigquery_dataset: {
    category: 'analytics',
    provider: 'gcp',
    importance: 8,
    label: (attrs, name) => attrs.dataset_id || name,
    metadata: (attrs) => ({
      datasetId: str(attrs.dataset_id),
      project: str(attrs.project),
      location: str(attrs.location),
      friendlyName: str(attrs.friendly_name),
    }),
    status: () => 'healthy',
    region: (attrs) => (attrs.location || 'US').toLowerCase(),
    references: () => [],
  },

  google_storage_bucket: {
    category: 'storage',
    provider: 'gcp',
    importance: 6,
    label: (attrs, name) => attrs.name || name,
    metadata: (attrs) => ({
      bucketName: str(attrs.name),
      location: str(attrs.location),
      storageClass: str(attrs.storage_class),
      selfLink: str(attrs.self_link),
      project: str(attrs.project),
    }),
    status: () => 'healthy',
    region: (attrs) => (attrs.location || 'US').toLowerCase(),
    references: () => [],
  },
}

// ---------------------------------------------------------------------------
// Build a stable node ID from a Terraform resource address
// ---------------------------------------------------------------------------

function buildNodeId(resource: TerraformResource, instance: TerraformInstance): string {
  const module = resource.module ? `${resource.module}.` : ''
  const indexSuffix = instance.index_key !== undefined ? `[${instance.index_key}]` : ''
  return `tf-${module}${resource.type}.${resource.name}${indexSuffix}`
}

// ---------------------------------------------------------------------------
// Build a lookup key from a Terraform resource address (for depends_on)
// ---------------------------------------------------------------------------

function buildResourceAddress(resource: TerraformResource): string {
  const module = resource.module ? `${resource.module}.` : ''
  return `${module}${resource.type}.${resource.name}`
}

// ---------------------------------------------------------------------------
// Detect provider from resource type prefix
// ---------------------------------------------------------------------------

function providerFromType(type: string): Provider {
  if (type.startsWith('aws_')) return 'aws'
  if (type.startsWith('azurerm_') || type.startsWith('azuread_')) return 'azure'
  if (type.startsWith('google_')) return 'gcp'
  // Fallback: try to parse from provider string
  return 'aws'
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export async function parseTerraformState(statePath: string): Promise<InfraGraph> {
  const { readFile } = await import('fs/promises')
  const { existsSync } = await import('fs')

  let rawJson: string

  if (statePath === '-' || statePath === '/dev/stdin') {
    // Read from stdin
    const chunks: Buffer[] = []
    const stdin = process.stdin
    stdin.setEncoding('utf8')
    rawJson = await new Promise<string>((resolve, reject) => {
      let data = ''
      stdin.on('data', (chunk) => { data += chunk })
      stdin.on('end', () => resolve(data))
      stdin.on('error', reject)
    })
  } else {
    if (!existsSync(statePath)) {
      throw new Error(`Terraform state file not found: ${statePath}`)
    }
    rawJson = await readFile(statePath, 'utf-8')
  }

  let state: TerraformState
  try {
    state = JSON.parse(rawJson)
  } catch {
    throw new Error('Failed to parse Terraform state file: invalid JSON')
  }

  if (state.version !== 4) {
    console.warn(`[Terraform] State file version is ${state.version}, expected 4. Parsing may not be accurate.`)
  }

  console.log(`[Terraform] Parsing state: serial ${state.serial}, ${state.resources.length} resources, Terraform v${state.terraform_version}`)

  const nodes: InfraNode[] = []
  const edges: InfraEdge[] = []

  // Maps for edge resolution
  const nodeIdByAddress: Record<string, string> = {} // resource address -> node id
  const nodeIdByAttrId: Record<string, string> = {} // attribute value (e.g. vpc-123) -> node id
  const allNodeIds = new Set<string>()

  // First pass: create all nodes and index them
  for (const resource of state.resources) {
    // Skip data sources — they are read-only lookups, not managed resources
    if (resource.mode === 'data') continue

    const mapping = RESOURCE_MAPPINGS[resource.type]
    const resourceAddress = buildResourceAddress(resource)

    for (const instance of resource.instances) {
      const attrs = instance.attributes || {}
      const nodeId = buildNodeId(resource, instance)

      // Index by address for depends_on resolution
      nodeIdByAddress[resourceAddress] = nodeId

      // Index by common ID attributes for reference resolution
      const attrId = attrs.id || attrs.arn || attrs.self_link || ''
      if (attrId) {
        nodeIdByAttrId[attrId] = nodeId
      }
      // Also index by sub-IDs (e.g. vpc_id value itself for VPCs)
      if (attrs.vpc_id && resource.type === 'aws_vpc') {
        nodeIdByAttrId[attrs.vpc_id] = nodeId
      }
      if (attrs.id) {
        nodeIdByAttrId[attrs.id] = nodeId
      }

      allNodeIds.add(nodeId)

      if (mapping) {
        const provider = mapping.provider
        const label = mapping.label(attrs, resource.name)
        const region = mapping.region(attrs)
        const metadata = mapping.metadata(attrs)
        const status = mapping.status(attrs)

        nodes.push({
          id: nodeId,
          label,
          provider,
          type: resource.type.replace(/^(aws_|azurerm_|google_)/, ''),
          category: mapping.category,
          region,
          metadata: {
            terraformAddress: resourceAddress,
            ...metadata,
          },
          status,
          importance: mapping.importance,
        })
      } else {
        // Unknown resource type — still include it with best-effort mapping
        const provider = providerFromType(resource.type)
        nodes.push({
          id: nodeId,
          label: attrs.name || attrs.id || resource.name,
          provider,
          type: resource.type.replace(/^(aws_|azurerm_|google_)/, ''),
          category: guessCategory(resource.type),
          region: attrs.region || attrs.location || attrs.zone || 'unknown',
          metadata: {
            terraformAddress: resourceAddress,
            resourceType: resource.type,
            id: str(attrs.id),
          },
          status: 'healthy',
          importance: 3,
        })
      }
    }
  }

  // Second pass: resolve edges
  for (const resource of state.resources) {
    if (resource.mode === 'data') continue

    const mapping = RESOURCE_MAPPINGS[resource.type]

    for (const instance of resource.instances) {
      const attrs = instance.attributes || {}
      const sourceNodeId = buildNodeId(resource, instance)

      if (!allNodeIds.has(sourceNodeId)) continue

      // 1. depends_on explicit dependencies
      if (instance.dependencies) {
        for (const dep of instance.dependencies) {
          const targetNodeId = nodeIdByAddress[dep]
          if (targetNodeId && targetNodeId !== sourceNodeId) {
            edges.push({
              id: `edge-dep-${sourceNodeId}-${targetNodeId}`,
              source: sourceNodeId,
              target: targetNodeId,
              type: 'dependency',
              label: 'depends_on',
            })
          }
        }
      }

      // 2. Attribute-based references from mapping
      if (mapping) {
        const refs = mapping.references(attrs)
        for (const ref of refs) {
          const targetNodeId = nodeIdByAttrId[ref.targetAttr]
          if (targetNodeId && targetNodeId !== sourceNodeId) {
            const edgeId = `edge-ref-${sourceNodeId}-${targetNodeId}-${ref.label.replace(/\s+/g, '_')}`
            // Avoid duplicates
            if (!edges.find(e => e.id === edgeId)) {
              edges.push({
                id: edgeId,
                source: sourceNodeId,
                target: targetNodeId,
                type: ref.type,
                label: ref.label,
              })
            }
          }
        }

        // 3. Parent-child relationships
        if (mapping.parentRef) {
          const parentAttrValue = attrs[mapping.parentRef]
          if (parentAttrValue) {
            const parentNodeId = nodeIdByAttrId[parentAttrValue]
            if (parentNodeId) {
              // Update the node's parent field
              const node = nodes.find(n => n.id === sourceNodeId)
              if (node) {
                node.parent = parentNodeId
              }
            }
          }
        }
      }

      // 4. Generic attribute scanning for cross-references
      // Look for common reference patterns in attribute values
      scanAttributesForReferences(attrs, sourceNodeId, nodeIdByAttrId, edges, allNodeIds)
    }
  }

  // Detect cross-cloud edges (AWS resource referencing Azure/GCP resources)
  const providerOfNode: Record<string, Provider> = {}
  for (const node of nodes) {
    providerOfNode[node.id] = node.provider
  }
  for (const edge of edges) {
    const srcProvider = providerOfNode[edge.source]
    const tgtProvider = providerOfNode[edge.target]
    if (srcProvider && tgtProvider && srcProvider !== tgtProvider) {
      edge.type = 'cross-cloud'
    }
  }

  console.log(`[Terraform] Parsed ${nodes.length} nodes, ${edges.length} edges`)

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best-effort category guess from resource type name */
function guessCategory(type: string): NodeCategory {
  const t = type.toLowerCase()
  if (t.includes('instance') || t.includes('vm') || t.includes('compute')) return 'compute'
  if (t.includes('db') || t.includes('database') || t.includes('rds') || t.includes('sql') || t.includes('dynamo') || t.includes('cache') || t.includes('cosmos')) return 'database'
  if (t.includes('bucket') || t.includes('storage') || t.includes('s3')) return 'storage'
  if (t.includes('vpc') || t.includes('subnet') || t.includes('network') || t.includes('lb') || t.includes('alb') || t.includes('route') || t.includes('security_group') || t.includes('firewall')) return 'network'
  if (t.includes('lambda') || t.includes('function') || t.includes('api_gateway')) return 'serverless'
  if (t.includes('ecs') || t.includes('eks') || t.includes('kubernetes') || t.includes('container') || t.includes('cloud_run')) return 'container'
  if (t.includes('cloudfront') || t.includes('cdn') || t.includes('frontdoor')) return 'cdn'
  if (t.includes('sqs') || t.includes('sns') || t.includes('pubsub') || t.includes('eventbridge') || t.includes('queue') || t.includes('topic')) return 'messaging'
  if (t.includes('bigquery') || t.includes('analytics') || t.includes('athena') || t.includes('glue')) return 'analytics'
  return 'compute' // fallback
}

/**
 * Scan arbitrary attributes for values that match known resource IDs.
 * This catches references that aren't explicitly mapped, e.g. a custom
 * attribute that happens to contain a VPC ID or an ARN.
 */
function scanAttributesForReferences(
  attrs: Record<string, any>,
  sourceNodeId: string,
  nodeIdByAttrId: Record<string, string>,
  edges: InfraEdge[],
  allNodeIds: Set<string>,
): void {
  const existingTargets = new Set(
    edges.filter(e => e.source === sourceNodeId).map(e => e.target)
  )

  function scanValue(val: any, key: string): void {
    if (typeof val === 'string' && val.length > 5) {
      const targetNodeId = nodeIdByAttrId[val]
      if (targetNodeId && targetNodeId !== sourceNodeId && !existingTargets.has(targetNodeId)) {
        edges.push({
          id: `edge-attr-${sourceNodeId}-${targetNodeId}-${key}`,
          source: sourceNodeId,
          target: targetNodeId,
          type: 'dependency',
          label: `ref: ${key}`,
        })
        existingTargets.add(targetNodeId)
      }
    } else if (Array.isArray(val)) {
      for (const item of val) {
        scanValue(item, key)
      }
    }
    // Don't recurse into nested objects to avoid noise
  }

  // Only scan keys that look like references (contain "_id", "_arn", "_ids", etc.)
  const refKeyPatterns = ['_id', '_ids', '_arn', '_arns', '_name', '_link', 'target', 'source', 'destination']
  for (const [key, val] of Object.entries(attrs)) {
    const lk = key.toLowerCase()
    if (refKeyPatterns.some(p => lk.includes(p))) {
      scanValue(val, key)
    }
  }
}

// ---------------------------------------------------------------------------
// Redaction utility (strips sensitive metadata)
// ---------------------------------------------------------------------------

export function redactGraph(graph: InfraGraph): InfraGraph {
  const sensitivePatterns = [
    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // IPs
    /arn:aws:[^:]+:[^:]*:\d{12}:/, // AWS ARNs
    /^https?:\/\//, // URLs/endpoints
    /\.amazonaws\.com$/, // AWS endpoints
    /\.database\.windows\.net$/, // Azure SQL endpoints
    /\.documents\.azure\.com$/, // CosmosDB endpoints
    /\.redis\.cache\.windows\.net$/, // Azure Redis
    /\.servicebus\.windows\.net$/, // Azure Service Bus
  ]

  const sensitiveKeys = [
    'privateIp', 'publicIp', 'endpoint', 'documentEndpoint', 'uri', 'url',
    'fqdn', 'defaultHostName', 'dnsName', 'connectionName', 'externalIp',
    'internalIp', 'natIP', 'primaryEndpoint', 'arn', 'resourceId', 'selfLink',
    'resourcePath',
  ]

  function redactMetadata(metadata: Record<string, string>): Record<string, string> {
    const redacted: Record<string, string> = {}
    for (const [key, val] of Object.entries(metadata)) {
      if (sensitiveKeys.includes(key)) {
        redacted[key] = '[REDACTED]'
      } else if (sensitivePatterns.some(p => p.test(val))) {
        redacted[key] = '[REDACTED]'
      } else {
        redacted[key] = val
      }
    }
    return redacted
  }

  return {
    nodes: graph.nodes.map(node => ({
      ...node,
      metadata: redactMetadata(node.metadata),
    })),
    edges: graph.edges,
  }
}
