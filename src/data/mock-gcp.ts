import type { InfraNode, InfraEdge } from '../types'

const PROJECT = 'acme-data-platform-prod'

export const gcpNodes: InfraNode[] = [
  // Network
  { id: 'gcp-vpc-data', label: 'vpc-data-platform', provider: 'gcp', type: 'vpc', category: 'network', region: 'us-central1',
    metadata: { selfLink: `projects/${PROJECT}/global/networks/vpc-data-platform`, mode: 'auto', subnets: '3', firewallRules: '8', routingMode: 'GLOBAL' },
    status: 'healthy', importance: 7 },
  { id: 'gcp-sub-services', label: 'snet-services-usc1', provider: 'gcp', type: 'subnet', category: 'network', region: 'us-central1', parent: 'gcp-vpc-data',
    metadata: { cidr: '10.128.0.0/20', privateGoogleAccess: 'enabled', flowLogs: 'enabled' },
    status: 'healthy', importance: 4 },

  // Container
  { id: 'gcp-run-ingest', label: 'ingestion-api', provider: 'gcp', type: 'cloud-run', category: 'container', region: 'us-central1', parent: 'gcp-sub-services',
    metadata: { selfLink: `projects/${PROJECT}/locations/us-central1/services/ingestion-api`, cpu: '2', memory: '1Gi', maxInstances: '100', concurrency: '80', revision: 'ingestion-api-00042-rev', traffic: '100% → latest', requestsPerSec: '1,200', cost: '$68.00/mo' },
    status: 'healthy', importance: 7 },
  { id: 'gcp-run-transform', label: 'transform-service', provider: 'gcp', type: 'cloud-run', category: 'container', region: 'us-central1', parent: 'gcp-sub-services',
    metadata: { selfLink: `projects/${PROJECT}/locations/us-central1/services/transform-service`, cpu: '4', memory: '4Gi', maxInstances: '50', concurrency: '20', revision: 'transform-service-00015-rev', cost: '$142.00/mo' },
    status: 'healthy', importance: 7 },
  { id: 'gcp-run-ml', label: 'ml-serving-api', provider: 'gcp', type: 'cloud-run', category: 'container', region: 'us-central1', parent: 'gcp-sub-services',
    metadata: { selfLink: `projects/${PROJECT}/locations/us-central1/services/ml-serving-api`, cpu: '4', memory: '8Gi', gpu: 'nvidia-l4', maxInstances: '10', p95Latency: '180ms', cost: '$420.00/mo' },
    status: 'healthy', importance: 8 },

  // Analytics
  { id: 'gcp-bq-warehouse', label: 'bq-acme-warehouse', provider: 'gcp', type: 'bigquery', category: 'analytics', region: 'us-central1',
    metadata: { project: PROJECT, datasets: '8', tables: '142', views: '37', storedBytes: '2.1 TB', activeBytes: '890 GB', queryCostLast30d: '$210.00', slotsUsed: '2,400/4,000', cost: '$210.00/mo' },
    status: 'healthy', importance: 10 },

  // Storage
  { id: 'gcp-gcs-raw', label: 'acme-raw-data-prod', provider: 'gcp', type: 'gcs', category: 'storage', region: 'us-central1',
    metadata: { selfLink: `b/acme-raw-data-prod`, storageClass: 'STANDARD', location: 'US-CENTRAL1', size: '3.4 TB', objects: '8.2M', versioning: 'enabled', lifecycle: '180d → NEARLINE → 365d → COLDLINE', cost: '$70.00/mo' },
    status: 'healthy', importance: 8 },
  { id: 'gcp-gcs-ml', label: 'acme-ml-artifacts', provider: 'gcp', type: 'gcs', category: 'storage', region: 'us-central1',
    metadata: { selfLink: `b/acme-ml-artifacts`, storageClass: 'NEARLINE', size: '890 GB', objects: '24K', cost: '$9.00/mo' },
    status: 'healthy', importance: 5 },

  // Messaging
  { id: 'gcp-pubsub-events', label: 'topic-ingest-events', provider: 'gcp', type: 'pubsub', category: 'messaging', region: 'us-central1',
    metadata: { selfLink: `projects/${PROJECT}/topics/ingest-events`, subscriptions: '3', publishRate: '15K msg/s', ackDeadline: '30s', retentionDuration: '7d', cost: '$48.00/mo' },
    status: 'healthy', importance: 8 },
  { id: 'gcp-pubsub-dlq', label: 'topic-dead-letter', provider: 'gcp', type: 'pubsub', category: 'messaging', region: 'us-central1',
    metadata: { selfLink: `projects/${PROJECT}/topics/dead-letter`, subscriptions: '1', messageCount: '1,247', oldestMessage: '2d ago' },
    status: 'warning', importance: 5 },

  // CDN
  { id: 'gcp-cdn-api', label: 'cloud-cdn-api-lb', provider: 'gcp', type: 'cdn', category: 'cdn', region: 'us-central1',
    metadata: { backendService: 'bs-ingestion-api', cacheHitRate: '94.2%', sslPolicy: 'TLS 1.3', cost: '$45.00/mo' },
    status: 'healthy', importance: 5 },

  // Database — Cloud SQL
  { id: 'gcp-cloudsql-primary', label: 'SQL: acme-postgres-prod', provider: 'gcp', type: 'cloud-sql', category: 'database', region: 'us-central1', parent: 'gcp-sub-services',
    metadata: { resourcePath: `projects/${PROJECT}/instances/acme-postgres-prod`, name: 'acme-postgres-prod', databaseVersion: 'POSTGRES_15', tier: 'db-custom-4-16384', state: 'RUNNABLE', ipAddress: '10.128.0.50', storageSize: '100 GB', backupEnabled: 'true', availabilityType: 'REGIONAL', connectionName: `${PROJECT}:us-central1:acme-postgres-prod`, cost: '$195.00/mo' },
    status: 'healthy', importance: 8 },

  // Serverless — Cloud Function
  { id: 'gcp-gcf-data-validator', label: 'Fn: data-validator', provider: 'gcp', type: 'cloud-function', category: 'serverless', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/functions/data-validator`, name: 'data-validator', state: 'ACTIVE', runtime: 'nodejs20', entryPoint: 'validatePayload', environment: 'GEN_2', availableMemory: '512Mi', timeoutSeconds: '60', maxInstanceCount: '50', ingressSettings: 'ALLOW_INTERNAL_ONLY', cost: '$12.00/mo' },
    status: 'healthy', importance: 6 },

  // Database — Memorystore Redis
  { id: 'gcp-redis-session-cache', label: 'Redis: session-cache', provider: 'gcp', type: 'memorystore-redis', category: 'database', region: 'us-central1', parent: 'gcp-sub-services',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/instances/session-cache`, name: 'session-cache', state: 'READY', tier: 'STANDARD_HA', memorySizeGb: '5', redisVersion: 'REDIS_7_0', host: '10.128.0.80', port: '6379', displayName: 'Session Cache', connectMode: 'PRIVATE_SERVICE_ACCESS', cost: '$175.00/mo' },
    status: 'healthy', importance: 7 },

  // Network — Cloud DNS
  { id: 'gcp-dns-acme-prod', label: 'DNS: acme-platform.io', provider: 'gcp', type: 'cloud-dns', category: 'network', region: 'global',
    metadata: { resourcePath: `projects/${PROJECT}/managedZones/acme-prod-zone`, name: 'acme-prod-zone', dnsName: 'acme-platform.io.', visibility: 'public', description: 'Production DNS zone', nameServers: 'ns-cloud-a1.googledomains.com, ns-cloud-a2.googledomains.com', cost: '$0.50/mo' },
    status: 'healthy', importance: 6 },

  // Database — Firestore
  { id: 'gcp-firestore-user-prefs', label: 'Firestore: user-preferences', provider: 'gcp', type: 'firestore', category: 'database', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/databases/(default)/documents/user-preferences`, collectionId: 'user-preferences', projectId: PROJECT, documents: '~450K', cost: '$22.00/mo' },
    status: 'healthy', importance: 7 },

  // Messaging — Cloud Tasks
  { id: 'gcp-tasks-email-queue', label: 'Tasks: email-dispatch', provider: 'gcp', type: 'cloud-tasks', category: 'messaging', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/queues/email-dispatch`, name: 'email-dispatch', state: 'RUNNING', rateLimits: '50', retryMaxAttempts: '5', retryMinBackoff: '10', retryMaxBackoff: '300', cost: '$3.00/mo' },
    status: 'healthy', importance: 6 },

  // Security — Cloud Armor
  { id: 'gcp-armor-api-policy', label: 'Armor: api-waf-policy', provider: 'gcp', type: 'cloud-armor', category: 'security', region: 'global',
    metadata: { resourcePath: `projects/${PROJECT}/global/securityPolicies/api-waf-policy`, name: 'api-waf-policy', type: 'CLOUD_ARMOR', rules: '12', adaptiveProtection: 'enabled', description: 'WAF policy for API endpoints' },
    status: 'healthy', importance: 7 },

  // Serverless — Cloud Scheduler
  { id: 'gcp-scheduler-daily-export', label: 'Cron: daily-bq-export', provider: 'gcp', type: 'cloud-scheduler', category: 'serverless', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/jobs/daily-bq-export`, name: 'daily-bq-export', state: 'ENABLED', schedule: '0 2 * * *', timezone: 'America/Chicago', targetType: 'HTTP', targetUri: `https://transform-service-xxx.run.app/export`, cost: '$0.10/mo' },
    status: 'healthy', importance: 5 },

  // ML — Vertex AI Endpoint
  { id: 'gcp-vertex-fraud', label: 'VertexAI: fraud-scorer-v2', provider: 'gcp', type: 'vertex-ai-endpoint', category: 'ml', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/endpoints/fraud-scorer-v2`, name: 'fraud-scorer-v2', displayName: 'Fraud Detection Model v2', deployedModels: '1', machineType: 'n1-standard-4', minReplicas: '2', maxReplicas: '8', p99Latency: '35ms', cost: '$340.00/mo' },
    status: 'healthy', importance: 8 },

  // ML — Vertex AI Notebook
  { id: 'gcp-vertex-notebook', label: 'Notebook: ds-team-workbench', provider: 'gcp', type: 'vertex-ai-notebook', category: 'ml', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/instances/ds-team-workbench`, name: 'ds-team-workbench', state: 'ACTIVE', machineType: 'n1-standard-8', acceleratorType: 'NVIDIA_TESLA_T4', framework: 'PyTorch 2.2', cost: '$280.00/mo' },
    status: 'healthy', importance: 6 },

  // ML — Dialogflow CX
  { id: 'gcp-dialogflow-support', label: 'DFCX: customer-support-bot', provider: 'gcp', type: 'dialogflow', category: 'ml', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/agents/customer-support-bot`, name: 'customer-support-bot', displayName: 'Customer Support Bot', defaultLanguageCode: 'en', flows: '8', intents: '124', sessions: '45K/mo', cost: '$52.00/mo' },
    status: 'healthy', importance: 6 },

  // DevOps — Cloud Build
  { id: 'gcp-build-trigger', label: 'Build: api-deploy-trigger', provider: 'gcp', type: 'cloud-build', category: 'devops', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/triggers/api-deploy-trigger`, name: 'api-deploy-trigger', triggerType: 'PUSH', repoSource: 'github.com/acme/api', branch: 'main', buildsLast30d: '142', avgDuration: '4m 30s', cost: '$18.00/mo' },
    status: 'healthy', importance: 6 },

  // DevOps — Cloud Deploy
  { id: 'gcp-deploy-pipeline', label: 'Deploy: api-prod-pipeline', provider: 'gcp', type: 'cloud-deploy', category: 'devops', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/deliveryPipelines/api-prod-pipeline`, name: 'api-prod-pipeline', stages: 'staging, canary, prod', lastRelease: '2026-03-28T10:00:00Z', targets: '3' },
    status: 'healthy', importance: 6 },

  // DevOps — Cloud Monitoring
  { id: 'gcp-monitoring-alerts', label: 'Monitoring: critical-alerts', provider: 'gcp', type: 'cloud-monitoring', category: 'devops', region: 'global',
    metadata: { projectId: PROJECT, alertPolicies: '18', notificationChannels: '4', uptimeChecks: '6', dashboards: '8', cost: '$35.00/mo' },
    status: 'healthy', importance: 6 },

  // Management — Organization
  { id: 'gcp-org-acme', label: 'Org: acme-corp', provider: 'gcp', type: 'organization', category: 'management', region: 'global',
    metadata: { organizationId: '123456789012', displayName: 'acme-corp', directoryCustomerId: 'C01234567', projects: '12', folders: '4' },
    status: 'healthy', importance: 6 },

  // Management — Billing Budget
  { id: 'gcp-budget-prod', label: 'Budget: prod-monthly', provider: 'gcp', type: 'billing-budget', category: 'management', region: 'global',
    metadata: { budgetName: 'prod-monthly', amount: '$5,000', currentSpend: '$3,842', percentUsed: '76.8%', alertThresholds: '50%, 80%, 100%' },
    status: 'healthy', importance: 5 },

  // Integration — Apigee
  { id: 'gcp-apigee-org', label: 'Apigee: acme-api-platform', provider: 'gcp', type: 'apigee', category: 'integration', region: 'us-central1',
    metadata: { orgName: 'acme-api-platform', environments: 'dev, staging, prod', apiProxies: '24', developers: '150', apps: '45', traffic: '8M calls/mo', cost: '$1,200.00/mo' },
    status: 'healthy', importance: 7 },

  // Integration — Workflows
  { id: 'gcp-workflows-order', label: 'Workflow: order-fulfillment', provider: 'gcp', type: 'workflows', category: 'integration', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/workflows/order-fulfillment`, name: 'order-fulfillment', state: 'ACTIVE', revision: '8', executionsLast30d: '12,500', cost: '$4.00/mo' },
    status: 'healthy', importance: 5 },

  // Security — Secret Manager
  { id: 'gcp-secret-db', label: 'Secret: prod-db-password', provider: 'gcp', type: 'secret-manager', category: 'security', region: 'global',
    metadata: { resourcePath: `projects/${PROJECT}/secrets/prod-db-password`, name: 'prod-db-password', replication: 'automatic', versions: '3', rotation: 'enabled', lastAccess: '2026-03-28T12:00:00Z' },
    status: 'healthy', importance: 7 },

  // Security — KMS
  { id: 'gcp-kms-data', label: 'KMS: data-encryption-ring', provider: 'gcp', type: 'kms', category: 'security', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/keyRings/data-encryption-ring`, name: 'data-encryption-ring', keys: '4', purpose: 'ENCRYPT_DECRYPT', protectionLevel: 'SOFTWARE' },
    status: 'healthy', importance: 6 },

  // Security — IAM Service Account
  { id: 'gcp-sa-app', label: 'SA: app-workload-sa', provider: 'gcp', type: 'iam-service-account', category: 'security', region: 'global',
    metadata: { email: 'app-workload-sa@acme-data-platform-prod.iam.gserviceaccount.com', displayName: 'App Workload SA', roles: 'roles/cloudsql.client, roles/storage.objectViewer', keyCount: '0 (Workload Identity)' },
    status: 'healthy', importance: 5 },

  // Analytics — Dataflow
  { id: 'gcp-dataflow-etl', label: 'Dataflow: streaming-etl-prod', provider: 'gcp', type: 'dataflow', category: 'analytics', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/jobs/streaming-etl-prod`, name: 'streaming-etl-prod', state: 'JOB_STATE_RUNNING', type: 'JOB_TYPE_STREAMING', currentWorkers: '4', maxWorkers: '10', inputRate: '25K msg/s', cost: '$320.00/mo' },
    status: 'healthy', importance: 8 },

  // Analytics — Dataproc
  { id: 'gcp-dataproc-spark', label: 'Dataproc: spark-analytics', provider: 'gcp', type: 'dataproc', category: 'analytics', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/regions/us-central1/clusters/spark-analytics`, clusterName: 'spark-analytics', status: 'RUNNING', masterConfig: 'n2-standard-4', workerConfig: '4x n2-standard-8', sparkVersion: '3.5', cost: '$480.00/mo' },
    status: 'healthy', importance: 7 },

  // Analytics — Composer (Airflow)
  { id: 'gcp-composer-dags', label: 'Composer: data-orchestrator', provider: 'gcp', type: 'composer', category: 'analytics', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/environments/data-orchestrator`, name: 'data-orchestrator', state: 'RUNNING', airflowVersion: '2.7.3', environmentSize: 'MEDIUM', dags: '28', dagRuns24h: '145', cost: '$420.00/mo' },
    status: 'healthy', importance: 7 },

  // Container — GKE
  { id: 'gcp-gke-platform', label: 'GKE: platform-prod', provider: 'gcp', type: 'gke', category: 'container', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/clusters/platform-prod`, name: 'platform-prod', status: 'RUNNING', currentMasterVersion: '1.30.2-gke.1500', nodeCount: '9', network: 'vpc-data-platform', autopilot: 'false', releaseChannel: 'REGULAR', cost: '$650.00/mo' },
    status: 'healthy', importance: 9 },

  // Network — Load Balancer
  { id: 'gcp-lb-global', label: 'LB: global-https-lb', provider: 'gcp', type: 'load-balancer-forwarding', category: 'network', region: 'global',
    metadata: { name: 'global-https-lb', target: 'target-https-proxy-prod', ipAddress: '34.120.x.x', portRange: '443', loadBalancingScheme: 'EXTERNAL_MANAGED', cost: '$18.00/mo' },
    status: 'healthy', importance: 7 },

  // Network — Cloud Interconnect
  { id: 'gcp-interconnect-dc', label: 'Interconnect: equinix-dc', provider: 'gcp', type: 'cloud-interconnect', category: 'network', region: 'us-central1',
    metadata: { name: 'equinix-dc', interconnectType: 'DEDICATED', linkType: 'LINK_TYPE_ETHERNET_10G_LR', state: 'ACTIVE', location: 'ord-zone1-1', cost: '$1,700.00/mo' },
    status: 'healthy', importance: 7 },

  // Network — Cloud VPN
  { id: 'gcp-vpn-office', label: 'VPN: office-tunnel', provider: 'gcp', type: 'cloud-vpn', category: 'network', region: 'us-central1',
    metadata: { name: 'office-vpn-gw', tunnelCount: '2', status: 'ESTABLISHED', peerIp: '203.0.113.1', ikeVersion: '2', cost: '$36.00/mo' },
    status: 'healthy', importance: 5 },

  // Storage — Filestore
  { id: 'gcp-filestore-shared', label: 'Filestore: shared-nfs', provider: 'gcp', type: 'filestore', category: 'storage', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/instances/shared-nfs`, name: 'shared-nfs', tier: 'BASIC_HDD', capacityGb: '1024', state: 'READY', network: 'vpc-data-platform', fileShares: '/data', cost: '$204.00/mo' },
    status: 'healthy', importance: 5 },

  // Database — AlloyDB
  { id: 'gcp-alloydb-analytics', label: 'AlloyDB: analytics-cluster', provider: 'gcp', type: 'alloydb', category: 'database', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/clusters/analytics-cluster`, clusterName: 'analytics-cluster', databaseVersion: 'POSTGRES_15', primaryInstance: '4 vCPU, 32 GB', readPool: '2 replicas', state: 'READY', cost: '$680.00/mo' },
    status: 'healthy', importance: 8 },

  // Database — Bigtable
  { id: 'gcp-bigtable-timeseries', label: 'Bigtable: ts-metrics', provider: 'gcp', type: 'bigtable', category: 'database', region: 'us-central1',
    metadata: { instanceId: 'ts-metrics', displayName: 'Time Series Metrics', clusterCount: '2', nodes: '3', storageType: 'SSD', tables: '12', approximateSize: '2.4 TB', cost: '$1,100.00/mo' },
    status: 'healthy', importance: 8 },

  // Media — Transcoder
  { id: 'gcp-transcoder-media', label: 'Transcoder: video-pipeline', provider: 'gcp', type: 'transcoder', category: 'media', region: 'us-central1',
    metadata: { jobTemplate: 'hd-to-multi-format', preset: 'web', jobsProcessed: '2,400/mo', avgDuration: '45s', cost: '$120.00/mo' },
    status: 'healthy', importance: 5 },

  // Migration — Migrate for Compute
  { id: 'gcp-migrate-vms', label: 'Migrate: dc-to-gcp', provider: 'gcp', type: 'migrate-for-compute', category: 'migration', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/sources/dc-to-gcp`, name: 'dc-to-gcp', sourceType: 'vmware', vmsDiscovered: '45', vmsMigrating: '8', vmsCompleted: '32', cost: '$0 (free)' },
    status: 'healthy', importance: 5 },

  // Messaging — Eventarc
  { id: 'gcp-eventarc-triggers', label: 'Eventarc: order-triggers', provider: 'gcp', type: 'eventarc', category: 'messaging', region: 'us-central1',
    metadata: { resourcePath: `projects/${PROJECT}/locations/us-central1/triggers/order-triggers`, name: 'order-triggers', destination: 'gcp-run-transform', eventFilter: 'google.cloud.pubsub.topic.v1.messagePublished', transport: 'Pub/Sub' },
    status: 'healthy', importance: 5 },

  // Serverless — App Engine
  { id: 'gcp-appengine-legacy', label: 'GAE: legacy-web-app', provider: 'gcp', type: 'app-engine', category: 'serverless', region: 'us-central1',
    metadata: { projectId: PROJECT, locationId: 'us-central', servingStatus: 'SERVING', defaultHostname: 'acme-data-platform-prod.appspot.com', services: '2', versions: '5', instances: '3', cost: '$45.00/mo' },
    status: 'healthy', importance: 5 },
]

