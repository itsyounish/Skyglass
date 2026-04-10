/**
 * Data Model v2
 *
 * Extends v1 types (src/types.ts) without breaking backward compatibility.
 * V1 InfraGraph / InfraNode / InfraEdge remain valid everywhere.
 */

import type {
  Provider,
  NodeCategory,
  HealthStatus,
  InfraNode,
  InfraEdge,
  InfraGraph,
} from './types'

// Re-export v1 primitives so consumers can import from one place
export type { Provider, NodeCategory, HealthStatus, InfraNode, InfraEdge, InfraGraph }

// ---------------------------------------------------------------------------
// Extended category set
// ---------------------------------------------------------------------------

export type NodeCategoryV2 = NodeCategory | 'security' | 'ml'

// ---------------------------------------------------------------------------
// Status with source tracking
// ---------------------------------------------------------------------------

export interface StatusDetail {
  status: HealthStatus
  reason?: string
  /** Which monitoring system produced this status */
  source: 'scan' | 'cloudwatch' | 'azure_monitor' | 'gcp_monitoring' | 'manual'
  /** ISO-8601 timestamp */
  checkedAt: string
}

// ---------------------------------------------------------------------------
// First-class tags
// ---------------------------------------------------------------------------

export interface ResourceTag {
  key: string
  value: string
  source: 'aws_tag' | 'azure_tag' | 'gcp_label' | 'terraform' | 'manual'
}

/** Flattened key→value map derived from ResourceTag[], useful for quick lookup */
export type TagIndex = Record<string, string>

// ---------------------------------------------------------------------------
// Structured cost
// ---------------------------------------------------------------------------

export interface CostBreakdownItem {
  component: string
  monthlyUsd: number
}

export interface ResourceCost {
  /** Always normalised to USD / month */
  monthlyUsd: number
  /** Raw value from the provider pricing API before normalisation */
  rawAmount?: number
  rawCurrency?: string
  rawPeriod?: 'hourly' | 'daily' | 'monthly' | 'yearly'
  confidence: 'exact' | 'estimated' | 'unknown'
  breakdown?: CostBreakdownItem[]
  /** ISO-8601 timestamp of the last pricing refresh */
  lastUpdated: string
}

// ---------------------------------------------------------------------------
// Terraform reference
// ---------------------------------------------------------------------------

export interface TerraformRef {
  /** e.g. "aws_instance.web_server" */
  resourceAddress: string
  /** Path to the .tfstate file */
  statePath?: string
  workspaceName?: string
  /** e.g. "module.vpc" */
  modulePath?: string
}

// ---------------------------------------------------------------------------
// Typed metadata per resource type (discriminated union)
// ---------------------------------------------------------------------------

// --- AWS ---

export interface EC2Metadata {
  resourceType: 'ec2'
  instanceType: string
  amiId: string
  state: 'running' | 'stopped' | 'pending' | 'terminated' | 'stopping'
  privateIp?: string
  publicIp?: string
  keyName?: string
  vpcId?: string
  subnetId?: string
  securityGroups?: string[]
  iamInstanceProfile?: string
  platform?: 'linux' | 'windows'
  architecture?: 'x86_64' | 'arm64'
  tenancy?: 'default' | 'dedicated' | 'host'
}

export interface RDSMetadata {
  resourceType: 'rds'
  engine: string
  engineVersion: string
  instanceClass: string
  multiAz: boolean
  storageType?: 'gp2' | 'gp3' | 'io1' | 'io2' | 'standard'
  allocatedStorageGb?: number
  dbName?: string
  port?: number
  endpoint?: string
  vpcId?: string
  backupRetentionDays?: number
  deletionProtection?: boolean
  performanceInsightsEnabled?: boolean
}

export interface LambdaMetadata {
  resourceType: 'lambda'
  runtime: string
  handler: string
  memorySize: number
  timeoutSeconds: number
  codeSize?: number
  lastModified?: string
  layers?: string[]
  vpcId?: string
  subnetIds?: string[]
  environment?: Record<string, string>
  architectures?: Array<'x86_64' | 'arm64'>
  packageType?: 'Zip' | 'Image'
}

