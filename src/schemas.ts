/**
 * Zod schemas for v1 and v2 data models.
 *
 * Exports:
 *  - Schemas (InfraNodeSchema, InfraEdgeSchema, InfraGraphSchema, ...)
 *  - validateGraph(unknown) → InfraGraph
 *  - migrateV1toV2(InfraGraph, meta?) → InfraGraphV2
 */

import { z } from 'zod'
import type { InfraGraph, InfraNode, InfraEdge } from './types'
import type {
  InfraNodeV2,
  InfraEdgeV2,
  InfraGraphV2,
  SnapshotMeta,
  ResourceTag,
  TagIndex,
} from './types-v2'

// ---------------------------------------------------------------------------
// Primitive enums
// ---------------------------------------------------------------------------

export const ProviderSchema = z.enum(['aws', 'azure', 'gcp'])

export const NodeCategorySchema = z.enum([
  'compute',
  'database',
  'storage',
  'network',
  'serverless',
  'container',
  'cdn',
  'messaging',
  'analytics',
])

export const NodeCategoryV2Schema = z.enum([
  'compute',
  'database',
  'storage',
  'network',
  'serverless',
  'container',
  'cdn',
  'messaging',
  'analytics',
  'security',
  'ml',
])

export const HealthStatusSchema = z.enum(['healthy', 'warning', 'error'])

// ---------------------------------------------------------------------------
// v1 schemas
// ---------------------------------------------------------------------------

export const InfraNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: ProviderSchema,
  type: z.string().min(1),
  category: NodeCategorySchema,
  region: z.string().min(1),
  parent: z.string().optional(),
  metadata: z.record(z.string()),
  status: HealthStatusSchema,
  importance: z.number().int().min(1).max(10),
})

export const InfraEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.enum(['network', 'data', 'dependency', 'cross-cloud']),
  label: z.string().optional(),
})

export const InfraGraphSchema = z.object({
  nodes: z.array(InfraNodeSchema),
  edges: z.array(InfraEdgeSchema),
})

// ---------------------------------------------------------------------------
// v2 component schemas
// ---------------------------------------------------------------------------

export const StatusDetailSchema = z.object({
  status: HealthStatusSchema,
  reason: z.string().optional(),
  source: z.enum(['scan', 'cloudwatch', 'azure_monitor', 'gcp_monitoring', 'manual']),
  checkedAt: z.string().datetime({ offset: true }),
})

export const ResourceTagSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  source: z.enum(['aws_tag', 'azure_tag', 'gcp_label', 'terraform', 'manual']),
})

export const CostBreakdownItemSchema = z.object({
  component: z.string().min(1),
  monthlyUsd: z.number().nonnegative(),
})

export const ResourceCostSchema = z.object({
  monthlyUsd: z.number().nonnegative(),
  rawAmount: z.number().optional(),
  rawCurrency: z.string().optional(),
  rawPeriod: z.enum(['hourly', 'daily', 'monthly', 'yearly']).optional(),
  confidence: z.enum(['exact', 'estimated', 'unknown']),
  breakdown: z.array(CostBreakdownItemSchema).optional(),
  lastUpdated: z.string().datetime({ offset: true }),
})