export const gcpEdges: InfraEdge[] = [
  // Existing edges
  { id: 'ge-1', source: 'gcp-cdn-api', target: 'gcp-run-ingest', type: 'network', label: 'HTTPS LB' },
  { id: 'ge-2', source: 'gcp-run-ingest', target: 'gcp-pubsub-events', type: 'data', label: 'publish events' },
  { id: 'ge-3', source: 'gcp-pubsub-events', target: 'gcp-run-transform', type: 'data', label: 'push subscription' },
  { id: 'ge-4', source: 'gcp-run-transform', target: 'gcp-bq-warehouse', type: 'data', label: 'streaming insert' },
  { id: 'ge-5', source: 'gcp-run-ingest', target: 'gcp-gcs-raw', type: 'data', label: 'raw data store' },
  { id: 'ge-6', source: 'gcp-bq-warehouse', target: 'gcp-gcs-ml', type: 'data', label: 'ML export' },
  { id: 'ge-7', source: 'gcp-gcs-ml', target: 'gcp-run-ml', type: 'data', label: 'model artifacts' },
  { id: 'ge-8', source: 'gcp-run-ml', target: 'gcp-bq-warehouse', type: 'data', label: 'predictions store' },
  { id: 'ge-9', source: 'gcp-pubsub-events', target: 'gcp-pubsub-dlq', type: 'dependency', label: 'dead letter routing' },

  // New edges for descriptor-based services
  // Cloud SQL: ingestion API writes to PostgreSQL, transform service reads from it
  { id: 'ge-10', source: 'gcp-run-ingest', target: 'gcp-cloudsql-primary', type: 'data', label: 'metadata write' },
  { id: 'ge-11', source: 'gcp-run-transform', target: 'gcp-cloudsql-primary', type: 'data', label: 'lookup queries' },

  // Cloud Function: validates data from Pub/Sub before transform
  { id: 'ge-12', source: 'gcp-pubsub-events', target: 'gcp-gcf-data-validator', type: 'data', label: 'validation trigger' },
  { id: 'ge-13', source: 'gcp-gcf-data-validator', target: 'gcp-run-transform', type: 'data', label: 'validated events' },

  // Redis: ingestion API uses session cache
  { id: 'ge-14', source: 'gcp-run-ingest', target: 'gcp-redis-session-cache', type: 'data', label: 'session/rate cache' },
  { id: 'ge-15', source: 'gcp-run-ml', target: 'gcp-redis-session-cache', type: 'data', label: 'model cache' },

  // Cloud DNS: resolves to the CDN load balancer
  { id: 'ge-16', source: 'gcp-dns-acme-prod', target: 'gcp-cdn-api', type: 'network', label: 'DNS A record' },

  // Firestore: ML serving API stores user preferences
  { id: 'ge-17', source: 'gcp-run-ml', target: 'gcp-firestore-user-prefs', type: 'data', label: 'user context' },

  // Cloud Tasks: ingestion API queues email dispatch tasks
  { id: 'ge-18', source: 'gcp-run-ingest', target: 'gcp-tasks-email-queue', type: 'data', label: 'enqueue notification' },
  { id: 'ge-19', source: 'gcp-tasks-email-queue', target: 'gcp-gcf-data-validator', type: 'data', label: 'task dispatch' },

  // Cloud Armor: protects the CDN/LB
  { id: 'ge-20', source: 'gcp-armor-api-policy', target: 'gcp-cdn-api', type: 'dependency', label: 'WAF protection' },

  // Cloud Scheduler: triggers the transform service for daily exports
  { id: 'ge-21', source: 'gcp-scheduler-daily-export', target: 'gcp-run-transform', type: 'dependency', label: 'cron trigger' },

  // ML edges
  { id: 'ge-22', source: 'gcp-run-ml', target: 'gcp-vertex-fraud', type: 'dependency', label: 'model prediction' },
  { id: 'ge-23', source: 'gcp-vertex-notebook', target: 'gcp-bq-warehouse', type: 'data', label: 'training data' },
  { id: 'ge-24', source: 'gcp-vertex-notebook', target: 'gcp-gcs-ml', type: 'data', label: 'model save' },
  { id: 'ge-25', source: 'gcp-dialogflow-support', target: 'gcp-run-ingest', type: 'dependency', label: 'fulfillment webhook' },

  // DevOps edges
  { id: 'ge-26', source: 'gcp-build-trigger', target: 'gcp-run-ingest', type: 'dependency', label: 'deploy' },
  { id: 'ge-27', source: 'gcp-deploy-pipeline', target: 'gcp-run-transform', type: 'dependency', label: 'rollout' },
  { id: 'ge-28', source: 'gcp-deploy-pipeline', target: 'gcp-gke-platform', type: 'dependency', label: 'k8s deploy' },

  // Analytics edges
  { id: 'ge-29', source: 'gcp-dataflow-etl', target: 'gcp-pubsub-events', type: 'data', label: 'stream source' },
  { id: 'ge-30', source: 'gcp-dataflow-etl', target: 'gcp-bq-warehouse', type: 'data', label: 'write results' },
  { id: 'ge-31', source: 'gcp-dataproc-spark', target: 'gcp-gcs-raw', type: 'data', label: 'batch read' },
  { id: 'ge-32', source: 'gcp-dataproc-spark', target: 'gcp-bq-warehouse', type: 'data', label: 'aggregations' },
  { id: 'ge-33', source: 'gcp-composer-dags', target: 'gcp-dataflow-etl', type: 'dependency', label: 'orchestrate' },
  { id: 'ge-34', source: 'gcp-composer-dags', target: 'gcp-dataproc-spark', type: 'dependency', label: 'orchestrate' },

  // Security edges
  { id: 'ge-35', source: 'gcp-run-ingest', target: 'gcp-secret-db', type: 'dependency', label: 'secret access' },
  { id: 'ge-36', source: 'gcp-kms-data', target: 'gcp-gcs-raw', type: 'dependency', label: 'CMEK encryption' },
  { id: 'ge-37', source: 'gcp-sa-app', target: 'gcp-run-ingest', type: 'dependency', label: 'workload identity' },
  { id: 'ge-38', source: 'gcp-sa-app', target: 'gcp-cloudsql-primary', type: 'dependency', label: 'DB access' },

  // Container edges
  { id: 'ge-39', source: 'gcp-gke-platform', target: 'gcp-cloudsql-primary', type: 'data', label: 'k8s workloads' },
  { id: 'ge-40', source: 'gcp-gke-platform', target: 'gcp-redis-session-cache', type: 'data', label: 'cache access' },

  // Integration edges
  { id: 'ge-41', source: 'gcp-apigee-org', target: 'gcp-run-ingest', type: 'network', label: 'API proxy' },
  { id: 'ge-42', source: 'gcp-workflows-order', target: 'gcp-run-transform', type: 'dependency', label: 'step: transform' },
  { id: 'ge-43', source: 'gcp-workflows-order', target: 'gcp-pubsub-events', type: 'data', label: 'step: notify' },

  // Network edges
  { id: 'ge-44', source: 'gcp-lb-global', target: 'gcp-run-ingest', type: 'network', label: 'HTTPS proxy' },
  { id: 'ge-45', source: 'gcp-interconnect-dc', target: 'gcp-vpc-data', type: 'network', label: 'hybrid link' },
  { id: 'ge-46', source: 'gcp-vpn-office', target: 'gcp-vpc-data', type: 'network', label: 'site-to-site' },

  // Database edges
  { id: 'ge-47', source: 'gcp-alloydb-analytics', target: 'gcp-bq-warehouse', type: 'data', label: 'federated query' },
  { id: 'ge-48', source: 'gcp-run-ingest', target: 'gcp-bigtable-timeseries', type: 'data', label: 'time series write' },

  // Messaging edges
  { id: 'ge-49', source: 'gcp-eventarc-triggers', target: 'gcp-run-transform', type: 'dependency', label: 'event trigger' },
]
