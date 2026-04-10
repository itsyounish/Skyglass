import type { InfraGraph, InfraEdge, ScanConfig } from '../types'
import { awsNodes, awsEdges } from './mock-aws'
import { azureNodes, azureEdges } from './mock-azure'
import { gcpNodes, gcpEdges } from './mock-gcp'

// ---------------------------------------------------------------------------
// Cross-cloud edges for the mock graph
// ---------------------------------------------------------------------------

const crossCloudEdges: InfraEdge[] = [
  { id: 'xc-1', source: 'aws-s3-datalake', target: 'gcp-gcs-raw', type: 'cross-cloud', label: 'S3->GCS replication (Storage Transfer)' },
  { id: 'xc-2', source: 'aws-lambda-etl', target: 'gcp-bq-warehouse', type: 'cross-cloud', label: 'cross-cloud analytics ETL' },
  { id: 'xc-3', source: 'aws-cf-dist', target: 'az-fd-prod', type: 'cross-cloud', label: 'DNS failover (Route53 health check)' },
  { id: 'xc-4', source: 'az-aks-be', target: 'gcp-pubsub-events', type: 'cross-cloud', label: 'cross-cloud event bridge' },
  { id: 'xc-5', source: 'az-cosmos-prod', target: 'aws-rds-primary', type: 'cross-cloud', label: 'CDC sync (Debezium)' },
  { id: 'xc-6', source: 'gcp-run-ml', target: 'aws-ec2-api-1', type: 'cross-cloud', label: 'ML inference callback' },
  { id: 'xc-7', source: 'aws-sagemaker-fraud', target: 'gcp-vertex-fraud', type: 'cross-cloud', label: 'model A/B comparison' },
  { id: 'xc-8', source: 'az-openai-prod', target: 'aws-bedrock-chatbot', type: 'cross-cloud', label: 'LLM failover' },
  { id: 'xc-9', source: 'az-iot-hub', target: 'aws-iot-fleet', type: 'cross-cloud', label: 'multi-cloud IoT bridge' },
  { id: 'xc-10', source: 'gcp-dataflow-etl', target: 'az-synapse-prod', type: 'cross-cloud', label: 'cross-cloud analytics' },
  { id: 'xc-11', source: 'aws-msk-events', target: 'gcp-pubsub-events', type: 'cross-cloud', label: 'Kafka-Pub/Sub bridge' },
  { id: 'xc-12', source: 'az-apim', target: 'gcp-apigee-org', type: 'cross-cloud', label: 'API federation' },
]

// ---------------------------------------------------------------------------
// Mock data graph (the dev-mode fallback)
// ---------------------------------------------------------------------------

function getMockGraph(): InfraGraph {
  return {
    nodes: [...awsNodes, ...azureNodes, ...gcpNodes],
    edges: [...awsEdges, ...azureEdges, ...gcpEdges, ...crossCloudEdges],
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Legacy synchronous accessor kept for backward compatibility with the
 * existing React app (which calls `getMultiCloudGraph()` inside a useMemo).
 * Always returns mock data.
 */
export function getMultiCloudGraph(): InfraGraph {
  return getMockGraph()
}

/**
 * Full infrastructure graph accessor.
 *
 * - If a `ScanConfig` is provided, attempts a real cloud scan via the
 *   scanner module (dynamic-imported so it never pollutes the Vite bundle).
 * - If the scan fails (missing credentials, network error, etc.) or no
 *   config is given, falls back to the hyper-realistic mock data.
 * - Always returns a valid `InfraGraph`.
 */
export async function getInfraGraph(config?: ScanConfig): Promise<InfraGraph> {
  if (config && config.providers.length > 0) {
    try {
      // Dynamic import via variable to prevent TypeScript from resolving
      // the scanner module at compile time. The scanner directory is excluded
      // from tsconfig.json because its cloud SDK dependencies are optional.
      const scannerPath = '../scanner/index'
      const scanner: { scanInfrastructure: (c: ScanConfig) => Promise<InfraGraph> } =
        await import(/* @vite-ignore */ scannerPath)
      const graph = await scanner.scanInfrastructure(config)

      if (graph.nodes.length > 0) {
        return graph
      }

      console.warn('[getInfraGraph] Scan returned 0 nodes. Falling back to mock data.')
    } catch (err: any) {
      console.warn(`[getInfraGraph] Real scan failed: ${err.message}`)
      console.warn('[getInfraGraph] Falling back to mock data.')
    }
  }

  return getMockGraph()
}
