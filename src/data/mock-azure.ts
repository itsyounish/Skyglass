import type { InfraNode, InfraEdge } from '../types'

const SUB = '3a7b9c12-4d5e-6f78-9012-abcdef345678'
const RG = 'rg-prod-westeurope'

export const azureNodes: InfraNode[] = [
  // Network
  { id: 'az-vnet-prod', label: 'vnet-prod-weu', provider: 'azure', type: 'vnet', category: 'network', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Network/virtualNetworks/vnet-prod-weu`, addressSpace: '172.16.0.0/16', subnets: '4', peerings: '1', dnsServers: 'Azure-provided' },
    status: 'healthy', importance: 8 },
  { id: 'az-sub-aks', label: 'snet-aks-nodes', provider: 'azure', type: 'subnet', category: 'network', region: 'westeurope', parent: 'az-vnet-prod',
    metadata: { cidr: '172.16.0.0/20', delegations: 'none', nsg: 'nsg-aks-nodes', serviceEndpoints: 'Microsoft.Sql, Microsoft.Storage' },
    status: 'healthy', importance: 5 },
  { id: 'az-sub-db', label: 'snet-databases', provider: 'azure', type: 'subnet', category: 'network', region: 'westeurope', parent: 'az-vnet-prod',
    metadata: { cidr: '172.16.16.0/24', delegations: 'none', nsg: 'nsg-databases', privateEndpoints: '3' },
    status: 'healthy', importance: 5 },

  // Container
  { id: 'az-aks-prod', label: 'aks-prod-weu', provider: 'azure', type: 'aks', category: 'container', region: 'westeurope', parent: 'az-sub-aks',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.ContainerService/managedClusters/aks-prod-weu`, k8sVersion: '1.30.2', nodePool: 'system:3×D4s_v5, workload:6×D8s_v5', powerState: 'Running', networkPlugin: 'azure', rbac: 'enabled', cost: '$1,240.00/mo' },
    status: 'healthy', importance: 10 },
  { id: 'az-aks-fe', label: 'frontend-deploy', provider: 'azure', type: 'deployment', category: 'container', region: 'westeurope', parent: 'az-aks-prod',
    metadata: { replicas: '3/3', image: 'acmecr.azurecr.io/frontend:2.8.1', cpu: '500m', memory: '512Mi', restarts: '0', age: '14d' },
    status: 'healthy', importance: 6 },
  { id: 'az-aks-be', label: 'backend-deploy', provider: 'azure', type: 'deployment', category: 'container', region: 'westeurope', parent: 'az-aks-prod',
    metadata: { replicas: '4/4', image: 'acmecr.azurecr.io/backend:3.2.0', cpu: '1000m', memory: '1Gi', restarts: '2', age: '7d' },
    status: 'healthy', importance: 7 },
  { id: 'az-aks-worker', label: 'worker-deploy', provider: 'azure', type: 'deployment', category: 'container', region: 'westeurope', parent: 'az-aks-prod',
    metadata: { replicas: '2/2', image: 'acmecr.azurecr.io/worker:1.5.3', cpu: '2000m', memory: '2Gi', restarts: '0', age: '7d' },
    status: 'healthy', importance: 5 },

  // Database
  { id: 'az-cosmos-prod', label: 'cosmos-sessions-prod', provider: 'azure', type: 'cosmosdb', category: 'database', region: 'westeurope', parent: 'az-sub-db',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-sessions-prod`, api: 'MongoDB v4.2', consistency: 'Session', provisionedRU: '4,000 RU/s', regions: 'West Europe, North Europe', size: '128 GB', cost: '$292.00/mo', privateEndpoint: 'enabled' },
    status: 'healthy', importance: 9 },

  // Serverless
  { id: 'az-func-events', label: 'func-event-processor', provider: 'azure', type: 'function-app', category: 'serverless', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Web/sites/func-event-processor`, runtime: '.NET 8 (isolated)', plan: 'Consumption', executions: '1.2M/mo', avgDuration: '230ms', cost: '$24.00/mo' },
    status: 'healthy', importance: 6 },
  { id: 'az-func-notif', label: 'func-notification-sender', provider: 'azure', type: 'function-app', category: 'serverless', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Web/sites/func-notification-sender`, runtime: 'Node.js 20', plan: 'Consumption', executions: '450K/mo', failureRate: '2.8%', cost: '$8.00/mo' },
    status: 'warning', importance: 4 },

  // Storage
  { id: 'az-blob-prod', label: 'stacmeprodweu', provider: 'azure', type: 'storage-account', category: 'storage', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Storage/storageAccounts/stacmeprodweu`, kind: 'StorageV2', tier: 'Hot', replication: 'GRS', size: '1.8 TB', containers: '12', cost: '$42.00/mo', privateEndpoint: 'enabled' },
    status: 'healthy', importance: 6 },

  // CDN
  { id: 'az-fd-prod', label: 'fd-acme-prod', provider: 'azure', type: 'front-door', category: 'cdn', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Cdn/profiles/fd-acme-prod`, sku: 'Premium_AzureFrontDoor', backends: 'aks-prod-weu, stacmeprodweu', wafPolicy: 'waf-acme-prod (Prevention)', customDomains: 'app.acme.com, api.acme.com', cost: '$95.00/mo' },
    status: 'healthy', importance: 7 },

  // SQL Database
  { id: 'az-sql-acme-prod', label: 'SQL: sql-acme-prod', provider: 'azure', type: 'sql-server', category: 'database', region: 'westeurope', parent: 'az-sub-db',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Sql/servers/sql-acme-prod`, fullyQualifiedDomainName: 'sql-acme-prod.database.windows.net', administratorLogin: 'sqladmin', version: '12.0', state: 'Ready', publicNetworkAccess: 'Disabled', minimalTlsVersion: '1.2' },
    status: 'healthy', importance: 8 },
  { id: 'az-sqldb-orders', label: 'SQLDb: orders', provider: 'azure', type: 'sql-database', category: 'database', region: 'westeurope', parent: 'az-sql-acme-prod',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Sql/servers/sql-acme-prod/databases/orders`, sku: 'GP_S_Gen5_2', maxSizeGb: '32', status: 'Online', zoneRedundant: 'true', backupStorageRedundancy: 'Geo', cost: '$185.00/mo' },
    status: 'healthy', importance: 7 },

  // Redis Cache
  { id: 'az-redis-acme', label: 'Redis: redis-acme-prod', provider: 'azure', type: 'redis', category: 'database', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Cache/Redis/redis-acme-prod`, hostName: 'redis-acme-prod.redis.cache.windows.net', port: '6380', sslPort: '6380', sku: 'Premium P1', redisVersion: '6.0', provisioningState: 'Succeeded', publicNetworkAccess: 'Disabled', enableNonSslPort: 'false', minimumTlsVersion: '1.2', cost: '$228.00/mo' },
    status: 'healthy', importance: 7 },

  // Service Bus
  { id: 'az-sb-acme', label: 'ServiceBus: sb-acme-prod', provider: 'azure', type: 'servicebus', category: 'messaging', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.ServiceBus/namespaces/sb-acme-prod`, sku: 'Standard (Standard)', provisioningState: 'Succeeded', serviceBusEndpoint: 'https://sb-acme-prod.servicebus.windows.net:443/', status: 'Active', zoneRedundant: 'false', queues: '4', topics: '2', cost: '$9.81/mo' },
    status: 'healthy', importance: 7 },

  // Event Hubs
  { id: 'az-eh-acme', label: 'EventHub: eh-acme-telemetry', provider: 'azure', type: 'eventhub', category: 'messaging', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.EventHub/namespaces/eh-acme-telemetry`, sku: 'Standard (capacity: 2)', provisioningState: 'Succeeded', serviceBusEndpoint: 'https://eh-acme-telemetry.servicebus.windows.net:443/', status: 'Active', kafkaEnabled: 'true', isAutoInflateEnabled: 'true', maximumThroughputUnits: '10', zoneRedundant: 'false', cost: '$44.00/mo' },
    status: 'healthy', importance: 7 },

  // Key Vault
  { id: 'az-kv-acme', label: 'KeyVault: kv-acme-prod', provider: 'azure', type: 'keyvault', category: 'security', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.KeyVault/vaults/kv-acme-prod`, vaultUri: 'https://kv-acme-prod.vault.azure.net/', sku: 'standard', enableSoftDelete: 'true', enablePurgeProtection: 'true', enableRbacAuthorization: 'true', publicNetworkAccess: 'Disabled', secrets: '12', keys: '3', certificates: '2', cost: '$0.03/transaction' },
    status: 'healthy', importance: 8 },

  // Container Registry
  { id: 'az-acr-acme', label: 'ACR: acmecr', provider: 'azure', type: 'acr', category: 'container', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.ContainerRegistry/registries/acmecr`, loginServer: 'acmecr.azurecr.io', sku: 'Premium', adminUserEnabled: 'false', publicNetworkAccess: 'Disabled', zoneRedundancy: 'Enabled', geoReplication: 'North Europe', images: '48', cost: '$55.00/mo' },
    status: 'healthy', importance: 7 },

  // PostgreSQL Flexible Server
  { id: 'az-pg-analytics', label: 'PostgreSQL: pg-analytics-prod', provider: 'azure', type: 'postgresql', category: 'database', region: 'westeurope', parent: 'az-sub-db',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.DBforPostgreSQL/flexibleServers/pg-analytics-prod`, fullyQualifiedDomainName: 'pg-analytics-prod.postgres.database.azure.com', version: '16', state: 'Ready', sku: 'Standard_D4s_v3 (GeneralPurpose)', storageSizeGb: '256', highAvailability: 'ZoneRedundant', backupRetentionDays: '14', geoRedundantBackup: 'Enabled', publicNetworkAccess: 'Disabled', cost: '$320.00/mo' },
    status: 'healthy', importance: 8 },

  // Application Gateway
  { id: 'az-appgw-prod', label: 'AppGW: appgw-acme-prod', provider: 'azure', type: 'appgateway', category: 'network', region: 'westeurope', parent: 'az-vnet-prod',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Network/applicationGateways/appgw-acme-prod`, skuName: 'WAF_v2', skuTier: 'WAF_v2', skuCapacity: '2', provisioningState: 'Succeeded', enableHttp2: 'true', enableWaf: 'true', firewallMode: 'Prevention', frontendPorts: '80, 443', backendPoolCount: '3', cost: '$262.00/mo' },
    status: 'healthy', importance: 7 },

  // ML — Azure OpenAI
  { id: 'az-openai-prod', label: 'OpenAI: oai-acme-prod', provider: 'azure', type: 'openai', category: 'ml', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.CognitiveServices/accounts/oai-acme-prod`, kind: 'OpenAI', sku: 'S0', endpoint: 'https://oai-acme-prod.openai.azure.com/', deployments: 'gpt-4o, text-embedding-3-small', tokenUsage: '18M tokens/mo', cost: '$540.00/mo' },
    status: 'healthy', importance: 8 },

  // ML — Machine Learning Workspace
  { id: 'az-ml-workspace', label: 'ML: ml-acme-prod', provider: 'azure', type: 'ml-workspace', category: 'ml', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.MachineLearningServices/workspaces/ml-acme-prod`, sku: 'Basic', provisioningState: 'Succeeded', compute: '2 clusters, 1 instance', experiments: '14', models: '8', cost: '$380.00/mo' },
    status: 'healthy', importance: 7 },

  // ML — Cognitive Services
  { id: 'az-cognitive-vision', label: 'Cognitive: cv-acme-prod', provider: 'azure', type: 'cognitive-account', category: 'ml', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.CognitiveServices/accounts/cv-acme-prod`, kind: 'ComputerVision', sku: 'S1', endpoint: 'https://cv-acme-prod.cognitiveservices.azure.com/', transactions: '450K/mo', cost: '$45.00/mo' },
    status: 'healthy', importance: 6 },

  // IoT — IoT Hub
  { id: 'az-iot-hub', label: 'IoT Hub: iot-acme-prod', provider: 'azure', type: 'iot-hub', category: 'iot', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Devices/IotHubs/iot-acme-prod`, sku: 'S2', units: '2', devices: '5,200', messagesPerDay: '8M', routes: '3', cost: '$250.00/mo' },
    status: 'healthy', importance: 7 },

  // IoT — Digital Twins
  { id: 'az-digital-twins', label: 'DT: dt-acme-factory', provider: 'azure', type: 'digital-twins', category: 'iot', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.DigitalTwins/digitalTwinsInstances/dt-acme-factory`, provisioningState: 'Succeeded', hostName: 'dt-acme-factory.api.weu.digitaltwins.azure.net', twins: '2,800', relationships: '8,400', cost: '$120.00/mo' },
    status: 'healthy', importance: 6 },

  // DevOps — DevTest Lab
  { id: 'az-devtest-lab', label: 'Lab: lab-acme-dev', provider: 'azure', type: 'devtest-lab', category: 'devops', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.DevTestLab/labs/lab-acme-dev`, vms: '8', environments: '3', costThreshold: '$500/mo', autoShutdown: '19:00 CET', cost: '$280.00/mo' },
    status: 'healthy', importance: 5 },

  // DevOps — Load Testing
  { id: 'az-load-testing', label: 'LoadTest: lt-acme-prod', provider: 'azure', type: 'load-testing', category: 'devops', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.LoadTestService/loadTests/lt-acme-prod`, provisioningState: 'Succeeded', tests: '6', lastRun: '2026-03-27T14:00:00Z', maxVUsers: '10,000' },
    status: 'healthy', importance: 5 },

  // Management — Log Analytics
  { id: 'az-log-analytics', label: 'LA: la-acme-prod', provider: 'azure', type: 'log-analytics', category: 'analytics', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.OperationalInsights/workspaces/la-acme-prod`, sku: 'PerGB2018', retentionDays: '90', dailyIngestion: '12 GB', cost: '$82.00/mo' },
    status: 'healthy', importance: 7 },

  // Management — App Insights
  { id: 'az-app-insights', label: 'AppInsights: ai-acme-prod', provider: 'azure', type: 'app-insights', category: 'analytics', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Insights/components/ai-acme-prod`, kind: 'web', connectedWorkspace: 'la-acme-prod', requestsPerMin: '45K', availability: '99.95%', cost: '$38.00/mo' },
    status: 'healthy', importance: 6 },

  // Management — Automation Account
  { id: 'az-automation', label: 'Automation: aa-acme-prod', provider: 'azure', type: 'automation-account', category: 'management', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Automation/automationAccounts/aa-acme-prod`, runbooks: '12', schedules: '8', dscNodes: '15', lastRunStatus: 'Completed', cost: '$12.00/mo' },
    status: 'healthy', importance: 5 },

  // Management — Recovery Vault
  { id: 'az-recovery-vault', label: 'Vault: rsv-acme-prod', provider: 'azure', type: 'recovery-vault', category: 'management', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.RecoveryServices/vaults/rsv-acme-prod`, sku: 'Standard', protectedItems: '24', backupPolicies: '3', replicationPolicies: '1', storageType: 'GeoRedundant', cost: '$65.00/mo' },
    status: 'healthy', importance: 6 },

  // Integration — Logic App
  { id: 'az-logic-workflow', label: 'Logic: order-orchestrator', provider: 'azure', type: 'logic-app', category: 'integration', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Logic/workflows/order-orchestrator`, state: 'Enabled', triggers: '1 (HTTP)', actions: '12', runsLast30d: '85,000', successRate: '99.2%', cost: '$18.00/mo' },
    status: 'healthy', importance: 6 },

  // Integration — API Management
  { id: 'az-apim', label: 'APIM: apim-acme-prod', provider: 'azure', type: 'api-management', category: 'integration', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/apim-acme-prod`, sku: 'Premium', units: '1', apis: '14', products: '3', subscriptions: '450', gateway: 'apim-acme-prod.azure-api.net', cost: '$700.00/mo' },
    status: 'healthy', importance: 7 },

  // Serverless — Static Web App
  { id: 'az-swa-docs', label: 'SWA: docs-portal', provider: 'azure', type: 'static-web-app', category: 'serverless', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Web/staticSites/docs-portal`, sku: 'Standard', customDomains: 'docs.acme.com', linkedBackend: 'func-event-processor', cost: '$9.00/mo' },
    status: 'healthy', importance: 4 },

  // Analytics — Synapse
  { id: 'az-synapse-prod', label: 'Synapse: syn-acme-analytics', provider: 'azure', type: 'synapse-workspace', category: 'analytics', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Synapse/workspaces/syn-acme-analytics`, managedResourceGroupName: 'synapseworkspace-managedrg-acme', sqlPools: '1 (DW1000c)', sparkPools: '1 (Small)', pipelines: '8', cost: '$920.00/mo' },
    status: 'healthy', importance: 8 },

  // Analytics — Data Factory
  { id: 'az-adf-prod', label: 'ADF: adf-acme-prod', provider: 'azure', type: 'data-factory', category: 'analytics', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.DataFactory/factories/adf-acme-prod`, provisioningState: 'Succeeded', pipelines: '22', datasets: '45', linkedServices: '8', triggersActive: '6', cost: '$85.00/mo' },
    status: 'healthy', importance: 7 },

  // Security — Managed Identity
  { id: 'az-mi-aks', label: 'MI: mi-aks-acme', provider: 'azure', type: 'managed-identity', category: 'security', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/mi-aks-acme`, clientId: 'abc123-def456', principalId: 'xyz789-uvw012', roleAssignments: '4' },
    status: 'healthy', importance: 5 },

  // Network — Azure Firewall
  { id: 'az-firewall-hub', label: 'Firewall: fw-hub-weu', provider: 'azure', type: 'firewall', category: 'network', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Network/azureFirewalls/fw-hub-weu`, sku: 'Premium', threatIntelMode: 'Alert', networkRuleCollections: '4', applicationRuleCollections: '3', natRuleCollections: '2', cost: '$912.00/mo' },
    status: 'healthy', importance: 8 },

  // Network — NSG
  { id: 'az-nsg-aks', label: 'NSG: nsg-aks-nodes', provider: 'azure', type: 'nsg', category: 'network', region: 'westeurope', parent: 'az-vnet-prod',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Network/networkSecurityGroups/nsg-aks-nodes`, securityRules: '12', defaultRules: '6', subnetsAssociated: '1' },
    status: 'healthy', importance: 5 },

  // Media — Virtual Desktop
  { id: 'az-avd-pool', label: 'AVD: hp-developers', provider: 'azure', type: 'virtual-desktop', category: 'media', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.DesktopVirtualization/hostPools/hp-developers`, hostPoolType: 'Pooled', loadBalancerType: 'BreadthFirst', maxSessionLimit: '8', sessionHosts: '5', activeSessions: '12', cost: '$420.00/mo' },
    status: 'healthy', importance: 5 },

  // Migration — Database Migration
  { id: 'az-dms-prod', label: 'DMS: dms-oracle-migrate', provider: 'azure', type: 'database-migration', category: 'migration', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.DataMigration/services/dms-oracle-migrate`, sku: 'Standard_4vCores', provisioningState: 'Succeeded', runningTasks: '2', completedTasks: '8', cost: '$180.00/mo' },
    status: 'healthy', importance: 5 },

  // Network — ExpressRoute
  { id: 'az-expressroute', label: 'ER: er-acme-dc', provider: 'azure', type: 'express-route', category: 'network', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Network/expressRouteCircuits/er-acme-dc`, serviceProviderName: 'Equinix', peeringLocation: 'Amsterdam', bandwidthInMbps: '1000', circuitProvisioningState: 'Provisioned', serviceProviderProvisioningState: 'Provisioned', cost: '$850.00/mo' },
    status: 'healthy', importance: 7 },

  // Database — Data Explorer (Kusto)
  { id: 'az-kusto-analytics', label: 'ADX: adx-acme-telemetry', provider: 'azure', type: 'data-explorer', category: 'database', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Kusto/clusters/adx-acme-telemetry`, sku: 'Standard_E8ads_v5', instances: '3', state: 'Running', databases: '2', ingestionRate: '50 GB/day', cost: '$1,200.00/mo' },
    status: 'healthy', importance: 7 },

  // Compute — VM Scale Set
  { id: 'az-vmss-workers', label: 'VMSS: vmss-batch-workers', provider: 'azure', type: 'vm-scaleset', category: 'compute', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Compute/virtualMachineScaleSets/vmss-batch-workers`, sku: 'Standard_D4s_v5', capacity: '6', upgradePolicy: 'Automatic', instances: '6', provisioningState: 'Succeeded', cost: '$580.00/mo' },
    status: 'healthy', importance: 6 },

  // Container — Container App
  { id: 'az-ca-api', label: 'ContainerApp: ca-api-v2', provider: 'azure', type: 'container-app', category: 'container', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/ca-api-v2`, image: 'acmecr.azurecr.io/api-v2:latest', replicas: '3', cpu: '1.0', memory: '2Gi', traffic: '100% latest', cost: '$45.00/mo' },
    status: 'healthy', importance: 6 },

  // Messaging — Event Grid
  { id: 'az-eventgrid-orders', label: 'EventGrid: eg-order-events', provider: 'azure', type: 'event-grid-topic', category: 'messaging', region: 'westeurope',
    metadata: { resourceId: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.EventGrid/topics/eg-order-events`, provisioningState: 'Succeeded', endpoint: 'https://eg-order-events.westeurope-1.eventgrid.azure.net', subscriptions: '4', publishedEvents: '2.1M/mo', cost: '$6.00/mo' },
    status: 'healthy', importance: 6 },

  // Security — Defender
  { id: 'az-defender', label: 'Defender: Security Center', provider: 'azure', type: 'defender', category: 'security', region: 'global',
    metadata: { secureScore: '78/100', recommendations: '24', alerts: '3', coveragePlans: 'VMs, SQL, Storage, Key Vault, AKS, App Service', cost: '$120.00/mo' },
    status: 'healthy', importance: 7 },
]

