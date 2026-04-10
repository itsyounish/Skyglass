export type Provider = 'aws' | 'azure' | 'gcp'

export type NodeCategory = 'compute' | 'database' | 'storage' | 'network' | 'serverless' | 'container' | 'cdn' | 'messaging' | 'analytics' | 'security' | 'ml' | 'iot' | 'devops' | 'management' | 'integration' | 'media' | 'migration'

export type HealthStatus = 'healthy' | 'warning' | 'error'

export interface InfraNode {
  id: string
  label: string
  provider: Provider
  type: string
  category: NodeCategory
  region: string
  parent?: string
  metadata: Record<string, string>
  status: HealthStatus
  importance: number // 1-10, affects node size
  account?: string   // AWS profile/account alias, Azure subscription name, GCP project
}

export interface InfraEdge {
  id: string
  source: string
  target: string
  type: 'network' | 'data' | 'dependency' | 'cross-cloud'
  label?: string
}

export interface InfraGraph {
  nodes: InfraNode[]
  edges: InfraEdge[]
}

export interface LayoutNode extends InfraNode {
  x: number
  y: number
  z: number
}

// ---------------------------------------------------------------------------
// Scanner configuration types (defined here to avoid importing cloud SDKs
// into the Vite bundle — the actual scanner modules are server-side only)
// ---------------------------------------------------------------------------

export interface AWSProviderConfig {
  type: 'aws'
  config: {
    region: string
    additionalRegions?: string[]
    profiles?: string[]   // Multiple AWS CLI profiles for multi-account scanning
  }
}

export interface AzureProviderConfig {
  type: 'azure'
  config: {
    subscriptionId: string
  }
}

export interface GCPProviderConfig {
  type: 'gcp'
  config: {
    projectId: string
  }
}

export type ProviderConfig = AWSProviderConfig | AzureProviderConfig | GCPProviderConfig

export interface ScanConfig {
  providers: ProviderConfig[]
}