export interface S3Metadata {
  resourceType: 's3'
  bucketName: string
  region: string
  versioning: 'enabled' | 'suspended' | 'disabled'
  encryption?: 'AES256' | 'aws:kms' | 'none'
  publicAccess: boolean
  replicationEnabled: boolean
  lifecycleRulesCount?: number
  approximateSizeGb?: number
  objectCount?: number
}

export interface VpcMetadata {
  resourceType: 'vpc'
  cidrBlock: string
  isDefault: boolean
  enableDnsHostnames: boolean
  enableDnsSupport: boolean
  subnetIds?: string[]
  routeTableIds?: string[]
  internetGatewayId?: string
}

export interface SubnetMetadata {
  resourceType: 'subnet'
  cidrBlock: string
  availabilityZone: string
  availableIpCount?: number
  isPublic: boolean
  vpcId: string
  routeTableId?: string
}

export interface EKSMetadata {
  resourceType: 'eks'
  kubernetesVersion: string
  status: 'ACTIVE' | 'CREATING' | 'DELETING' | 'FAILED' | 'UPDATING'
  endpoint?: string
  roleArn?: string
  nodeGroups?: Array<{ name: string; instanceType: string; desiredSize: number }>
  addons?: string[]
  loggingEnabled?: boolean
  privateAccess?: boolean
  publicAccess?: boolean
}

export interface ECSMetadata {
  resourceType: 'ecs'
  launchType: 'FARGATE' | 'EC2' | 'EXTERNAL'
  status: 'ACTIVE' | 'INACTIVE' | 'DELETE_IN_PROGRESS'
  runningTasksCount: number
  pendingTasksCount?: number
  servicesCount?: number
  capacityProviders?: string[]
}

// --- Azure ---

export interface AKSMetadata {
  resourceType: 'aks'
  kubernetesVersion: string
  provisioningState: string
  nodeResourceGroup?: string
  networkPlugin?: 'kubenet' | 'azure' | 'none'
  nodePools?: Array<{ name: string; vmSize: string; count: number; mode: 'System' | 'User' }>
  enableRBAC?: boolean
  fqdn?: string
  oidcIssuerEnabled?: boolean
}

export interface CosmosDBMetadata {
  resourceType: 'cosmosdb'
  kind: 'GlobalDocumentDB' | 'MongoDB' | 'Parse'
  consistencyLevel: 'Strong' | 'BoundedStaleness' | 'Session' | 'ConsistentPrefix' | 'Eventual'
  enableMultipleWriteLocations: boolean
  enableFreeTier?: boolean
  backupPolicy?: 'Periodic' | 'Continuous'
  enableAnalyticalStorage?: boolean
  totalThroughputLimit?: number
  locations?: Array<{ locationName: string; failoverPriority: number }>
}

// --- GCP ---

export interface GKEMetadata {
  resourceType: 'gke'
  currentMasterVersion: string
  status: 'RUNNING' | 'PROVISIONING' | 'STOPPING' | 'ERROR' | 'RECONCILING' | 'DEGRADED'
  network?: string
  subnetwork?: string
  nodePools?: Array<{ name: string; machineType: string; nodeCount: number }>
  autopilot?: boolean
  privateCluster?: boolean
  releaseChannel?: 'RAPID' | 'REGULAR' | 'STABLE' | 'UNSPECIFIED'
  loggingService?: string
  monitoringService?: string
}

export interface BigQueryMetadata {
  resourceType: 'bigquery'
  location: string
  tableCount?: number
  totalBytesProcessed?: number
  defaultTableExpirationMs?: number
  labels?: Record<string, string>
  encryptionConfiguration?: { kmsKeyName: string }
  isCaseInsensitive?: boolean
}

/** Fallback for resource types that don't have a specific metadata shape */
export interface GenericMetadata {
  resourceType: 'generic'
  [key: string]: string | number | boolean | undefined
}