export const TerraformRefSchema = z.object({
  resourceAddress: z.string().min(1),
  statePath: z.string().optional(),
  workspaceName: z.string().optional(),
  modulePath: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Typed metadata schemas
// ---------------------------------------------------------------------------

const EC2MetadataSchema = z.object({
  resourceType: z.literal('ec2'),
  instanceType: z.string(),
  amiId: z.string(),
  state: z.enum(['running', 'stopped', 'pending', 'terminated', 'stopping']),
  privateIp: z.string().optional(),
  publicIp: z.string().optional(),
  keyName: z.string().optional(),
  vpcId: z.string().optional(),
  subnetId: z.string().optional(),
  securityGroups: z.array(z.string()).optional(),
  iamInstanceProfile: z.string().optional(),
  platform: z.enum(['linux', 'windows']).optional(),
  architecture: z.enum(['x86_64', 'arm64']).optional(),
  tenancy: z.enum(['default', 'dedicated', 'host']).optional(),
})

const RDSMetadataSchema = z.object({
  resourceType: z.literal('rds'),
  engine: z.string(),
  engineVersion: z.string(),
  instanceClass: z.string(),
  multiAz: z.boolean(),
  storageType: z.enum(['gp2', 'gp3', 'io1', 'io2', 'standard']).optional(),
  allocatedStorageGb: z.number().optional(),
  dbName: z.string().optional(),
  port: z.number().optional(),
  endpoint: z.string().optional(),
  vpcId: z.string().optional(),
  backupRetentionDays: z.number().optional(),
  deletionProtection: z.boolean().optional(),
  performanceInsightsEnabled: z.boolean().optional(),
})

const LambdaMetadataSchema = z.object({
  resourceType: z.literal('lambda'),
  runtime: z.string(),
  handler: z.string(),
  memorySize: z.number(),
  timeoutSeconds: z.number(),
  codeSize: z.number().optional(),
  lastModified: z.string().optional(),
  layers: z.array(z.string()).optional(),
  vpcId: z.string().optional(),
  subnetIds: z.array(z.string()).optional(),
  environment: z.record(z.string()).optional(),
  architectures: z.array(z.enum(['x86_64', 'arm64'])).optional(),
  packageType: z.enum(['Zip', 'Image']).optional(),
})

const S3MetadataSchema = z.object({
  resourceType: z.literal('s3'),
  bucketName: z.string(),
  region: z.string(),
  versioning: z.enum(['enabled', 'suspended', 'disabled']),
  encryption: z.enum(['AES256', 'aws:kms', 'none']).optional(),
  publicAccess: z.boolean(),
  replicationEnabled: z.boolean(),
  lifecycleRulesCount: z.number().optional(),
  approximateSizeGb: z.number().optional(),
  objectCount: z.number().optional(),
})

const VpcMetadataSchema = z.object({
  resourceType: z.literal('vpc'),
  cidrBlock: z.string(),
  isDefault: z.boolean(),
  enableDnsHostnames: z.boolean(),
  enableDnsSupport: z.boolean(),
  subnetIds: z.array(z.string()).optional(),
  routeTableIds: z.array(z.string()).optional(),
  internetGatewayId: z.string().optional(),
})

const SubnetMetadataSchema = z.object({
  resourceType: z.literal('subnet'),
  cidrBlock: z.string(),
  availabilityZone: z.string(),
  availableIpCount: z.number().optional(),
  isPublic: z.boolean(),
  vpcId: z.string(),
  routeTableId: z.string().optional(),
})

const NodePoolSchema = z.object({
  name: z.string(),
  instanceType: z.string(),
  desiredSize: z.number(),
})

const EKSMetadataSchema = z.object({
  resourceType: z.literal('eks'),
  kubernetesVersion: z.string(),
  status: z.enum(['ACTIVE', 'CREATING', 'DELETING', 'FAILED', 'UPDATING']),
  endpoint: z.string().optional(),
  roleArn: z.string().optional(),
  nodeGroups: z.array(NodePoolSchema).optional(),
  addons: z.array(z.string()).optional(),
  loggingEnabled: z.boolean().optional(),
  privateAccess: z.boolean().optional(),
  publicAccess: z.boolean().optional(),
})

const ECSMetadataSchema = z.object({
  resourceType: z.literal('ecs'),
  launchType: z.enum(['FARGATE', 'EC2', 'EXTERNAL']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DELETE_IN_PROGRESS']),
  runningTasksCount: z.number(),
  pendingTasksCount: z.number().optional(),
  servicesCount: z.number().optional(),
  capacityProviders: z.array(z.string()).optional(),
})

const AKSNodePoolSchema = z.object({
  name: z.string(),
  vmSize: z.string(),
  count: z.number(),
  mode: z.enum(['System', 'User']),
})

const AKSMetadataSchema = z.object({
  resourceType: z.literal('aks'),
  kubernetesVersion: z.string(),
  provisioningState: z.string(),
  nodeResourceGroup: z.string().optional(),
  networkPlugin: z.enum(['kubenet', 'azure', 'none']).optional(),
  nodePools: z.array(AKSNodePoolSchema).optional(),
  enableRBAC: z.boolean().optional(),
  fqdn: z.string().optional(),
  oidcIssuerEnabled: z.boolean().optional(),
})

const CosmosDBLocationSchema = z.object({
  locationName: z.string(),
  failoverPriority: z.number(),
})

const CosmosDBMetadataSchema = z.object({
  resourceType: z.literal('cosmosdb'),
  kind: z.enum(['GlobalDocumentDB', 'MongoDB', 'Parse']),
  consistencyLevel: z.enum([
    'Strong',
    'BoundedStaleness',
    'Session',
    'ConsistentPrefix',
    'Eventual',
  ]),
  enableMultipleWriteLocations: z.boolean(),
  enableFreeTier: z.boolean().optional(),
  backupPolicy: z.enum(['Periodic', 'Continuous']).optional(),
  enableAnalyticalStorage: z.boolean().optional(),
  totalThroughputLimit: z.number().optional(),
  locations: z.array(CosmosDBLocationSchema).optional(),
})

const GKENodePoolSchema = z.object({
  name: z.string(),
  machineType: z.string(),
  nodeCount: z.number(),
})

const GKEMetadataSchema = z.object({
  resourceType: z.literal('gke'),
  currentMasterVersion: z.string(),
  status: z.enum(['RUNNING', 'PROVISIONING', 'STOPPING', 'ERROR', 'RECONCILING', 'DEGRADED']),
  network: z.string().optional(),
  subnetwork: z.string().optional(),
  nodePools: z.array(GKENodePoolSchema).optional(),
  autopilot: z.boolean().optional(),
  privateCluster: z.boolean().optional(),
  releaseChannel: z.enum(['RAPID', 'REGULAR', 'STABLE', 'UNSPECIFIED']).optional(),
  loggingService: z.string().optional(),
  monitoringService: z.string().optional(),
})

const BigQueryMetadataSchema = z.object({
  resourceType: z.literal('bigquery'),
  location: z.string(),
  tableCount: z.number().optional(),
  totalBytesProcessed: z.number().optional(),
  defaultTableExpirationMs: z.number().optional(),
  labels: z.record(z.string()).optional(),
  encryptionConfiguration: z.object({ kmsKeyName: z.string() }).optional(),
  isCaseInsensitive: z.boolean().optional(),
})

const GenericMetadataSchema = z.object({
  resourceType: z.literal('generic'),
}).passthrough()

export const TypedMetadataSchema = z.discriminatedUnion('resourceType', [
  EC2MetadataSchema,
  RDSMetadataSchema,
  LambdaMetadataSchema,
  S3MetadataSchema,
  VpcMetadataSchema,
  SubnetMetadataSchema,
  EKSMetadataSchema,
  ECSMetadataSchema,
  AKSMetadataSchema,
  CosmosDBMetadataSchema,
  GKEMetadataSchema,
  BigQueryMetadataSchema,
  GenericMetadataSchema,
])

// ---------------------------------------------------------------------------
// Edge relation type
// ---------------------------------------------------------------------------

export const EdgeRelationTypeSchema = z.enum([
  'vpc_contains',
  'subnet_contains',
  'security_group',
  'load_balance',
  'peering',
  'db_connection',
  'cache_connection',
  'queue_publish',
  'queue_subscribe',
  'storage_read',
  'storage_write',
  'cdc_replication',
  'data_replication',
  'invokes',
  'depends_on',
  'iam_grants',
  'cdn_origin',
  'dns_failover',
  'cross_cloud_data',
  'cross_cloud_network',
])

// ---------------------------------------------------------------------------
// InfraNodeV2 / InfraEdgeV2
// ---------------------------------------------------------------------------

export const InfraNodeV2Schema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: ProviderSchema,
  type: z.string().min(1),
  category: NodeCategoryV2Schema,
  region: z.string().min(1),
  parent: z.string().optional(),
  status: HealthStatusSchema,
  importance: z.number().int().min(1).max(10),

  accountId: z.string().optional(),
  resourceArn: z.string().optional(),

  statusDetail: StatusDetailSchema.optional(),
  typedMetadata: TypedMetadataSchema.optional(),
  metadata: z.record(z.string()),

  tags: z.array(ResourceTagSchema).optional(),
  tagIndex: z.record(z.string()).optional(),

  cost: ResourceCostSchema.optional(),
  terraform: TerraformRefSchema.optional(),

  discoveredAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
})

export const InfraEdgeV2Schema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  relationType: EdgeRelationTypeSchema,
  label: z.string().optional(),
  port: z.string().optional(),
  protocol: z.string().optional(),
  bandwidthMbps: z.number().nonnegative().optional(),
  encrypted: z.boolean().optional(),
  discoveredAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
})