export const azureEdges: InfraEdge[] = [
  // Existing edges
  { id: 'aze-1', source: 'az-fd-prod', target: 'az-aks-prod', type: 'network', label: 'HTTPS ingress' },
  { id: 'aze-2', source: 'az-fd-prod', target: 'az-blob-prod', type: 'data', label: 'static files' },
  { id: 'aze-3', source: 'az-aks-fe', target: 'az-aks-be', type: 'network', label: 'ClusterIP svc' },
  { id: 'aze-4', source: 'az-aks-be', target: 'az-cosmos-prod', type: 'data', label: 'MongoDB reads/writes' },
  { id: 'aze-5', source: 'az-aks-be', target: 'az-blob-prod', type: 'data', label: 'file uploads' },
  { id: 'aze-6', source: 'az-func-events', target: 'az-cosmos-prod', type: 'data', label: 'event store' },
  { id: 'aze-7', source: 'az-func-events', target: 'az-func-notif', type: 'dependency', label: 'trigger' },
  { id: 'aze-8', source: 'az-aks-worker', target: 'az-blob-prod', type: 'data', label: 'batch processing' },
  { id: 'aze-9', source: 'az-aks-worker', target: 'az-cosmos-prod', type: 'data', label: 'job results' },

  // New edges for expanded services
  // Backend -> SQL Database for order processing
  { id: 'aze-10', source: 'az-aks-be', target: 'az-sql-acme-prod', type: 'data', label: 'SQL order queries' },
  { id: 'aze-11', source: 'az-sql-acme-prod', target: 'az-sqldb-orders', type: 'dependency', label: 'hosts' },

  // Backend -> Redis for caching
  { id: 'aze-12', source: 'az-aks-be', target: 'az-redis-acme', type: 'data', label: 'session cache' },

  // Backend -> Service Bus for async messaging
  { id: 'aze-13', source: 'az-aks-be', target: 'az-sb-acme', type: 'data', label: 'publish orders' },
  { id: 'aze-14', source: 'az-sb-acme', target: 'az-aks-worker', type: 'data', label: 'consume jobs' },

  // Function App -> Event Hubs for telemetry
  { id: 'aze-15', source: 'az-func-events', target: 'az-eh-acme', type: 'data', label: 'telemetry ingest' },

  // AKS & Function Apps -> Key Vault for secrets
  { id: 'aze-16', source: 'az-aks-be', target: 'az-kv-acme', type: 'dependency', label: 'secret refs' },
  { id: 'aze-17', source: 'az-func-events', target: 'az-kv-acme', type: 'dependency', label: 'secret refs' },
  { id: 'aze-18', source: 'az-sql-acme-prod', target: 'az-kv-acme', type: 'dependency', label: 'TDE key' },

  // ACR -> AKS for container images
  { id: 'aze-19', source: 'az-acr-acme', target: 'az-aks-prod', type: 'dependency', label: 'image pull' },

  // Worker -> PostgreSQL analytics DB
  { id: 'aze-20', source: 'az-aks-worker', target: 'az-pg-analytics', type: 'data', label: 'analytics writes' },

  // App Gateway -> AKS ingress
  { id: 'aze-21', source: 'az-appgw-prod', target: 'az-aks-prod', type: 'network', label: 'L7 routing' },
  { id: 'aze-22', source: 'az-fd-prod', target: 'az-appgw-prod', type: 'network', label: 'WAF ingress' },

  // ML edges
  { id: 'aze-23', source: 'az-aks-be', target: 'az-openai-prod', type: 'dependency', label: 'GPT inference' },
  { id: 'aze-24', source: 'az-ml-workspace', target: 'az-blob-prod', type: 'data', label: 'model artifacts' },
  { id: 'aze-25', source: 'az-cognitive-vision', target: 'az-aks-be', type: 'dependency', label: 'image analysis' },

  // IoT edges
  { id: 'aze-26', source: 'az-iot-hub', target: 'az-eh-acme', type: 'data', label: 'device telemetry' },
  { id: 'aze-27', source: 'az-iot-hub', target: 'az-digital-twins', type: 'data', label: 'twin updates' },
  { id: 'aze-28', source: 'az-digital-twins', target: 'az-cosmos-prod', type: 'data', label: 'twin state' },

  // Management edges
  { id: 'aze-29', source: 'az-app-insights', target: 'az-log-analytics', type: 'data', label: 'telemetry sink' },
  { id: 'aze-30', source: 'az-aks-prod', target: 'az-app-insights', type: 'data', label: 'APM data' },
  { id: 'aze-31', source: 'az-automation', target: 'az-aks-prod', type: 'dependency', label: 'runbook target' },
  { id: 'aze-32', source: 'az-recovery-vault', target: 'az-sql-acme-prod', type: 'dependency', label: 'backup target' },

  // Integration edges
  { id: 'aze-33', source: 'az-logic-workflow', target: 'az-sb-acme', type: 'data', label: 'read queue' },
  { id: 'aze-34', source: 'az-logic-workflow', target: 'az-cosmos-prod', type: 'data', label: 'write results' },
  { id: 'aze-35', source: 'az-apim', target: 'az-aks-prod', type: 'network', label: 'API proxy' },
  { id: 'aze-36', source: 'az-fd-prod', target: 'az-apim', type: 'network', label: 'API gateway' },

  // Analytics edges
  { id: 'aze-37', source: 'az-synapse-prod', target: 'az-blob-prod', type: 'data', label: 'data lake source' },
  { id: 'aze-38', source: 'az-adf-prod', target: 'az-synapse-prod', type: 'data', label: 'ETL pipeline' },
  { id: 'aze-39', source: 'az-adf-prod', target: 'az-sql-acme-prod', type: 'data', label: 'extract source' },

  // Security edges
  { id: 'aze-40', source: 'az-mi-aks', target: 'az-aks-prod', type: 'dependency', label: 'pod identity' },
  { id: 'aze-41', source: 'az-mi-aks', target: 'az-kv-acme', type: 'dependency', label: 'secret access' },

  // Network edges
  { id: 'aze-42', source: 'az-firewall-hub', target: 'az-vnet-prod', type: 'network', label: 'egress filter' },
  { id: 'aze-43', source: 'az-expressroute', target: 'az-vnet-prod', type: 'network', label: 'hybrid link' },

  // Database edges
  { id: 'aze-44', source: 'az-kusto-analytics', target: 'az-eh-acme', type: 'data', label: 'ingest from EH' },
  { id: 'aze-45', source: 'az-kusto-analytics', target: 'az-blob-prod', type: 'data', label: 'export results' },

  // Container App edges
  { id: 'aze-46', source: 'az-ca-api', target: 'az-cosmos-prod', type: 'data', label: 'API queries' },
  { id: 'aze-47', source: 'az-ca-api', target: 'az-acr-acme', type: 'dependency', label: 'image pull' },

  // Messaging edges
  { id: 'aze-48', source: 'az-eventgrid-orders', target: 'az-func-events', type: 'data', label: 'event trigger' },
  { id: 'aze-49', source: 'az-aks-be', target: 'az-eventgrid-orders', type: 'data', label: 'publish events' },

  // Migration edges
  { id: 'aze-50', source: 'az-dms-prod', target: 'az-sql-acme-prod', type: 'data', label: 'migration target' },
]