export type TypedMetadata =
  | EC2Metadata
  | RDSMetadata
  | LambdaMetadata
  | S3Metadata
  | VpcMetadata
  | SubnetMetadata
  | EKSMetadata
  | ECSMetadata
  | AKSMetadata
  | CosmosDBMetadata
  | GKEMetadata
  | BigQueryMetadata
  | GenericMetadata

// ---------------------------------------------------------------------------
// Fine-grained edge relation types (v2)
// ---------------------------------------------------------------------------

export type EdgeRelationType =
  // Network topology
  | 'vpc_contains'
  | 'subnet_contains'
  | 'security_group'
  | 'load_balance'
  | 'peering'
  // Data stores
  | 'db_connection'
  | 'cache_connection'
  | 'queue_publish'
  | 'queue_subscribe'
  | 'storage_read'
  | 'storage_write'
  | 'cdc_replication'
  | 'data_replication'
  // Compute / IAM
  | 'invokes'
  | 'depends_on'
  | 'iam_grants'
  // CDN / DNS
  | 'cdn_origin'
  | 'dns_failover'
  // Cross-cloud
  | 'cross_cloud_data'
  | 'cross_cloud_network'

// ---------------------------------------------------------------------------
// InfraNodeV2
// ---------------------------------------------------------------------------

export interface InfraNodeV2 {
  // --- v1 fields (kept identical for compatibility) ---
  id: string
  label: string
  provider: Provider
  type: string
  region: string
  parent?: string
  status: HealthStatus
  /** 1–10, drives node size in the 3D viewer */
  importance: number

  // --- extended category ---
  category: NodeCategoryV2

  // --- v2 additions ---
  accountId?: string
  resourceArn?: string

  /** Structured status with audit trail */
  statusDetail?: StatusDetail

  /** Rich, per-type metadata replaces the loose Record<string,string> */
  typedMetadata?: TypedMetadata
  /** Legacy flat metadata kept for backward compatibility */
  metadata: Record<string, string>

  tags?: ResourceTag[]
  /** Derived from tags for O(1) lookup */
  tagIndex?: TagIndex

  cost?: ResourceCost
  terraform?: TerraformRef

  /** ISO-8601 timestamp of when this node was discovered */
  discoveredAt?: string
  /** ISO-8601 timestamp of last update */
  updatedAt?: string
}

// ---------------------------------------------------------------------------
// InfraEdgeV2
// ---------------------------------------------------------------------------

export interface InfraEdgeV2 {
  id: string
  source: string
  target: string

  // v2: fine-grained relation type (superset of v1 edge types)
  relationType: EdgeRelationType

  /** Human-readable label, optional */
  label?: string

  /** Port / protocol detail, e.g. "5432/tcp" */
  port?: string
  protocol?: string

  /** Throughput or bandwidth annotation */
  bandwidthMbps?: number

  /** Whether the connection is encrypted in transit */
  encrypted?: boolean

  /** ISO-8601 timestamps */
  discoveredAt?: string
  updatedAt?: string
}

// ---------------------------------------------------------------------------
// Snapshot metadata
// ---------------------------------------------------------------------------

export interface SnapshotMeta {
  /** Unique identifier for this snapshot (UUID recommended) */
  snapshotId: string
  /** ISO-8601 timestamp of when the scan started */
  scannedAt: string
  /** Scanner tool version */
  scannerVersion: string
  providers: Provider[]
  regions: string[]
  /** Total wall-clock time for the scan in milliseconds */
  durationMs?: number
  /** Number of API calls made during scan */
  apiCallCount?: number
  /** Any non-fatal errors encountered during scan */
  warnings?: string[]
}

// ---------------------------------------------------------------------------
// InfraGraphV2
// ---------------------------------------------------------------------------

export interface InfraGraphV2 {
  /** Schema version — always "2" for this format */
  version: 2
  meta: SnapshotMeta
  nodes: InfraNodeV2[]
  edges: InfraEdgeV2[]
}