// ---------------------------------------------------------------------------
// SnapshotMeta / InfraGraphV2
// ---------------------------------------------------------------------------

export const SnapshotMetaSchema = z.object({
  snapshotId: z.string().min(1),
  scannedAt: z.string().datetime({ offset: true }),
  scannerVersion: z.string().min(1),
  providers: z.array(ProviderSchema).min(1),
  regions: z.array(z.string()).min(1),
  durationMs: z.number().nonnegative().optional(),
  apiCallCount: z.number().nonnegative().optional(),
  warnings: z.array(z.string()).optional(),
})

export const InfraGraphV2Schema = z.object({
  version: z.literal(2),
  meta: SnapshotMetaSchema,
  nodes: z.array(InfraNodeV2Schema),
  edges: z.array(InfraEdgeV2Schema),
})

// ---------------------------------------------------------------------------
// FilterSpec schema (mirrors src/query/filter.ts FilterSpec)
// ---------------------------------------------------------------------------

export const TagFilterSchema = z.object({
  key: z.string().min(1),
  value: z.string().optional(),
  /** If true, match nodes that do NOT have this tag */
  negate: z.boolean().optional(),
})

export const FilterSpecSchema = z.object({
  providers: z.array(ProviderSchema).optional(),
  regions: z.array(z.string()).optional(),
  categories: z.array(NodeCategorySchema).optional(),
  types: z.array(z.string()).optional(),
  statuses: z.array(HealthStatusSchema).optional(),
  tags: z.array(TagFilterSchema).optional(),
  cost: z
    .object({
      minMonthlyUsd: z.number().nonnegative().optional(),
      maxMonthlyUsd: z.number().nonnegative().optional(),
    })
    .optional(),
  minImportance: z.number().int().min(1).max(10).optional(),
  searchText: z.string().optional(),
  subtreeRootId: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Inferred TS types from schemas (useful for runtime-validated data)
// ---------------------------------------------------------------------------

export type InfraNodeParsed = z.infer<typeof InfraNodeSchema>
export type InfraEdgeParsed = z.infer<typeof InfraEdgeSchema>
export type InfraGraphParsed = z.infer<typeof InfraGraphSchema>
export type InfraNodeV2Parsed = z.infer<typeof InfraNodeV2Schema>
export type InfraEdgeV2Parsed = z.infer<typeof InfraEdgeV2Schema>
export type InfraGraphV2Parsed = z.infer<typeof InfraGraphV2Schema>
export type SnapshotMetaParsed = z.infer<typeof SnapshotMetaSchema>
export type FilterSpecParsed = z.infer<typeof FilterSpecSchema>

// ---------------------------------------------------------------------------
// validateGraph — parses unknown data and returns a typed InfraGraph (v1)
// ---------------------------------------------------------------------------

export function validateGraph(raw: unknown): InfraGraph {
  return InfraGraphSchema.parse(raw)
}

// ---------------------------------------------------------------------------
// migrateV1toV2 — converts a v1 InfraGraph to InfraGraphV2
// ---------------------------------------------------------------------------

/** Minimal meta required when caller doesn't supply a full SnapshotMeta */
export interface MigrationMeta {
  snapshotId?: string
  scannerVersion?: string
  scannedAt?: string
}

export function migrateV1toV2(
  graph: InfraGraph,
  partialMeta?: MigrationMeta,
): InfraGraphV2 {
  const now = new Date().toISOString()

  // Derive provider and region lists from the node set
  const providerSet = new Set<string>()
  const regionSet = new Set<string>()
  graph.nodes.forEach((n) => {
    providerSet.add(n.provider)
    regionSet.add(n.region)
  })

  const meta: SnapshotMeta = {
    snapshotId: partialMeta?.snapshotId ?? `migrated-${Date.now()}`,
    scannedAt: partialMeta?.scannedAt ?? now,
    scannerVersion: partialMeta?.scannerVersion ?? '1.0.0-migrated',
    providers: (providerSet.size > 0
      ? Array.from(providerSet)
      : ['aws']) as SnapshotMeta['providers'],
    regions: regionSet.size > 0 ? Array.from(regionSet) : ['unknown'],
    warnings: ['Migrated from v1 format — typedMetadata not available'],
  }

  const nodes: InfraNodeV2[] = graph.nodes.map((node: InfraNode) => ({
    ...node,
    // category is compatible — NodeCategory ⊆ NodeCategoryV2
    category: node.category,
    metadata: node.metadata,
    discoveredAt: now,
    updatedAt: now,
  }))

  const edges: InfraEdgeV2[] = graph.edges.map((edge: InfraEdge) => {
    // Map v1 edge types to the closest v2 relation type
    const relationTypeMap: Record<InfraEdge['type'], InfraEdgeV2['relationType']> = {
      network: 'peering',
      data: 'data_replication',
      dependency: 'depends_on',
      'cross-cloud': 'cross_cloud_network',
    }
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relationType: relationTypeMap[edge.type] ?? 'depends_on',
      label: edge.label,
      discoveredAt: now,
      updatedAt: now,
    }
  })

  return { version: 2, meta, nodes, edges }
}
