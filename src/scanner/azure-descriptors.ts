/**
 * Declarative Azure Service Descriptors
 *
 * Each descriptor defines how to scan a specific Azure service:
 * - Which SDK package and client class to use
 * - Which async-iterable list method to call
 * - How to map each raw resource into an InfraNode
 *
 * This follows the same data-driven pattern as descriptors.ts (AWS) so that
 * new Azure services can be added without any scanner boilerplate.
 *
 * NOTE: The existing imperative scanner (azure.ts) already covers VNets,
 * AKS, CosmosDB, Web/Function Apps, CDN/Front Door, and Storage Accounts.
 * These descriptors add NEW services only.
 */

import type { InfraNode, NodeCategory, HealthStatus } from '../types'

// ---------------------------------------------------------------------------
// Descriptor interface
// ---------------------------------------------------------------------------

export interface AzureServiceDescriptor {
  /** Internal resource type key (e.g. 'sql-server', 'redis') */
  type: string
  /** Node category for the viewer */
  category: NodeCategory
  /** NPM package for the Azure SDK ARM client */
  sdkPackage: string
  /** Name of the client class to instantiate from the package */
  clientClass: string
  /**
   * Dot-separated path to the async-iterable list method on the client.
   * e.g. 'servers.list' means client.servers.list()
   */
  listMethod: string
  /** Default importance score (1-10) for this resource type */
  importance: number
  /** Map a raw Azure resource + subscriptionId into an InfraNode (minus `provider`) */
  mapResource: (resource: any, subscriptionId: string) => Omit<InfraNode, 'provider'>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val)
}

function provisioningHealth(state: string | undefined): HealthStatus {
  if (!state) return 'warning'
  const s = state.toLowerCase()
  if (s === 'succeeded' || s === 'running' || s === 'ready') return 'healthy'
  if (s === 'creating' || s === 'updating' || s === 'starting') return 'warning'
  return 'error'
}

function extractResourceGroup(resourceId: string): string {
  const match = resourceId.match(/\/resourceGroups\/([^/]+)/i)
  return match ? match[1] : 'unknown'
}

// ---------------------------------------------------------------------------
// Descriptors for Azure services
// ---------------------------------------------------------------------------

export const AZURE_SERVICE_DESCRIPTORS: AzureServiceDescriptor[] = [

  // =======================================================================
  // DATABASE
  // =======================================================================

  // -----------------------------------------------------------------------
  // SQL Database -- Servers (databases are listed per-server in a second pass)
  // -----------------------------------------------------------------------
  {
    type: 'sql-server',
    category: 'database',
    sdkPackage: '@azure/arm-sql',
    clientClass: 'SqlManagementClient',
    listMethod: 'servers.list',
    importance: 8,
    mapResource: (server: any, subscriptionId: string) => {
      const name = server.name ?? 'unknown'
      const id = server.id ?? ''
      const rg = extractResourceGroup(id)
      const location = server.location ?? 'unknown'
      return {
        id: `az-sql-${name}`,
        label: `SQL: ${name}`,
        type: 'sql-server',
        category: 'database',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          fullyQualifiedDomainName: str(server.fullyQualifiedDomainName),
          administratorLogin: str(server.administratorLogin),
          version: str(server.version),
          state: str(server.state),
          publicNetworkAccess: str(server.publicNetworkAccess),
          minimalTlsVersion: str(server.minimalTlsVersion),
        },
        status: provisioningHealth(server.state),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Redis Cache
  // -----------------------------------------------------------------------
  {
    type: 'redis',
    category: 'database',
    sdkPackage: '@azure/arm-redis',
    clientClass: 'RedisManagementClient',
    listMethod: 'redis.listBySubscription',
    importance: 7,
    mapResource: (cache: any, subscriptionId: string) => {
      const name = cache.name ?? 'unknown'
      const id = cache.id ?? ''
      const rg = extractResourceGroup(id)
      const location = cache.location ?? 'unknown'
      const provState = cache.provisioningState ?? ''
      return {
        id: `az-redis-${name}`,
        label: `Redis: ${name}`,
        type: 'redis',
        category: 'database',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          hostName: str(cache.hostName),
          port: str(cache.port),
          sslPort: str(cache.sslPort),
          sku: cache.sku ? `${cache.sku.name ?? ''} ${cache.sku.family ?? ''}${cache.sku.capacity ?? ''}` : '',
          redisVersion: str(cache.redisVersion),
          provisioningState: provState,
          publicNetworkAccess: str(cache.publicNetworkAccess),
          enableNonSslPort: str(cache.enableNonSslPort),
          minimumTlsVersion: str(cache.minimumTlsVersion),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // PostgreSQL Flexible Server
  // -----------------------------------------------------------------------
  {
    type: 'postgresql',
    category: 'database',
    sdkPackage: '@azure/arm-postgresql-flexible',
    clientClass: 'PostgreSQLManagementFlexibleServerClient',
    listMethod: 'servers.list',
    importance: 8,
    mapResource: (server: any, subscriptionId: string) => {
      const name = server.name ?? 'unknown'
      const id = server.id ?? ''
      const rg = extractResourceGroup(id)
      const location = server.location ?? 'unknown'
      const state = server.state ?? ''
      return {
        id: `az-pg-${name}`,
        label: `PostgreSQL: ${name}`,
        type: 'postgresql',
        category: 'database',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          fullyQualifiedDomainName: str(server.fullyQualifiedDomainName),
          version: str(server.version),
          state,
          administratorLogin: str(server.administratorLogin),
          sku: server.sku ? `${server.sku.name ?? ''} (${server.sku.tier ?? ''})` : '',
          storageSizeGb: str(server.storage?.storageSizeGB),
          highAvailability: str(server.highAvailability?.mode),
          backupRetentionDays: str(server.backup?.backupRetentionDays),
          geoRedundantBackup: str(server.backup?.geoRedundantBackup),
          publicNetworkAccess: str(server.network?.publicNetworkAccess),
        },
        status: state.toLowerCase() === 'ready' ? 'healthy' : provisioningHealth(state),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // MySQL Flexible Server
  // -----------------------------------------------------------------------
  {
    type: 'mysql-flexible',
    category: 'database',
    sdkPackage: '@azure/arm-mysql-flexible',
    clientClass: 'MySQLManagementFlexibleServerClient',
    listMethod: 'servers.list',
    importance: 7,
    mapResource: (server: any, subscriptionId: string) => {
      const name = server.name ?? 'unknown'
      const id = server.id ?? ''
      const rg = extractResourceGroup(id)
      const location = server.location ?? 'unknown'
      const state = server.state ?? ''
      return {
        id: `az-mysql-${name}`,
        label: `MySQL: ${name}`,
        type: 'mysql-flexible',
        category: 'database',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          fullyQualifiedDomainName: str(server.fullyQualifiedDomainName),
          version: str(server.version),
          state,
          administratorLogin: str(server.administratorLogin),
          sku: server.sku ? `${server.sku.name ?? ''} (${server.sku.tier ?? ''})` : '',
          storageSizeGb: str(server.storage?.storageSizeGB),
          highAvailability: str(server.highAvailability?.mode),
          backupRetentionDays: str(server.backup?.backupRetentionDays),
          geoRedundantBackup: str(server.backup?.geoRedundantBackup),
          publicNetworkAccess: str(server.network?.publicNetworkAccess),
        },
        status: state.toLowerCase() === 'ready' ? 'healthy' : provisioningHealth(state),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // MariaDB Server
  // -----------------------------------------------------------------------
  {
    type: 'mariadb',
    category: 'database',
    sdkPackage: '@azure/arm-mariadb',
    clientClass: 'MariaDBManagementClient',
    listMethod: 'servers.list',
    importance: 6,
    mapResource: (server: any, subscriptionId: string) => {
      const name = server.name ?? 'unknown'
      const id = server.id ?? ''
      const rg = extractResourceGroup(id)
      const location = server.location ?? 'unknown'
      const state = server.properties?.userVisibleState ?? ''
      return {
        id: `az-mariadb-${name}`,
        label: `MariaDB: ${name}`,
        type: 'mariadb',
        category: 'database',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          fullyQualifiedDomainName: str(server.properties?.fullyQualifiedDomainName),
          version: str(server.properties?.version),
          state,
          administratorLogin: str(server.properties?.administratorLogin),
          sku: server.sku ? `${server.sku.name ?? ''} (${server.sku.tier ?? ''})` : '',
          storageMb: str(server.properties?.storageProfile?.storageMB),
          sslEnforcement: str(server.properties?.sslEnforcement),
          publicNetworkAccess: str(server.properties?.publicNetworkAccess),
        },
        status: provisioningHealth(state),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SQL Managed Instance
  // -----------------------------------------------------------------------
  {
    type: 'sql-managed-instance',
    category: 'database',
    sdkPackage: '@azure/arm-sql',
    clientClass: 'SqlManagementClient',
    listMethod: 'managedInstances.list',
    importance: 9,
    mapResource: (mi: any, subscriptionId: string) => {
      const name = mi.name ?? 'unknown'
      const id = mi.id ?? ''
      const rg = extractResourceGroup(id)
      const location = mi.location ?? 'unknown'
      const state = mi.state ?? ''
      return {
        id: `az-sqlmi-${name}`,
        label: `SQL MI: ${name}`,
        type: 'sql-managed-instance',
        category: 'database',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          fullyQualifiedDomainName: str(mi.fullyQualifiedDomainName),
          administratorLogin: str(mi.administratorLogin),
          state,
          sku: mi.sku ? `${mi.sku.name ?? ''} (${mi.sku.tier ?? ''})` : '',
          vCores: str(mi.vCores),
          storageSizeInGB: str(mi.storageSizeInGB),
          licenseType: str(mi.licenseType),
          proxyOverride: str(mi.proxyOverride),
          publicDataEndpointEnabled: str(mi.publicDataEndpointEnabled),
          minimalTlsVersion: str(mi.minimalTlsVersion),
          zoneRedundant: str(mi.zoneRedundant),
        },
        status: provisioningHealth(state),
        importance: 9,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Data Explorer / Kusto
  // -----------------------------------------------------------------------
  {
    type: 'data-explorer',
    category: 'database',
    sdkPackage: '@azure/arm-kusto',
    clientClass: 'KustoManagementClient',
    listMethod: 'clusters.list',
    importance: 7,
    mapResource: (cluster: any, subscriptionId: string) => {
      const name = cluster.name ?? 'unknown'
      const id = cluster.id ?? ''
      const rg = extractResourceGroup(id)
      const location = cluster.location ?? 'unknown'
      const state = cluster.state ?? ''
      const provState = cluster.provisioningState ?? ''
      return {
        id: `az-adx-${name}`,
        label: `Data Explorer: ${name}`,
        type: 'data-explorer',
        category: 'database',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          uri: str(cluster.uri),
          dataIngestionUri: str(cluster.dataIngestionUri),
          state,
          provisioningState: provState,
          sku: cluster.sku ? `${cluster.sku.name ?? ''} (${cluster.sku.tier ?? ''})` : '',
          capacity: str(cluster.sku?.capacity),
          enableStreamingIngest: str(cluster.enableStreamingIngest),
          enableDiskEncryption: str(cluster.enableDiskEncryption),
          enableAutoStop: str(cluster.enableAutoStop),
          engineType: str(cluster.engineType),
        },
        status: state.toLowerCase() === 'running' ? 'healthy' : provisioningHealth(state),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Cache for Redis Enterprise
  // -----------------------------------------------------------------------
  {
    type: 'cache-enterprise',
    category: 'database',
    sdkPackage: '@azure/arm-redisenterprise',
    clientClass: 'RedisEnterpriseManagementClient',
    listMethod: 'list',
    importance: 7,
    mapResource: (cluster: any, subscriptionId: string) => {
      const name = cluster.name ?? 'unknown'
      const id = cluster.id ?? ''
      const rg = extractResourceGroup(id)
      const location = cluster.location ?? 'unknown'
      const provState = cluster.provisioningState ?? ''
      return {
        id: `az-redis-ent-${name}`,
        label: `Redis Enterprise: ${name}`,
        type: 'cache-enterprise',
        category: 'database',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          hostName: str(cluster.hostName),
          provisioningState: provState,
          resourceState: str(cluster.resourceState),
          sku: cluster.sku ? `${cluster.sku.name ?? ''} (capacity: ${cluster.sku.capacity ?? ''})` : '',
          minimumTlsVersion: str(cluster.minimumTlsVersion),
          zones: (cluster.zones ?? []).join(', '),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // =======================================================================
  // MESSAGING
  // =======================================================================

  // -----------------------------------------------------------------------
  // Service Bus -- Namespaces
  // -----------------------------------------------------------------------
  {
    type: 'servicebus',
    category: 'messaging',
    sdkPackage: '@azure/arm-servicebus',
    clientClass: 'ServiceBusManagementClient',
    listMethod: 'namespaces.list',
    importance: 7,
    mapResource: (ns: any, subscriptionId: string) => {
      const name = ns.name ?? 'unknown'
      const id = ns.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ns.location ?? 'unknown'
      const provState = ns.provisioningState ?? ''
      return {
        id: `az-sb-${name}`,
        label: `ServiceBus: ${name}`,
        type: 'servicebus',
        category: 'messaging',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          sku: ns.sku ? `${ns.sku.name ?? ''} (${ns.sku.tier ?? ''})` : '',
          provisioningState: provState,
          serviceBusEndpoint: str(ns.serviceBusEndpoint),
          status: str(ns.status),
          zoneRedundant: str(ns.zoneRedundant),
          disableLocalAuth: str(ns.disableLocalAuth),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Event Hubs -- Namespaces
  // -----------------------------------------------------------------------
  {
    type: 'eventhub',
    category: 'messaging',
    sdkPackage: '@azure/arm-eventhub',
    clientClass: 'EventHubManagementClient',
    listMethod: 'namespaces.list',
    importance: 7,
    mapResource: (ns: any, subscriptionId: string) => {
      const name = ns.name ?? 'unknown'
      const id = ns.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ns.location ?? 'unknown'
      const provState = ns.provisioningState ?? ''
      return {
        id: `az-eh-${name}`,
        label: `EventHub: ${name}`,
        type: 'eventhub',
        category: 'messaging',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          sku: ns.sku ? `${ns.sku.name ?? ''} (capacity: ${ns.sku.capacity ?? ''})` : '',
          provisioningState: provState,
          serviceBusEndpoint: str(ns.serviceBusEndpoint),
          status: str(ns.status),
          kafkaEnabled: str(ns.kafkaEnabled),
          isAutoInflateEnabled: str(ns.isAutoInflateEnabled),
          maximumThroughputUnits: str(ns.maximumThroughputUnits),
          zoneRedundant: str(ns.zoneRedundant),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Notification Hubs -- Namespaces
  // -----------------------------------------------------------------------
  {
    type: 'notification-hub',
    category: 'messaging',
    sdkPackage: '@azure/arm-notificationhubs',
    clientClass: 'NotificationHubsManagementClient',
    listMethod: 'namespaces.listAll',
    importance: 5,
    mapResource: (ns: any, subscriptionId: string) => {
      const name = ns.name ?? 'unknown'
      const id = ns.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ns.location ?? 'unknown'
      const provState = ns.provisioningState ?? ''
      return {
        id: `az-nhub-${name}`,
        label: `NotifHub NS: ${name}`,
        type: 'notification-hub',
        category: 'messaging',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: ns.sku ? str(ns.sku.name) : '',
          serviceBusEndpoint: str(ns.serviceBusEndpoint),
          status: str(ns.status),
          namespaceType: str(ns.namespaceType),
          enabled: str(ns.enabled),
          critical: str(ns.critical),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Relay -- Namespaces
  // -----------------------------------------------------------------------
  {
    type: 'relay',
    category: 'messaging',
    sdkPackage: '@azure/arm-relay',
    clientClass: 'RelayManagementClient',
    listMethod: 'namespaces.list',
    importance: 4,
    mapResource: (ns: any, subscriptionId: string) => {
      const name = ns.name ?? 'unknown'
      const id = ns.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ns.location ?? 'unknown'
      const provState = ns.provisioningState ?? ''
      return {
        id: `az-relay-${name}`,
        label: `Relay: ${name}`,
        type: 'relay',
        category: 'messaging',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: ns.sku ? str(ns.sku.name) : '',
          serviceBusEndpoint: str(ns.serviceBusEndpoint),
          status: str(ns.status),
        },
        status: provisioningHealth(provState),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SignalR Service
  // -----------------------------------------------------------------------
  {
    type: 'signalr',
    category: 'messaging',
    sdkPackage: '@azure/arm-signalr',
    clientClass: 'SignalRManagementClient',
    listMethod: 'listBySubscription',
    importance: 5,
    mapResource: (sr: any, subscriptionId: string) => {
      const name = sr.name ?? 'unknown'
      const id = sr.id ?? ''
      const rg = extractResourceGroup(id)
      const location = sr.location ?? 'unknown'
      const provState = sr.provisioningState ?? ''
      return {
        id: `az-signalr-${name}`,
        label: `SignalR: ${name}`,
        type: 'signalr',
        category: 'messaging',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          hostName: str(sr.hostName),
          externalIP: str(sr.externalIP),
          sku: sr.sku ? `${sr.sku.name ?? ''} (capacity: ${sr.sku.capacity ?? ''})` : '',
          version: str(sr.version),
          publicNetworkAccess: str(sr.publicNetworkAccess),
          disableLocalAuth: str(sr.disableLocalAuth),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Communication Services
  // -----------------------------------------------------------------------
  {
    type: 'communication',
    category: 'messaging',
    sdkPackage: '@azure/arm-communication',
    clientClass: 'CommunicationServiceManagementClient',
    listMethod: 'communicationServices.listBySubscription',
    importance: 5,
    mapResource: (svc: any, subscriptionId: string) => {
      const name = svc.name ?? 'unknown'
      const id = svc.id ?? ''
      const rg = extractResourceGroup(id)
      const location = svc.location ?? 'unknown'
      const provState = svc.provisioningState ?? ''
      return {
        id: `az-comm-${name}`,
        label: `Communication: ${name}`,
        type: 'communication',
        category: 'messaging',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          hostName: str(svc.hostName),
          dataLocation: str(svc.dataLocation),
          immutableResourceId: str(svc.immutableResourceId),
          version: str(svc.version),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Event Grid Topics
  // -----------------------------------------------------------------------
  {
    type: 'event-grid-topic',
    category: 'messaging',
    sdkPackage: '@azure/arm-eventgrid',
    clientClass: 'EventGridManagementClient',
    listMethod: 'topics.listBySubscription',
    importance: 5,
    mapResource: (topic: any, subscriptionId: string) => {
      const name = topic.name ?? 'unknown'
      const id = topic.id ?? ''
      const rg = extractResourceGroup(id)
      const location = topic.location ?? 'unknown'
      const provState = topic.provisioningState ?? ''
      return {
        id: `az-egt-${name}`,
        label: `EventGrid Topic: ${name}`,
        type: 'event-grid-topic',
        category: 'messaging',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          endpoint: str(topic.endpoint),
          inputSchema: str(topic.inputSchema),
          publicNetworkAccess: str(topic.publicNetworkAccess),
          disableLocalAuth: str(topic.disableLocalAuth),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Event Grid Domains
  // -----------------------------------------------------------------------
  {
    type: 'event-grid-domain',
    category: 'messaging',
    sdkPackage: '@azure/arm-eventgrid',
    clientClass: 'EventGridManagementClient',
    listMethod: 'domains.listBySubscription',
    importance: 5,
    mapResource: (domain: any, subscriptionId: string) => {
      const name = domain.name ?? 'unknown'
      const id = domain.id ?? ''
      const rg = extractResourceGroup(id)
      const location = domain.location ?? 'unknown'
      const provState = domain.provisioningState ?? ''
      return {
        id: `az-egd-${name}`,
        label: `EventGrid Domain: ${name}`,
        type: 'event-grid-domain',
        category: 'messaging',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          endpoint: str(domain.endpoint),
          inputSchema: str(domain.inputSchema),
          publicNetworkAccess: str(domain.publicNetworkAccess),
          disableLocalAuth: str(domain.disableLocalAuth),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Event Grid System Topics
  // -----------------------------------------------------------------------
  {
    type: 'event-grid-subscription',
    category: 'messaging',
    sdkPackage: '@azure/arm-eventgrid',
    clientClass: 'EventGridManagementClient',
    listMethod: 'systemTopics.listBySubscription',
    importance: 4,
    mapResource: (topic: any, subscriptionId: string) => {
      const name = topic.name ?? 'unknown'
      const id = topic.id ?? ''
      const rg = extractResourceGroup(id)
      const location = topic.location ?? 'unknown'
      const provState = topic.provisioningState ?? ''
      return {
        id: `az-egst-${name}`,
        label: `EventGrid SystemTopic: ${name}`,
        type: 'event-grid-subscription',
        category: 'messaging',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          source: str(topic.source),
          topicType: str(topic.topicType),
        },
        status: provisioningHealth(provState),
        importance: 4,
      }
    },
  },

  // =======================================================================
  // SECURITY
  // =======================================================================

  // -----------------------------------------------------------------------
  // Key Vault
  // -----------------------------------------------------------------------
  {
    type: 'keyvault',
    category: 'security',
    sdkPackage: '@azure/arm-keyvault',
    clientClass: 'KeyVaultManagementClient',
    listMethod: 'vaults.listBySubscription',
    importance: 8,
    mapResource: (vault: any, subscriptionId: string) => {
      const name = vault.name ?? 'unknown'
      const id = vault.id ?? ''
      const rg = extractResourceGroup(id)
      const location = vault.location ?? 'unknown'
      const props = vault.properties ?? {}
      return {
        id: `az-kv-${name}`,
        label: `KeyVault: ${name}`,
        type: 'keyvault',
        category: 'security',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          vaultUri: str(props.vaultUri),
          sku: props.sku ? str(props.sku.name) : '',
          tenantId: str(props.tenantId),
          enableSoftDelete: str(props.enableSoftDelete),
          enablePurgeProtection: str(props.enablePurgeProtection),
          enableRbacAuthorization: str(props.enableRbacAuthorization),
          publicNetworkAccess: str(props.publicNetworkAccess),
          provisioningState: str(props.provisioningState),
        },
        status: provisioningHealth(props.provisioningState),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Microsoft Defender for Cloud
  // -----------------------------------------------------------------------
  {
    type: 'defender',
    category: 'security',
    sdkPackage: '@azure/arm-security',
    clientClass: 'SecurityCenter',
    listMethod: 'pricings.list',
    importance: 8,
    mapResource: (pricing: any, subscriptionId: string) => {
      const name = pricing.name ?? 'unknown'
      const id = pricing.id ?? ''
      return {
        id: `az-defender-${name}`,
        label: `Defender: ${name}`,
        type: 'defender',
        category: 'security',
        region: 'global',
        metadata: {
          resourceId: id,
          name,
          pricingTier: str(pricing.pricingTier),
          freeTrialRemainingTime: str(pricing.freeTrialRemainingTime),
          subPlan: str(pricing.subPlan),
        },
        status: pricing.pricingTier === 'Standard' ? 'healthy' : 'warning',
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Managed Identities (User-Assigned)
  // -----------------------------------------------------------------------
  {
    type: 'managed-identity',
    category: 'security',
    sdkPackage: '@azure/arm-msi',
    clientClass: 'ManagedServiceIdentityClient',
    listMethod: 'userAssignedIdentities.listBySubscription',
    importance: 4,
    mapResource: (identity: any, subscriptionId: string) => {
      const name = identity.name ?? 'unknown'
      const id = identity.id ?? ''
      const rg = extractResourceGroup(id)
      const location = identity.location ?? 'unknown'
      return {
        id: `az-mid-${name}`,
        label: `Identity: ${name}`,
        type: 'managed-identity',
        category: 'security',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          principalId: str(identity.principalId),
          clientId: str(identity.clientId),
          tenantId: str(identity.tenantId),
        },
        status: 'healthy',
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // DNS Private Resolver
  // -----------------------------------------------------------------------
  {
    type: 'private-dns-resolver',
    category: 'security',
    sdkPackage: '@azure/arm-dnsresolver',
    clientClass: 'DnsResolverManagementClient',
    listMethod: 'dnsResolvers.list',
    importance: 5,
    mapResource: (resolver: any, subscriptionId: string) => {
      const name = resolver.name ?? 'unknown'
      const id = resolver.id ?? ''
      const rg = extractResourceGroup(id)
      const location = resolver.location ?? 'unknown'
      const provState = resolver.provisioningState ?? ''
      return {
        id: `az-dnsresolver-${name}`,
        label: `DNS Resolver: ${name}`,
        type: 'private-dns-resolver',
        category: 'security',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          resourceGuid: str(resolver.resourceGuid),
          virtualNetworkId: str(resolver.virtualNetwork?.id),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Policy Assignments
  // -----------------------------------------------------------------------
  {
    type: 'policy-assignment',
    category: 'security',
    sdkPackage: '@azure/arm-policy',
    clientClass: 'PolicyClient',
    listMethod: 'policyAssignments.list',
    importance: 4,
    mapResource: (assignment: any, subscriptionId: string) => {
      const name = assignment.name ?? 'unknown'
      const id = assignment.id ?? ''
      return {
        id: `az-policy-${name}`,
        label: `Policy: ${assignment.displayName ?? name}`,
        type: 'policy-assignment',
        category: 'security',
        region: 'global',
        metadata: {
          resourceId: id,
          displayName: str(assignment.displayName),
          policyDefinitionId: str(assignment.policyDefinitionId),
          scope: str(assignment.scope),
          enforcementMode: str(assignment.enforcementMode),
          description: str(assignment.description),
        },
        status: 'healthy',
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Role Assignments
  // -----------------------------------------------------------------------
  {
    type: 'role-assignment',
    category: 'security',
    sdkPackage: '@azure/arm-authorization',
    clientClass: 'AuthorizationManagementClient',
    listMethod: 'roleAssignments.listForSubscription',
    importance: 3,
    mapResource: (ra: any, subscriptionId: string) => {
      const name = ra.name ?? 'unknown'
      const id = ra.id ?? ''
      return {
        id: `az-role-${name}`,
        label: `RoleAssign: ${name}`,
        type: 'role-assignment',
        category: 'security',
        region: 'global',
        metadata: {
          resourceId: id,
          principalId: str(ra.principalId),
          roleDefinitionId: str(ra.roleDefinitionId),
          scope: str(ra.scope),
          principalType: str(ra.principalType),
          condition: str(ra.condition),
        },
        status: 'healthy',
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Disk Encryption Sets
  // -----------------------------------------------------------------------
  {
    type: 'disk-encryption-set',
    category: 'security',
    sdkPackage: '@azure/arm-compute',
    clientClass: 'ComputeManagementClient',
    listMethod: 'diskEncryptionSets.list',
    importance: 5,
    mapResource: (des: any, subscriptionId: string) => {
      const name = des.name ?? 'unknown'
      const id = des.id ?? ''
      const rg = extractResourceGroup(id)
      const location = des.location ?? 'unknown'
      const provState = des.provisioningState ?? ''
      return {
        id: `az-des-${name}`,
        label: `DiskEncryption: ${name}`,
        type: 'disk-encryption-set',
        category: 'security',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          encryptionType: str(des.encryptionType),
          rotationToLatestKeyVersionEnabled: str(des.rotationToLatestKeyVersionEnabled),
          activeKeySourceVaultId: str(des.activeKey?.sourceVault?.id),
          activeKeyUrl: str(des.activeKey?.keyUrl),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Attestation Providers
  // -----------------------------------------------------------------------
  {
    type: 'attestation',
    category: 'security',
    sdkPackage: '@azure/arm-attestation',
    clientClass: 'AttestationManagementClient',
    listMethod: 'attestationProviders.list',
    importance: 4,
    mapResource: (provider: any, subscriptionId: string) => {
      const name = provider.name ?? 'unknown'
      const id = provider.id ?? ''
      const rg = extractResourceGroup(id)
      const location = provider.location ?? 'unknown'
      return {
        id: `az-attest-${name}`,
        label: `Attestation: ${name}`,
        type: 'attestation',
        category: 'security',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          attestUri: str(provider.attestUri),
          status: str(provider.status),
          trustModel: str(provider.trustModel),
        },
        status: provider.status === 'Ready' ? 'healthy' : 'warning',
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Confidential Ledger
  // -----------------------------------------------------------------------
  {
    type: 'confidential-ledger',
    category: 'security',
    sdkPackage: '@azure/arm-confidentialledger',
    clientClass: 'ConfidentialLedger',
    listMethod: 'ledger.listBySubscription',
    importance: 5,
    mapResource: (ledger: any, subscriptionId: string) => {
      const name = ledger.name ?? 'unknown'
      const id = ledger.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ledger.location ?? 'unknown'
      const provState = ledger.properties?.provisioningState ?? ''
      return {
        id: `az-cledger-${name}`,
        label: `ConfLedger: ${name}`,
        type: 'confidential-ledger',
        category: 'security',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          ledgerUri: str(ledger.properties?.ledgerUri),
          identityServiceUri: str(ledger.properties?.identityServiceUri),
          ledgerType: str(ledger.properties?.ledgerType),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Managed HSM
  // -----------------------------------------------------------------------
  {
    type: 'hsm',
    category: 'security',
    sdkPackage: '@azure/arm-keyvault',
    clientClass: 'KeyVaultManagementClient',
    listMethod: 'managedHsms.listBySubscription',
    importance: 9,
    mapResource: (hsm: any, subscriptionId: string) => {
      const name = hsm.name ?? 'unknown'
      const id = hsm.id ?? ''
      const rg = extractResourceGroup(id)
      const location = hsm.location ?? 'unknown'
      const props = hsm.properties ?? {}
      const provState = props.provisioningState ?? ''
      return {
        id: `az-hsm-${name}`,
        label: `Managed HSM: ${name}`,
        type: 'hsm',
        category: 'security',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          hsmUri: str(props.hsmUri),
          statusMessage: str(props.statusMessage),
          enableSoftDelete: str(props.enableSoftDelete),
          enablePurgeProtection: str(props.enablePurgeProtection),
          softDeleteRetentionInDays: str(props.softDeleteRetentionInDays),
          publicNetworkAccess: str(props.publicNetworkAccess),
        },
        status: provisioningHealth(provState),
        importance: 9,
      }
    },
  },

  // =======================================================================
  // NETWORK
  // =======================================================================

  // -----------------------------------------------------------------------
  // Application Gateway
  // -----------------------------------------------------------------------
  {
    type: 'appgateway',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'applicationGateways.listAll',
    importance: 7,
    mapResource: (gw: any, subscriptionId: string) => {
      const name = gw.name ?? 'unknown'
      const id = gw.id ?? ''
      const rg = extractResourceGroup(id)
      const location = gw.location ?? 'unknown'
      const provState = gw.provisioningState ?? ''
      const sku = gw.sku ?? {}
      return {
        id: `az-appgw-${name}`,
        label: `AppGW: ${name}`,
        type: 'appgateway',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          skuName: str(sku.name),
          skuTier: str(sku.tier),
          skuCapacity: str(sku.capacity),
          provisioningState: provState,
          operationalState: str(gw.operationalState),
          enableHttp2: str(gw.enableHttp2),
          enableWaf: str(gw.webApplicationFirewallConfiguration?.enabled),
          firewallMode: str(gw.webApplicationFirewallConfiguration?.firewallMode),
          frontendPorts: (gw.frontendPorts ?? []).map((p: any) => str(p.port)).join(', '),
          backendPoolCount: str((gw.backendAddressPools ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Load Balancers
  // -----------------------------------------------------------------------
  {
    type: 'loadbalancer',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'loadBalancers.listAll',
    importance: 6,
    mapResource: (lb: any, subscriptionId: string) => {
      const name = lb.name ?? 'unknown'
      const id = lb.id ?? ''
      const rg = extractResourceGroup(id)
      const location = lb.location ?? 'unknown'
      const provState = lb.provisioningState ?? ''
      const sku = lb.sku ?? {}
      return {
        id: `az-lb-${name}`,
        label: `LB: ${name}`,
        type: 'loadbalancer',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          skuName: str(sku.name),
          skuTier: str(sku.tier),
          provisioningState: provState,
          frontendIpCount: str((lb.frontendIPConfigurations ?? []).length),
          backendPoolCount: str((lb.backendAddressPools ?? []).length),
          loadBalancingRuleCount: str((lb.loadBalancingRules ?? []).length),
          probeCount: str((lb.probes ?? []).length),
          inboundNatRuleCount: str((lb.inboundNatRules ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // VPN Gateway (Virtual Network Gateways)
  // -----------------------------------------------------------------------
  {
    type: 'vnet-gateway',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'virtualNetworkGateways.listAll',
    importance: 8,
    mapResource: (gw: any, subscriptionId: string) => {
      const name = gw.name ?? 'unknown'
      const id = gw.id ?? ''
      const rg = extractResourceGroup(id)
      const location = gw.location ?? 'unknown'
      const provState = gw.provisioningState ?? ''
      return {
        id: `az-vpngw-${name}`,
        label: `VPN GW: ${name}`,
        type: 'vnet-gateway',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          gatewayType: str(gw.gatewayType),
          vpnType: str(gw.vpnType),
          sku: gw.sku ? `${gw.sku.name ?? ''} (${gw.sku.tier ?? ''})` : '',
          enableBgp: str(gw.enableBgp),
          activeActive: str(gw.activeActive),
          vpnGatewayGeneration: str(gw.vpnGatewayGeneration),
          enablePrivateIpAddress: str(gw.enablePrivateIpAddress),
        },
        status: provisioningHealth(provState),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // ExpressRoute Circuits
  // -----------------------------------------------------------------------
  {
    type: 'express-route',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'expressRouteCircuits.listAll',
    importance: 9,
    mapResource: (circuit: any, subscriptionId: string) => {
      const name = circuit.name ?? 'unknown'
      const id = circuit.id ?? ''
      const rg = extractResourceGroup(id)
      const location = circuit.location ?? 'unknown'
      const provState = circuit.provisioningState ?? ''
      return {
        id: `az-er-${name}`,
        label: `ExpressRoute: ${name}`,
        type: 'express-route',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          circuitProvisioningState: str(circuit.circuitProvisioningState),
          serviceProviderProvisioningState: str(circuit.serviceProviderProvisioningState),
          sku: circuit.sku ? `${circuit.sku.name ?? ''} (${circuit.sku.tier ?? ''}, ${circuit.sku.family ?? ''})` : '',
          bandwidthInMbps: str(circuit.bandwidthInMbps),
          serviceProviderName: str(circuit.serviceProviderProperties?.serviceProviderName),
          peeringLocation: str(circuit.serviceProviderProperties?.peeringLocation),
          globalReachEnabled: str(circuit.globalReachEnabled),
        },
        status: provisioningHealth(provState),
        importance: 9,
      }
    },
  },

  // -----------------------------------------------------------------------
  // NAT Gateway
  // -----------------------------------------------------------------------
  {
    type: 'nat-gateway',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'natGateways.listAll',
    importance: 5,
    mapResource: (nat: any, subscriptionId: string) => {
      const name = nat.name ?? 'unknown'
      const id = nat.id ?? ''
      const rg = extractResourceGroup(id)
      const location = nat.location ?? 'unknown'
      const provState = nat.provisioningState ?? ''
      return {
        id: `az-nat-${name}`,
        label: `NAT GW: ${name}`,
        type: 'nat-gateway',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: nat.sku ? str(nat.sku.name) : '',
          idleTimeoutInMinutes: str(nat.idleTimeoutInMinutes),
          resourceGuid: str(nat.resourceGuid),
          zones: (nat.zones ?? []).join(', '),
          publicIpAddressCount: str((nat.publicIpAddresses ?? []).length),
          publicIpPrefixCount: str((nat.publicIpPrefixes ?? []).length),
          subnetCount: str((nat.subnets ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Firewall
  // -----------------------------------------------------------------------
  {
    type: 'firewall',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'azureFirewalls.listAll',
    importance: 8,
    mapResource: (fw: any, subscriptionId: string) => {
      const name = fw.name ?? 'unknown'
      const id = fw.id ?? ''
      const rg = extractResourceGroup(id)
      const location = fw.location ?? 'unknown'
      const provState = fw.provisioningState ?? ''
      return {
        id: `az-fw-${name}`,
        label: `Firewall: ${name}`,
        type: 'firewall',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: fw.sku ? `${fw.sku.name ?? ''} (${fw.sku.tier ?? ''})` : '',
          threatIntelMode: str(fw.threatIntelMode),
          firewallPolicyId: str(fw.firewallPolicy?.id),
          zones: (fw.zones ?? []).join(', '),
          ipConfigurationCount: str((fw.ipConfigurations ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Bastion Host
  // -----------------------------------------------------------------------
  {
    type: 'bastion',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'bastionHosts.list',
    importance: 6,
    mapResource: (bastion: any, subscriptionId: string) => {
      const name = bastion.name ?? 'unknown'
      const id = bastion.id ?? ''
      const rg = extractResourceGroup(id)
      const location = bastion.location ?? 'unknown'
      const provState = bastion.provisioningState ?? ''
      return {
        id: `az-bastion-${name}`,
        label: `Bastion: ${name}`,
        type: 'bastion',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: bastion.sku ? str(bastion.sku.name) : '',
          dnsName: str(bastion.dnsName),
          scaleUnits: str(bastion.scaleUnits),
          disableCopyPaste: str(bastion.disableCopyPaste),
          enableFileCopy: str(bastion.enableFileCopy),
          enableTunneling: str(bastion.enableTunneling),
          enableIpConnect: str(bastion.enableIpConnect),
          enableShareableLink: str(bastion.enableShareableLink),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Private Endpoints
  // -----------------------------------------------------------------------
  {
    type: 'private-endpoint',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'privateEndpoints.listBySubscription',
    importance: 5,
    mapResource: (pe: any, subscriptionId: string) => {
      const name = pe.name ?? 'unknown'
      const id = pe.id ?? ''
      const rg = extractResourceGroup(id)
      const location = pe.location ?? 'unknown'
      const provState = pe.provisioningState ?? ''
      return {
        id: `az-pe-${name}`,
        label: `PrivateEP: ${name}`,
        type: 'private-endpoint',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          subnetId: str(pe.subnet?.id),
          customDnsConfigs: str((pe.customDnsConfigs ?? []).length),
          privateLinkServiceConnections: str((pe.privateLinkServiceConnections ?? []).length),
          manualPrivateLinkServiceConnections: str((pe.manualPrivateLinkServiceConnections ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Private Link Services
  // -----------------------------------------------------------------------
  {
    type: 'private-link-service',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'privateLinkServices.listBySubscription',
    importance: 5,
    mapResource: (pls: any, subscriptionId: string) => {
      const name = pls.name ?? 'unknown'
      const id = pls.id ?? ''
      const rg = extractResourceGroup(id)
      const location = pls.location ?? 'unknown'
      const provState = pls.provisioningState ?? ''
      return {
        id: `az-pls-${name}`,
        label: `PrivateLinkSvc: ${name}`,
        type: 'private-link-service',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          alias: str(pls.alias),
          visibility: str(pls.visibility?.subscriptions?.length),
          enableProxyProtocol: str(pls.enableProxyProtocol),
          loadBalancerFrontendIpConfigCount: str((pls.loadBalancerFrontendIpConfigurations ?? []).length),
          ipConfigurationCount: str((pls.ipConfigurations ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Traffic Manager Profiles
  // -----------------------------------------------------------------------
  {
    type: 'traffic-manager',
    category: 'network',
    sdkPackage: '@azure/arm-trafficmanager',
    clientClass: 'TrafficManagerManagementClient',
    listMethod: 'profiles.listBySubscription',
    importance: 7,
    mapResource: (profile: any, subscriptionId: string) => {
      const name = profile.name ?? 'unknown'
      const id = profile.id ?? ''
      const rg = extractResourceGroup(id)
      return {
        id: `az-tm-${name}`,
        label: `TrafficMgr: ${name}`,
        type: 'traffic-manager',
        category: 'network',
        region: 'global',
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          profileStatus: str(profile.profileStatus),
          trafficRoutingMethod: str(profile.trafficRoutingMethod),
          dnsConfigRelativeName: str(profile.dnsConfig?.relativeName),
          dnsConfigFqdn: str(profile.dnsConfig?.fqdn),
          dnsConfigTtl: str(profile.dnsConfig?.ttl),
          monitorStatus: str(profile.monitorConfig?.profileMonitorStatus),
          monitorProtocol: str(profile.monitorConfig?.protocol),
          monitorPort: str(profile.monitorConfig?.port),
          monitorPath: str(profile.monitorConfig?.path),
          endpointCount: str((profile.endpoints ?? []).length),
        },
        status: profile.profileStatus === 'Enabled' ? 'healthy' : 'warning',
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Network Security Groups
  // -----------------------------------------------------------------------
  {
    type: 'nsg',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'networkSecurityGroups.listAll',
    importance: 5,
    mapResource: (nsg: any, subscriptionId: string) => {
      const name = nsg.name ?? 'unknown'
      const id = nsg.id ?? ''
      const rg = extractResourceGroup(id)
      const location = nsg.location ?? 'unknown'
      const provState = nsg.provisioningState ?? ''
      return {
        id: `az-nsg-${name}`,
        label: `NSG: ${name}`,
        type: 'nsg',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          resourceGuid: str(nsg.resourceGuid),
          securityRuleCount: str((nsg.securityRules ?? []).length),
          defaultSecurityRuleCount: str((nsg.defaultSecurityRules ?? []).length),
          subnetCount: str((nsg.subnets ?? []).length),
          networkInterfaceCount: str((nsg.networkInterfaces ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Route Tables
  // -----------------------------------------------------------------------
  {
    type: 'route-table',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'routeTables.listAll',
    importance: 4,
    mapResource: (rt: any, subscriptionId: string) => {
      const name = rt.name ?? 'unknown'
      const id = rt.id ?? ''
      const rg = extractResourceGroup(id)
      const location = rt.location ?? 'unknown'
      const provState = rt.provisioningState ?? ''
      return {
        id: `az-rt-${name}`,
        label: `RouteTable: ${name}`,
        type: 'route-table',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          disableBgpRoutePropagation: str(rt.disableBgpRoutePropagation),
          routeCount: str((rt.routes ?? []).length),
          subnetCount: str((rt.subnets ?? []).length),
          resourceGuid: str(rt.resourceGuid),
        },
        status: provisioningHealth(provState),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // DDoS Protection Plans
  // -----------------------------------------------------------------------
  {
    type: 'ddos-protection',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'ddosProtectionPlans.list',
    importance: 7,
    mapResource: (plan: any, subscriptionId: string) => {
      const name = plan.name ?? 'unknown'
      const id = plan.id ?? ''
      const rg = extractResourceGroup(id)
      const location = plan.location ?? 'unknown'
      const provState = plan.provisioningState ?? ''
      return {
        id: `az-ddos-${name}`,
        label: `DDoS Plan: ${name}`,
        type: 'ddos-protection',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          resourceGuid: str(plan.resourceGuid),
          virtualNetworkCount: str((plan.virtualNetworks ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Public IP Addresses
  // -----------------------------------------------------------------------
  {
    type: 'public-ip',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'publicIPAddresses.listAll',
    importance: 4,
    mapResource: (pip: any, subscriptionId: string) => {
      const name = pip.name ?? 'unknown'
      const id = pip.id ?? ''
      const rg = extractResourceGroup(id)
      const location = pip.location ?? 'unknown'
      const provState = pip.provisioningState ?? ''
      return {
        id: `az-pip-${name}`,
        label: `PublicIP: ${name}`,
        type: 'public-ip',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          ipAddress: str(pip.ipAddress),
          publicIPAllocationMethod: str(pip.publicIPAllocationMethod),
          publicIPAddressVersion: str(pip.publicIPAddressVersion),
          sku: pip.sku ? str(pip.sku.name) : '',
          skuTier: pip.sku ? str(pip.sku.tier) : '',
          idleTimeoutInMinutes: str(pip.idleTimeoutInMinutes),
          dnsSettingsFqdn: str(pip.dnsSettings?.fqdn),
          dnsSettingsDomainNameLabel: str(pip.dnsSettings?.domainNameLabel),
          zones: (pip.zones ?? []).join(', '),
        },
        status: provisioningHealth(provState),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // DNS Zones
  // -----------------------------------------------------------------------
  {
    type: 'dns-zone',
    category: 'network',
    sdkPackage: '@azure/arm-dns',
    clientClass: 'DnsManagementClient',
    listMethod: 'zones.list',
    importance: 6,
    mapResource: (zone: any, subscriptionId: string) => {
      const name = zone.name ?? 'unknown'
      const id = zone.id ?? ''
      const rg = extractResourceGroup(id)
      const location = zone.location ?? 'global'
      return {
        id: `az-dns-${name}`,
        label: `DNS: ${name}`,
        type: 'dns-zone',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          zoneType: str(zone.zoneType),
          numberOfRecordSets: str(zone.numberOfRecordSets),
          maxNumberOfRecordSets: str(zone.maxNumberOfRecordSets),
          nameServers: (zone.nameServers ?? []).join(', '),
        },
        status: 'healthy',
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Private DNS Zones
  // -----------------------------------------------------------------------
  {
    type: 'private-dns-zone',
    category: 'network',
    sdkPackage: '@azure/arm-privatedns',
    clientClass: 'PrivateDnsManagementClient',
    listMethod: 'privateZones.list',
    importance: 5,
    mapResource: (zone: any, subscriptionId: string) => {
      const name = zone.name ?? 'unknown'
      const id = zone.id ?? ''
      const rg = extractResourceGroup(id)
      const location = zone.location ?? 'global'
      const provState = zone.provisioningState ?? ''
      return {
        id: `az-pdns-${name}`,
        label: `PrivateDNS: ${name}`,
        type: 'private-dns-zone',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          numberOfRecordSets: str(zone.numberOfRecordSets),
          maxNumberOfRecordSets: str(zone.maxNumberOfRecordSets),
          numberOfVirtualNetworkLinks: str(zone.numberOfVirtualNetworkLinks),
          maxNumberOfVirtualNetworkLinks: str(zone.maxNumberOfVirtualNetworkLinks),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Virtual WAN
  // -----------------------------------------------------------------------
  {
    type: 'virtual-wan',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'virtualWans.list',
    importance: 7,
    mapResource: (wan: any, subscriptionId: string) => {
      const name = wan.name ?? 'unknown'
      const id = wan.id ?? ''
      const rg = extractResourceGroup(id)
      const location = wan.location ?? 'unknown'
      const provState = wan.provisioningState ?? ''
      return {
        id: `az-vwan-${name}`,
        label: `vWAN: ${name}`,
        type: 'virtual-wan',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          type: str(wan.typePropertiesType),
          disableVpnEncryption: str(wan.disableVpnEncryption),
          allowBranchToBranchTraffic: str(wan.allowBranchToBranchTraffic),
          allowVnetToVnetTraffic: str(wan.allowVnetToVnetTraffic),
          virtualHubCount: str((wan.virtualHubs ?? []).length),
          vpnSiteCount: str((wan.vpnSites ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Virtual Hub
  // -----------------------------------------------------------------------
  {
    type: 'virtual-hub',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'virtualHubs.list',
    importance: 6,
    mapResource: (hub: any, subscriptionId: string) => {
      const name = hub.name ?? 'unknown'
      const id = hub.id ?? ''
      const rg = extractResourceGroup(id)
      const location = hub.location ?? 'unknown'
      const provState = hub.provisioningState ?? ''
      return {
        id: `az-vhub-${name}`,
        label: `vHub: ${name}`,
        type: 'virtual-hub',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          addressPrefix: str(hub.addressPrefix),
          routingState: str(hub.routingState),
          virtualWanId: str(hub.virtualWan?.id),
          sku: str(hub.sku),
          virtualRouterAsn: str(hub.virtualRouterAsn),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Network Watcher
  // -----------------------------------------------------------------------
  {
    type: 'network-watcher',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'networkWatchers.listAll',
    importance: 3,
    mapResource: (nw: any, subscriptionId: string) => {
      const name = nw.name ?? 'unknown'
      const id = nw.id ?? ''
      const rg = extractResourceGroup(id)
      const location = nw.location ?? 'unknown'
      const provState = nw.provisioningState ?? ''
      return {
        id: `az-nw-${name}`,
        label: `NetWatcher: ${name}`,
        type: 'network-watcher',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
        },
        status: provisioningHealth(provState),
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IP Groups
  // -----------------------------------------------------------------------
  {
    type: 'ip-group',
    category: 'network',
    sdkPackage: '@azure/arm-network',
    clientClass: 'NetworkManagementClient',
    listMethod: 'ipGroups.list',
    importance: 3,
    mapResource: (ipg: any, subscriptionId: string) => {
      const name = ipg.name ?? 'unknown'
      const id = ipg.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ipg.location ?? 'unknown'
      const provState = ipg.provisioningState ?? ''
      return {
        id: `az-ipg-${name}`,
        label: `IPGroup: ${name}`,
        type: 'ip-group',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          ipAddressCount: str((ipg.ipAddresses ?? []).length),
          firewallCount: str((ipg.firewalls ?? []).length),
          firewallPolicyCount: str((ipg.firewallPolicies ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CDN Profiles
  // -----------------------------------------------------------------------
  {
    type: 'cdn-profile',
    category: 'network',
    sdkPackage: '@azure/arm-cdn',
    clientClass: 'CdnManagementClient',
    listMethod: 'profiles.list',
    importance: 6,
    mapResource: (profile: any, subscriptionId: string) => {
      const name = profile.name ?? 'unknown'
      const id = profile.id ?? ''
      const rg = extractResourceGroup(id)
      const location = profile.location ?? 'global'
      const provState = profile.provisioningState ?? ''
      return {
        id: `az-cdn-${name}`,
        label: `CDN: ${name}`,
        type: 'cdn-profile',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: profile.sku ? str(profile.sku.name) : '',
          resourceState: str(profile.resourceState),
          frontDoorId: str(profile.frontDoorId),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Front Door WAF Policies
  // -----------------------------------------------------------------------
  {
    type: 'front-door-waf',
    category: 'network',
    sdkPackage: '@azure/arm-frontdoor',
    clientClass: 'FrontDoorManagementClient',
    listMethod: 'policies.list',
    importance: 7,
    mapResource: (policy: any, subscriptionId: string) => {
      const name = policy.name ?? 'unknown'
      const id = policy.id ?? ''
      const rg = extractResourceGroup(id)
      const location = policy.location ?? 'global'
      const provState = policy.provisioningState ?? ''
      return {
        id: `az-fdwaf-${name}`,
        label: `FD WAF: ${name}`,
        type: 'front-door-waf',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          resourceState: str(policy.resourceState),
          policySettings: str(policy.policySettings?.enabledState),
          mode: str(policy.policySettings?.mode),
          customRuleCount: str((policy.customRules?.rules ?? []).length),
          managedRuleSetCount: str((policy.managedRules?.managedRuleSets ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Web PubSub
  // -----------------------------------------------------------------------
  {
    type: 'web-pubsub',
    category: 'network',
    sdkPackage: '@azure/arm-webpubsub',
    clientClass: 'WebPubSubManagementClient',
    listMethod: 'webPubSub.listBySubscription',
    importance: 5,
    mapResource: (wps: any, subscriptionId: string) => {
      const name = wps.name ?? 'unknown'
      const id = wps.id ?? ''
      const rg = extractResourceGroup(id)
      const location = wps.location ?? 'unknown'
      const provState = wps.provisioningState ?? ''
      return {
        id: `az-wps-${name}`,
        label: `WebPubSub: ${name}`,
        type: 'web-pubsub',
        category: 'network',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          hostName: str(wps.hostName),
          externalIP: str(wps.externalIP),
          sku: wps.sku ? `${wps.sku.name ?? ''} (capacity: ${wps.sku.capacity ?? ''})` : '',
          version: str(wps.version),
          publicNetworkAccess: str(wps.publicNetworkAccess),
          disableLocalAuth: str(wps.disableLocalAuth),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // CDN
  // =======================================================================

  // -----------------------------------------------------------------------
  // Front Door Standard/Premium (via CDN profiles, filtered by SKU)
  // -----------------------------------------------------------------------
  {
    type: 'frontdoor',
    category: 'cdn',
    sdkPackage: '@azure/arm-cdn',
    clientClass: 'CdnManagementClient',
    listMethod: 'profiles.list',
    importance: 8,
    mapResource: (profile: any, subscriptionId: string) => {
      const name = profile.name ?? 'unknown'
      const id = profile.id ?? ''
      const rg = extractResourceGroup(id)
      const location = profile.location ?? 'global'
      const provState = profile.provisioningState ?? ''
      return {
        id: `az-fd-${name}`,
        label: `FrontDoor: ${name}`,
        type: 'frontdoor',
        category: 'cdn',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: profile.sku ? str(profile.sku.name) : '',
          resourceState: str(profile.resourceState),
          frontDoorId: str(profile.frontDoorId),
          originResponseTimeoutSeconds: str(profile.originResponseTimeoutSeconds),
        },
        status: provisioningHealth(provState),
        importance: 8,
      }
    },
  },

  // =======================================================================
  // CONTAINER
  // =======================================================================

  // -----------------------------------------------------------------------
  // Container Registry
  // -----------------------------------------------------------------------
  {
    type: 'acr',
    category: 'container',
    sdkPackage: '@azure/arm-containerregistry',
    clientClass: 'ContainerRegistryManagementClient',
    listMethod: 'registries.list',
    importance: 7,
    mapResource: (registry: any, subscriptionId: string) => {
      const name = registry.name ?? 'unknown'
      const id = registry.id ?? ''
      const rg = extractResourceGroup(id)
      const location = registry.location ?? 'unknown'
      const provState = registry.provisioningState ?? ''
      return {
        id: `az-acr-${name}`,
        label: `ACR: ${name}`,
        type: 'acr',
        category: 'container',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          loginServer: str(registry.loginServer),
          sku: registry.sku ? str(registry.sku.name) : '',
          provisioningState: provState,
          adminUserEnabled: str(registry.adminUserEnabled),
          publicNetworkAccess: str(registry.publicNetworkAccess),
          zoneRedundancy: str(registry.zoneRedundancy),
          creationDate: registry.creationDate?.toISOString?.() ?? str(registry.creationDate),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // =======================================================================
  // SERVERLESS
  // =======================================================================

  // -----------------------------------------------------------------------
  // App Configuration -- Stores
  // -----------------------------------------------------------------------
  {
    type: 'appconfig',
    category: 'serverless',
    sdkPackage: '@azure/arm-appconfiguration',
    clientClass: 'AppConfigurationManagementClient',
    listMethod: 'configurationStores.list',
    importance: 5,
    mapResource: (store: any, subscriptionId: string) => {
      const name = store.name ?? 'unknown'
      const id = store.id ?? ''
      const rg = extractResourceGroup(id)
      const location = store.location ?? 'unknown'
      const provState = store.provisioningState ?? ''
      return {
        id: `az-appconfig-${name}`,
        label: `AppConfig: ${name}`,
        type: 'appconfig',
        category: 'serverless',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          endpoint: str(store.endpoint),
          sku: store.sku ? str(store.sku.name) : '',
          provisioningState: provState,
          publicNetworkAccess: str(store.publicNetworkAccess),
          disableLocalAuth: str(store.disableLocalAuth),
          softDeleteRetentionInDays: str(store.softDeleteRetentionInDays),
          enablePurgeProtection: str(store.enablePurgeProtection),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Logic Apps (Workflows)
  // -----------------------------------------------------------------------
  {
    type: 'logic-app',
    category: 'serverless',
    sdkPackage: '@azure/arm-logic',
    clientClass: 'LogicManagementClient',
    listMethod: 'workflows.listBySubscription',
    importance: 6,
    mapResource: (wf: any, subscriptionId: string) => {
      const name = wf.name ?? 'unknown'
      const id = wf.id ?? ''
      const rg = extractResourceGroup(id)
      const location = wf.location ?? 'unknown'
      const provState = wf.provisioningState ?? ''
      const state = wf.state ?? ''
      return {
        id: `az-logic-${name}`,
        label: `LogicApp: ${name}`,
        type: 'logic-app',
        category: 'serverless',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          state,
          sku: wf.sku ? str(wf.sku.name) : '',
          version: str(wf.version),
          accessEndpoint: str(wf.accessEndpoint),
          createdTime: wf.createdTime?.toISOString?.() ?? str(wf.createdTime),
          changedTime: wf.changedTime?.toISOString?.() ?? str(wf.changedTime),
        },
        status: state.toLowerCase() === 'enabled' ? 'healthy' : provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // API Management
  // -----------------------------------------------------------------------
  {
    type: 'api-management',
    category: 'serverless',
    sdkPackage: '@azure/arm-apimanagement',
    clientClass: 'ApiManagementClient',
    listMethod: 'apiManagementService.list',
    importance: 8,
    mapResource: (svc: any, subscriptionId: string) => {
      const name = svc.name ?? 'unknown'
      const id = svc.id ?? ''
      const rg = extractResourceGroup(id)
      const location = svc.location ?? 'unknown'
      const provState = svc.provisioningState ?? ''
      return {
        id: `az-apim-${name}`,
        label: `APIM: ${name}`,
        type: 'api-management',
        category: 'serverless',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          targetProvisioningState: str(svc.targetProvisioningState),
          sku: svc.sku ? `${svc.sku.name ?? ''} (capacity: ${svc.sku.capacity ?? ''})` : '',
          publisherEmail: str(svc.publisherEmail),
          publisherName: str(svc.publisherName),
          gatewayUrl: str(svc.gatewayUrl),
          portalUrl: str(svc.portalUrl),
          managementApiUrl: str(svc.managementApiUrl),
          scmUrl: str(svc.scmUrl),
          platformVersion: str(svc.platformVersion),
          publicNetworkAccess: str(svc.publicNetworkAccess),
          virtualNetworkType: str(svc.virtualNetworkType),
        },
        status: provisioningHealth(provState),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Static Web Apps
  // -----------------------------------------------------------------------
  {
    type: 'static-web-app',
    category: 'serverless',
    sdkPackage: '@azure/arm-appservice',
    clientClass: 'WebSiteManagementClient',
    listMethod: 'staticSites.list',
    importance: 5,
    mapResource: (site: any, subscriptionId: string) => {
      const name = site.name ?? 'unknown'
      const id = site.id ?? ''
      const rg = extractResourceGroup(id)
      const location = site.location ?? 'unknown'
      return {
        id: `az-swa-${name}`,
        label: `StaticApp: ${name}`,
        type: 'static-web-app',
        category: 'serverless',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          defaultHostname: str(site.defaultHostname),
          sku: site.sku ? str(site.sku.name) : '',
          repositoryUrl: str(site.repositoryUrl),
          branch: str(site.branch),
          provider: str(site.provider),
          contentDistributionEndpoint: str(site.contentDistributionEndpoint),
          stagingEnvironmentPolicy: str(site.stagingEnvironmentPolicy),
          allowConfigFileUpdates: str(site.allowConfigFileUpdates),
        },
        status: 'healthy',
        importance: 5,
      }
    },
  },

  // =======================================================================
  // COMPUTE
  // =======================================================================

  // -----------------------------------------------------------------------
  // VM Scale Sets
  // -----------------------------------------------------------------------
  {
    type: 'vm-scaleset',
    category: 'compute',
    sdkPackage: '@azure/arm-compute',
    clientClass: 'ComputeManagementClient',
    listMethod: 'virtualMachineScaleSets.listAll',
    importance: 8,
    mapResource: (vmss: any, subscriptionId: string) => {
      const name = vmss.name ?? 'unknown'
      const id = vmss.id ?? ''
      const rg = extractResourceGroup(id)
      const location = vmss.location ?? 'unknown'
      const provState = vmss.provisioningState ?? ''
      return {
        id: `az-vmss-${name}`,
        label: `VMSS: ${name}`,
        type: 'vm-scaleset',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: vmss.sku ? `${vmss.sku.name ?? ''} (capacity: ${vmss.sku.capacity ?? ''})` : '',
          skuTier: str(vmss.sku?.tier),
          uniqueId: str(vmss.uniqueId),
          overprovision: str(vmss.overprovision),
          singlePlacementGroup: str(vmss.singlePlacementGroup),
          upgradePolicy: str(vmss.upgradePolicy?.mode),
          platformFaultDomainCount: str(vmss.platformFaultDomainCount),
          orchestrationMode: str(vmss.orchestrationMode),
          zones: (vmss.zones ?? []).join(', '),
        },
        status: provisioningHealth(provState),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Availability Sets
  // -----------------------------------------------------------------------
  {
    type: 'availability-set',
    category: 'compute',
    sdkPackage: '@azure/arm-compute',
    clientClass: 'ComputeManagementClient',
    listMethod: 'availabilitySets.listBySubscription',
    importance: 5,
    mapResource: (avSet: any, subscriptionId: string) => {
      const name = avSet.name ?? 'unknown'
      const id = avSet.id ?? ''
      const rg = extractResourceGroup(id)
      const location = avSet.location ?? 'unknown'
      return {
        id: `az-avset-${name}`,
        label: `AvailSet: ${name}`,
        type: 'availability-set',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          sku: avSet.sku ? str(avSet.sku.name) : '',
          platformFaultDomainCount: str(avSet.platformFaultDomainCount),
          platformUpdateDomainCount: str(avSet.platformUpdateDomainCount),
          virtualMachineCount: str((avSet.virtualMachines ?? []).length),
        },
        status: 'healthy',
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Managed Disks
  // -----------------------------------------------------------------------
  {
    type: 'disk',
    category: 'compute',
    sdkPackage: '@azure/arm-compute',
    clientClass: 'ComputeManagementClient',
    listMethod: 'disks.list',
    importance: 4,
    mapResource: (disk: any, subscriptionId: string) => {
      const name = disk.name ?? 'unknown'
      const id = disk.id ?? ''
      const rg = extractResourceGroup(id)
      const location = disk.location ?? 'unknown'
      const provState = disk.provisioningState ?? ''
      return {
        id: `az-disk-${name}`,
        label: `Disk: ${name}`,
        type: 'disk',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          diskState: str(disk.diskState),
          diskSizeGB: str(disk.diskSizeGB),
          sku: disk.sku ? str(disk.sku.name) : '',
          skuTier: disk.sku ? str(disk.sku.tier) : '',
          osType: str(disk.osType),
          creationSourceType: str(disk.creationData?.createOption),
          timeCreated: disk.timeCreated?.toISOString?.() ?? str(disk.timeCreated),
          uniqueId: str(disk.uniqueId),
          encryption: str(disk.encryption?.type),
          networkAccessPolicy: str(disk.networkAccessPolicy),
          publicNetworkAccess: str(disk.publicNetworkAccess),
          zones: (disk.zones ?? []).join(', '),
        },
        status: provisioningHealth(provState),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // VM Images
  // -----------------------------------------------------------------------
  {
    type: 'image',
    category: 'compute',
    sdkPackage: '@azure/arm-compute',
    clientClass: 'ComputeManagementClient',
    listMethod: 'images.list',
    importance: 3,
    mapResource: (img: any, subscriptionId: string) => {
      const name = img.name ?? 'unknown'
      const id = img.id ?? ''
      const rg = extractResourceGroup(id)
      const location = img.location ?? 'unknown'
      const provState = img.provisioningState ?? ''
      return {
        id: `az-img-${name}`,
        label: `Image: ${name}`,
        type: 'image',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sourceVmId: str(img.sourceVirtualMachine?.id),
          hyperVGeneration: str(img.hyperVGeneration),
          osDiskOsType: str(img.storageProfile?.osDisk?.osType),
          osDiskOsState: str(img.storageProfile?.osDisk?.osState),
          osDiskStorageAccountType: str(img.storageProfile?.osDisk?.storageAccountType),
          dataDiskCount: str((img.storageProfile?.dataDisks ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Disk Snapshots
  // -----------------------------------------------------------------------
  {
    type: 'snapshot',
    category: 'compute',
    sdkPackage: '@azure/arm-compute',
    clientClass: 'ComputeManagementClient',
    listMethod: 'snapshots.list',
    importance: 3,
    mapResource: (snap: any, subscriptionId: string) => {
      const name = snap.name ?? 'unknown'
      const id = snap.id ?? ''
      const rg = extractResourceGroup(id)
      const location = snap.location ?? 'unknown'
      const provState = snap.provisioningState ?? ''
      return {
        id: `az-snap-${name}`,
        label: `Snapshot: ${name}`,
        type: 'snapshot',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          diskSizeGB: str(snap.diskSizeGB),
          sku: snap.sku ? str(snap.sku.name) : '',
          osType: str(snap.osType),
          creationSourceType: str(snap.creationData?.createOption),
          sourceResourceId: str(snap.creationData?.sourceResourceId),
          timeCreated: snap.timeCreated?.toISOString?.() ?? str(snap.timeCreated),
          uniqueId: str(snap.uniqueId),
          incremental: str(snap.incremental),
          networkAccessPolicy: str(snap.networkAccessPolicy),
          publicNetworkAccess: str(snap.publicNetworkAccess),
        },
        status: provisioningHealth(provState),
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Batch Accounts
  // -----------------------------------------------------------------------
  {
    type: 'batch-account',
    category: 'compute',
    sdkPackage: '@azure/arm-batch',
    clientClass: 'BatchManagementClient',
    listMethod: 'batchAccount.list',
    importance: 6,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      const provState = account.provisioningState ?? ''
      return {
        id: `az-batch-${name}`,
        label: `Batch: ${name}`,
        type: 'batch-account',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          accountEndpoint: str(account.accountEndpoint),
          poolAllocationMode: str(account.poolAllocationMode),
          dedicatedCoreQuota: str(account.dedicatedCoreQuota),
          lowPriorityCoreQuota: str(account.lowPriorityCoreQuota),
          poolQuota: str(account.poolQuota),
          activeJobAndJobScheduleQuota: str(account.activeJobAndJobScheduleQuota),
          publicNetworkAccess: str(account.publicNetworkAccess),
          autoStorageAccountId: str(account.autoStorage?.storageAccountId),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Spring Apps
  // -----------------------------------------------------------------------
  {
    type: 'spring-apps',
    category: 'compute',
    sdkPackage: '@azure/arm-appplatform',
    clientClass: 'AppPlatformManagementClient',
    listMethod: 'services.listBySubscription',
    importance: 6,
    mapResource: (svc: any, subscriptionId: string) => {
      const name = svc.name ?? 'unknown'
      const id = svc.id ?? ''
      const rg = extractResourceGroup(id)
      const location = svc.location ?? 'unknown'
      const provState = svc.properties?.provisioningState ?? ''
      return {
        id: `az-spring-${name}`,
        label: `SpringApps: ${name}`,
        type: 'spring-apps',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: svc.sku ? `${svc.sku.name ?? ''} (${svc.sku.tier ?? ''})` : '',
          version: str(svc.properties?.version),
          serviceId: str(svc.properties?.serviceId),
          powerState: str(svc.properties?.powerState),
          zoneRedundant: str(svc.properties?.zoneRedundant),
          fqdn: str(svc.properties?.fqdn),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Container Apps
  // -----------------------------------------------------------------------
  {
    type: 'container-app',
    category: 'compute',
    sdkPackage: '@azure/arm-appcontainers',
    clientClass: 'ContainerAppsAPIClient',
    listMethod: 'containerApps.listBySubscription',
    importance: 7,
    mapResource: (app: any, subscriptionId: string) => {
      const name = app.name ?? 'unknown'
      const id = app.id ?? ''
      const rg = extractResourceGroup(id)
      const location = app.location ?? 'unknown'
      const provState = app.provisioningState ?? ''
      return {
        id: `az-capp-${name}`,
        label: `ContainerApp: ${name}`,
        type: 'container-app',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          runningStatus: str(app.runningStatus),
          managedEnvironmentId: str(app.managedEnvironmentId),
          latestRevisionName: str(app.latestRevisionName),
          latestRevisionFqdn: str(app.latestRevisionFqdn),
          latestReadyRevisionName: str(app.latestReadyRevisionName),
          outboundIpAddresses: (app.outboundIpAddresses ?? []).join(', '),
          customDomainVerificationId: str(app.customDomainVerificationId),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Container App Environments
  // -----------------------------------------------------------------------
  {
    type: 'container-app-env',
    category: 'compute',
    sdkPackage: '@azure/arm-appcontainers',
    clientClass: 'ContainerAppsAPIClient',
    listMethod: 'managedEnvironments.listBySubscription',
    importance: 6,
    mapResource: (env: any, subscriptionId: string) => {
      const name = env.name ?? 'unknown'
      const id = env.id ?? ''
      const rg = extractResourceGroup(id)
      const location = env.location ?? 'unknown'
      const provState = env.provisioningState ?? ''
      return {
        id: `az-cappenv-${name}`,
        label: `ContainerAppEnv: ${name}`,
        type: 'container-app-env',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          defaultDomain: str(env.defaultDomain),
          staticIp: str(env.staticIp),
          deploymentErrors: str(env.deploymentErrors),
          infrastructureResourceGroup: str(env.infrastructureResourceGroup),
          zoneRedundant: str(env.zoneRedundant),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Services
  // -----------------------------------------------------------------------
  {
    type: 'cloud-service',
    category: 'compute',
    sdkPackage: '@azure/arm-compute',
    clientClass: 'ComputeManagementClient',
    listMethod: 'cloudServices.listAll',
    importance: 5,
    mapResource: (cs: any, subscriptionId: string) => {
      const name = cs.name ?? 'unknown'
      const id = cs.id ?? ''
      const rg = extractResourceGroup(id)
      const location = cs.location ?? 'unknown'
      const provState = cs.properties?.provisioningState ?? ''
      return {
        id: `az-cs-${name}`,
        label: `CloudService: ${name}`,
        type: 'cloud-service',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          uniqueId: str(cs.properties?.uniqueId),
          upgradeMode: str(cs.properties?.upgradeMode),
          allowModelOverride: str(cs.properties?.allowModelOverride),
          zones: (cs.zones ?? []).join(', '),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Dedicated Host Groups
  // -----------------------------------------------------------------------
  {
    type: 'dedicated-host',
    category: 'compute',
    sdkPackage: '@azure/arm-compute',
    clientClass: 'ComputeManagementClient',
    listMethod: 'dedicatedHostGroups.listBySubscription',
    importance: 6,
    mapResource: (hg: any, subscriptionId: string) => {
      const name = hg.name ?? 'unknown'
      const id = hg.id ?? ''
      const rg = extractResourceGroup(id)
      const location = hg.location ?? 'unknown'
      return {
        id: `az-dhost-${name}`,
        label: `DedicatedHostGrp: ${name}`,
        type: 'dedicated-host',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          platformFaultDomainCount: str(hg.platformFaultDomainCount),
          supportAutomaticPlacement: str(hg.supportAutomaticPlacement),
          hostCount: str((hg.hosts ?? []).length),
          zones: (hg.zones ?? []).join(', '),
        },
        status: 'healthy',
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Proximity Placement Groups
  // -----------------------------------------------------------------------
  {
    type: 'proximity-placement',
    category: 'compute',
    sdkPackage: '@azure/arm-compute',
    clientClass: 'ComputeManagementClient',
    listMethod: 'proximityPlacementGroups.listBySubscription',
    importance: 3,
    mapResource: (ppg: any, subscriptionId: string) => {
      const name = ppg.name ?? 'unknown'
      const id = ppg.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ppg.location ?? 'unknown'
      return {
        id: `az-ppg-${name}`,
        label: `ProximityPG: ${name}`,
        type: 'proximity-placement',
        category: 'compute',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          proximityPlacementGroupType: str(ppg.proximityPlacementGroupType),
          virtualMachineCount: str((ppg.virtualMachines ?? []).length),
          virtualMachineScaleSetCount: str((ppg.virtualMachineScaleSets ?? []).length),
          availabilitySetCount: str((ppg.availabilitySets ?? []).length),
        },
        status: 'healthy',
        importance: 3,
      }
    },
  },

  // =======================================================================
  // STORAGE
  // =======================================================================

  // -----------------------------------------------------------------------
  // Managed Lustre / HPC Cache
  // -----------------------------------------------------------------------
  {
    type: 'managed-lustre',
    category: 'storage',
    sdkPackage: '@azure/arm-storagecache',
    clientClass: 'StorageCacheManagementClient',
    listMethod: 'caches.list',
    importance: 6,
    mapResource: (cache: any, subscriptionId: string) => {
      const name = cache.name ?? 'unknown'
      const id = cache.id ?? ''
      const rg = extractResourceGroup(id)
      const location = cache.location ?? 'unknown'
      const provState = cache.provisioningState ?? ''
      return {
        id: `az-lustre-${name}`,
        label: `StorageCache: ${name}`,
        type: 'managed-lustre',
        category: 'storage',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          cacheSizeGB: str(cache.cacheSizeGB),
          health: str(cache.health?.state),
          healthStatusDescription: str(cache.health?.statusDescription),
          sku: cache.sku ? str(cache.sku.name) : '',
          mountAddresses: (cache.mountAddresses ?? []).join(', '),
          subnetUri: str(cache.subnet),
          upgradeStatus: str(cache.upgradeStatus?.currentFirmwareVersion),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // NetApp Files Accounts
  // -----------------------------------------------------------------------
  {
    type: 'netapp',
    category: 'storage',
    sdkPackage: '@azure/arm-netapp',
    clientClass: 'NetAppManagementClient',
    listMethod: 'accounts.list',
    importance: 6,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      const provState = account.provisioningState ?? ''
      return {
        id: `az-netapp-${name}`,
        label: `NetApp: ${name}`,
        type: 'netapp',
        category: 'storage',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          disableShowmount: str(account.disableShowmount),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // HPC Cache (same SDK as managed-lustre)
  // -----------------------------------------------------------------------
  {
    type: 'hpc-cache',
    category: 'storage',
    sdkPackage: '@azure/arm-storagecache',
    clientClass: 'StorageCacheManagementClient',
    listMethod: 'caches.list',
    importance: 6,
    mapResource: (cache: any, subscriptionId: string) => {
      const name = cache.name ?? 'unknown'
      const id = cache.id ?? ''
      const rg = extractResourceGroup(id)
      const location = cache.location ?? 'unknown'
      const provState = cache.provisioningState ?? ''
      return {
        id: `az-hpccache-${name}`,
        label: `HPC Cache: ${name}`,
        type: 'hpc-cache',
        category: 'storage',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          cacheSizeGB: str(cache.cacheSizeGB),
          health: str(cache.health?.state),
          healthStatusDescription: str(cache.health?.statusDescription),
          sku: cache.sku ? str(cache.sku.name) : '',
          mountAddresses: (cache.mountAddresses ?? []).join(', '),
          subnetUri: str(cache.subnet),
          storageTargetCount: str((cache.storageTargets ?? []).length),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Data Lake Storage Gen1
  // -----------------------------------------------------------------------
  {
    type: 'data-lake-store',
    category: 'storage',
    sdkPackage: '@azure/arm-datalake-analytics',
    clientClass: 'DataLakeStoreAccountManagementClient',
    listMethod: 'accounts.list',
    importance: 5,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      const state = account.state ?? ''
      const provState = account.provisioningState ?? ''
      return {
        id: `az-dls-${name}`,
        label: `DataLake: ${name}`,
        type: 'data-lake-store',
        category: 'storage',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          state,
          endpoint: str(account.endpoint),
          accountId: str(account.accountId),
          encryptionState: str(account.encryptionState),
          firewallState: str(account.firewallState),
        },
        status: provisioningHealth(state),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Storage Mover
  // -----------------------------------------------------------------------
  {
    type: 'storage-mover',
    category: 'storage',
    sdkPackage: '@azure/arm-storagemover',
    clientClass: 'StorageMoverClient',
    listMethod: 'list',
    importance: 4,
    mapResource: (mover: any, subscriptionId: string) => {
      const name = mover.name ?? 'unknown'
      const id = mover.id ?? ''
      const rg = extractResourceGroup(id)
      const location = mover.location ?? 'unknown'
      const provState = mover.provisioningState ?? ''
      return {
        id: `az-smover-${name}`,
        label: `StorageMover: ${name}`,
        type: 'storage-mover',
        category: 'storage',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          description: str(mover.description),
        },
        status: provisioningHealth(provState),
        importance: 4,
      }
    },
  },

  // =======================================================================
  // ANALYTICS
  // =======================================================================

  // -----------------------------------------------------------------------
  // Synapse Analytics Workspaces
  // -----------------------------------------------------------------------
  {
    type: 'synapse-workspace',
    category: 'analytics',
    sdkPackage: '@azure/arm-synapse',
    clientClass: 'SynapseManagementClient',
    listMethod: 'workspaces.list',
    importance: 8,
    mapResource: (ws: any, subscriptionId: string) => {
      const name = ws.name ?? 'unknown'
      const id = ws.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ws.location ?? 'unknown'
      const provState = ws.provisioningState ?? ''
      return {
        id: `az-synapse-${name}`,
        label: `Synapse: ${name}`,
        type: 'synapse-workspace',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sqlAdministratorLogin: str(ws.sqlAdministratorLogin),
          managedResourceGroupName: str(ws.managedResourceGroupName),
          defaultDataLakeStorageAccountUrl: str(ws.defaultDataLakeStorage?.accountUrl),
          defaultDataLakeStorageFilesystem: str(ws.defaultDataLakeStorage?.filesystem),
          connectivityEndpoints: ws.connectivityEndpoints ? Object.keys(ws.connectivityEndpoints).join(', ') : '',
          publicNetworkAccess: str(ws.publicNetworkAccess),
          managedVirtualNetwork: str(ws.managedVirtualNetwork),
          workspaceUID: str(ws.workspaceUID),
        },
        status: provisioningHealth(provState),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Data Factory
  // -----------------------------------------------------------------------
  {
    type: 'data-factory',
    category: 'analytics',
    sdkPackage: '@azure/arm-datafactory',
    clientClass: 'DataFactoryManagementClient',
    listMethod: 'factories.list',
    importance: 7,
    mapResource: (factory: any, subscriptionId: string) => {
      const name = factory.name ?? 'unknown'
      const id = factory.id ?? ''
      const rg = extractResourceGroup(id)
      const location = factory.location ?? 'unknown'
      const provState = factory.provisioningState ?? ''
      return {
        id: `az-adf-${name}`,
        label: `DataFactory: ${name}`,
        type: 'data-factory',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          version: str(factory.version),
          createTime: factory.createTime?.toISOString?.() ?? str(factory.createTime),
          publicNetworkAccess: str(factory.publicNetworkAccess),
          repoConfigurationType: str(factory.repoConfiguration?.type),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Databricks Workspaces
  // -----------------------------------------------------------------------
  {
    type: 'databricks-workspace',
    category: 'analytics',
    sdkPackage: '@azure/arm-databricks',
    clientClass: 'AzureDatabricksManagementClient',
    listMethod: 'workspaces.listBySubscription',
    importance: 8,
    mapResource: (ws: any, subscriptionId: string) => {
      const name = ws.name ?? 'unknown'
      const id = ws.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ws.location ?? 'unknown'
      const provState = ws.provisioningState ?? ''
      return {
        id: `az-dbricks-${name}`,
        label: `Databricks: ${name}`,
        type: 'databricks-workspace',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: ws.sku ? str(ws.sku.name) : '',
          managedResourceGroupId: str(ws.managedResourceGroupId),
          workspaceUrl: str(ws.workspaceUrl),
          workspaceId: str(ws.workspaceId),
          storageAccountIdentityResourceId: str(ws.storageAccountIdentity?.resourceId),
          publicNetworkAccess: str(ws.publicNetworkAccess),
          requiredNsgRules: str(ws.requiredNsgRules),
        },
        status: provisioningHealth(provState),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Stream Analytics Jobs
  // -----------------------------------------------------------------------
  {
    type: 'stream-analytics',
    category: 'analytics',
    sdkPackage: '@azure/arm-streamanalytics',
    clientClass: 'StreamAnalyticsManagementClient',
    listMethod: 'streamingJobs.list',
    importance: 6,
    mapResource: (job: any, subscriptionId: string) => {
      const name = job.name ?? 'unknown'
      const id = job.id ?? ''
      const rg = extractResourceGroup(id)
      const location = job.location ?? 'unknown'
      const provState = job.provisioningState ?? ''
      const jobState = job.jobState ?? ''
      return {
        id: `az-asa-${name}`,
        label: `StreamAnalytics: ${name}`,
        type: 'stream-analytics',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          jobState,
          sku: job.sku ? str(job.sku.name) : '',
          compatibilityLevel: str(job.compatibilityLevel),
          jobId: str(job.jobId),
          createdDate: job.createdDate?.toISOString?.() ?? str(job.createdDate),
          lastOutputEventTime: str(job.lastOutputEventTime),
          eventsOutOfOrderPolicy: str(job.eventsOutOfOrderPolicy),
          outputStartMode: str(job.outputStartMode),
        },
        status: jobState.toLowerCase() === 'running' ? 'healthy' : provisioningHealth(jobState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // HDInsight Clusters
  // -----------------------------------------------------------------------
  {
    type: 'hdinsight',
    category: 'analytics',
    sdkPackage: '@azure/arm-hdinsight',
    clientClass: 'HDInsightManagementClient',
    listMethod: 'clusters.list',
    importance: 7,
    mapResource: (cluster: any, subscriptionId: string) => {
      const name = cluster.name ?? 'unknown'
      const id = cluster.id ?? ''
      const rg = extractResourceGroup(id)
      const location = cluster.location ?? 'unknown'
      const props = cluster.properties ?? {}
      const state = props.clusterState ?? ''
      return {
        id: `az-hdi-${name}`,
        label: `HDInsight: ${name}`,
        type: 'hdinsight',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          clusterState: state,
          clusterVersion: str(props.clusterVersion),
          osType: str(props.osType),
          tier: str(props.tier),
          clusterDefinitionKind: str(props.clusterDefinition?.kind),
          createdDate: str(props.createdDate),
          connectivityEndpoints: (props.connectivityEndpoints ?? []).map((e: any) => `${e.name}:${e.port}`).join(', '),
          quotaInfoCoresUsed: str(props.quotaInfo?.coresUsed),
        },
        status: state.toLowerCase() === 'running' ? 'healthy' : provisioningHealth(state),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Microsoft Purview
  // -----------------------------------------------------------------------
  {
    type: 'purview',
    category: 'analytics',
    sdkPackage: '@azure/arm-purview',
    clientClass: 'PurviewManagementClient',
    listMethod: 'accounts.listBySubscription',
    importance: 7,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      const provState = account.provisioningState ?? ''
      return {
        id: `az-purview-${name}`,
        label: `Purview: ${name}`,
        type: 'purview',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: account.sku ? str(account.sku.name) : '',
          friendlyName: str(account.friendlyName),
          cloudConnectorsAwsExternalId: str(account.cloudConnectors?.awsExternalId),
          managedResourceGroupName: str(account.managedResourceGroupName),
          publicNetworkAccess: str(account.publicNetworkAccess),
          catalogEndpoint: str(account.endpoints?.catalog),
          scanEndpoint: str(account.endpoints?.scan),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Analysis Services
  // -----------------------------------------------------------------------
  {
    type: 'analysis-services',
    category: 'analytics',
    sdkPackage: '@azure/arm-analysisservices',
    clientClass: 'AnalysisServicesManagementClient',
    listMethod: 'servers.list',
    importance: 6,
    mapResource: (server: any, subscriptionId: string) => {
      const name = server.name ?? 'unknown'
      const id = server.id ?? ''
      const rg = extractResourceGroup(id)
      const location = server.location ?? 'unknown'
      const state = server.state ?? ''
      const provState = server.provisioningState ?? ''
      return {
        id: `az-as-${name}`,
        label: `AnalysisSvc: ${name}`,
        type: 'analysis-services',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          state,
          sku: server.sku ? `${server.sku.name ?? ''} (${server.sku.tier ?? ''})` : '',
          skuCapacity: str(server.sku?.capacity),
          serverFullName: str(server.serverFullName),
          managedMode: str(server.managedMode),
          queryPoolConnectionMode: str(server.queryPoolConnectionMode),
        },
        status: state.toLowerCase() === 'succeeded' ? 'healthy' : provisioningHealth(state),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Power BI Embedded
  // -----------------------------------------------------------------------
  {
    type: 'power-bi-embedded',
    category: 'analytics',
    sdkPackage: '@azure/arm-powerbidedicated',
    clientClass: 'PowerBIDedicatedManagementClient',
    listMethod: 'capacities.list',
    importance: 6,
    mapResource: (cap: any, subscriptionId: string) => {
      const name = cap.name ?? 'unknown'
      const id = cap.id ?? ''
      const rg = extractResourceGroup(id)
      const location = cap.location ?? 'unknown'
      const state = cap.state ?? ''
      const provState = cap.provisioningState ?? ''
      return {
        id: `az-pbi-${name}`,
        label: `PowerBI: ${name}`,
        type: 'power-bi-embedded',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          state,
          sku: cap.sku ? `${cap.sku.name ?? ''} (${cap.sku.tier ?? ''})` : '',
          skuCapacity: str(cap.sku?.capacity),
          administration: (cap.administration?.members ?? []).join(', '),
          mode: str(cap.mode),
        },
        status: state.toLowerCase() === 'succeeded' ? 'healthy' : provisioningHealth(state),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Log Analytics Workspaces
  // -----------------------------------------------------------------------
  {
    type: 'log-analytics',
    category: 'analytics',
    sdkPackage: '@azure/arm-operationalinsights',
    clientClass: 'OperationalInsightsManagementClient',
    listMethod: 'workspaces.list',
    importance: 7,
    mapResource: (ws: any, subscriptionId: string) => {
      const name = ws.name ?? 'unknown'
      const id = ws.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ws.location ?? 'unknown'
      const provState = ws.provisioningState ?? ''
      return {
        id: `az-law-${name}`,
        label: `LogAnalytics: ${name}`,
        type: 'log-analytics',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          customerId: str(ws.customerId),
          sku: ws.sku ? str(ws.sku.name) : '',
          retentionInDays: str(ws.retentionInDays),
          dailyQuotaGb: str(ws.workspaceCapping?.dailyQuotaGb),
          publicNetworkAccessForIngestion: str(ws.publicNetworkAccessForIngestion),
          publicNetworkAccessForQuery: str(ws.publicNetworkAccessForQuery),
          createdDate: str(ws.createdDate),
          modifiedDate: str(ws.modifiedDate),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Application Insights
  // -----------------------------------------------------------------------
  {
    type: 'app-insights',
    category: 'analytics',
    sdkPackage: '@azure/arm-appinsights',
    clientClass: 'ApplicationInsightsManagementClient',
    listMethod: 'components.list',
    importance: 6,
    mapResource: (comp: any, subscriptionId: string) => {
      const name = comp.name ?? 'unknown'
      const id = comp.id ?? ''
      const rg = extractResourceGroup(id)
      const location = comp.location ?? 'unknown'
      const provState = comp.provisioningState ?? ''
      return {
        id: `az-appins-${name}`,
        label: `AppInsights: ${name}`,
        type: 'app-insights',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          appId: str(comp.appId),
          applicationId: str(comp.applicationId),
          applicationType: str(comp.applicationType),
          instrumentationKey: str(comp.instrumentationKey),
          connectionString: str(comp.connectionString),
          flowType: str(comp.flowType),
          requestSource: str(comp.requestSource),
          retentionInDays: str(comp.retentionInDays),
          samplingPercentage: str(comp.samplingPercentage),
          workspaceResourceId: str(comp.workspaceResourceId),
          disableIpMasking: str(comp.disableIpMasking),
          ingestionMode: str(comp.ingestionMode),
          publicNetworkAccessForIngestion: str(comp.publicNetworkAccessForIngestion),
          publicNetworkAccessForQuery: str(comp.publicNetworkAccessForQuery),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Monitor Action Groups
  // -----------------------------------------------------------------------
  {
    type: 'monitor-action-group',
    category: 'analytics',
    sdkPackage: '@azure/arm-monitor',
    clientClass: 'MonitorClient',
    listMethod: 'actionGroups.listBySubscription',
    importance: 4,
    mapResource: (ag: any, subscriptionId: string) => {
      const name = ag.name ?? 'unknown'
      const id = ag.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ag.location ?? 'global'
      return {
        id: `az-mag-${name}`,
        label: `ActionGroup: ${name}`,
        type: 'monitor-action-group',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          groupShortName: str(ag.groupShortName),
          enabled: str(ag.enabled),
          emailReceiverCount: str((ag.emailReceivers ?? []).length),
          smsReceiverCount: str((ag.smsReceivers ?? []).length),
          webhookReceiverCount: str((ag.webhookReceivers ?? []).length),
          logicAppReceiverCount: str((ag.logicAppReceivers ?? []).length),
          azureFunctionReceiverCount: str((ag.azureFunctionReceivers ?? []).length),
        },
        status: ag.enabled ? 'healthy' : 'warning',
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Monitor Metric Alerts
  // -----------------------------------------------------------------------
  {
    type: 'monitor-metric-alert',
    category: 'analytics',
    sdkPackage: '@azure/arm-monitor',
    clientClass: 'MonitorClient',
    listMethod: 'metricAlerts.listBySubscription',
    importance: 4,
    mapResource: (alert: any, subscriptionId: string) => {
      const name = alert.name ?? 'unknown'
      const id = alert.id ?? ''
      const rg = extractResourceGroup(id)
      const location = alert.location ?? 'global'
      return {
        id: `az-malert-${name}`,
        label: `MetricAlert: ${name}`,
        type: 'monitor-metric-alert',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          description: str(alert.description),
          severity: str(alert.severity),
          enabled: str(alert.enabled),
          evaluationFrequency: str(alert.evaluationFrequency),
          windowSize: str(alert.windowSize),
          targetResourceType: str(alert.targetResourceType),
          targetResourceRegion: str(alert.targetResourceRegion),
          criteriaCount: str((alert.criteria?.allOf ?? []).length),
          scopeCount: str((alert.scopes ?? []).length),
        },
        status: alert.enabled ? 'healthy' : 'warning',
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Data Share Accounts
  // -----------------------------------------------------------------------
  {
    type: 'data-share',
    category: 'analytics',
    sdkPackage: '@azure/arm-datashare',
    clientClass: 'DataShareManagementClient',
    listMethod: 'accounts.listBySubscription',
    importance: 5,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      const provState = account.provisioningState ?? ''
      return {
        id: `az-datashare-${name}`,
        label: `DataShare: ${name}`,
        type: 'data-share',
        category: 'analytics',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          userEmail: str(account.userEmail),
          userName: str(account.userName),
          createdAt: account.createdAt?.toISOString?.() ?? str(account.createdAt),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // ML (Machine Learning & AI)
  // =======================================================================

  // -----------------------------------------------------------------------
  // Machine Learning Workspaces
  // -----------------------------------------------------------------------
  {
    type: 'ml-workspace',
    category: 'ml',
    sdkPackage: '@azure/arm-machinelearning',
    clientClass: 'AzureMachineLearningWorkspaces',
    listMethod: 'workspaces.listBySubscription',
    importance: 8,
    mapResource: (ws: any, subscriptionId: string) => {
      const name = ws.name ?? 'unknown'
      const id = ws.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ws.location ?? 'unknown'
      const provState = ws.provisioningState ?? ''
      return {
        id: `az-mlws-${name}`,
        label: `ML Workspace: ${name}`,
        type: 'ml-workspace',
        category: 'ml',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: ws.sku ? str(ws.sku.name) : '',
          friendlyName: str(ws.friendlyName),
          workspaceId: str(ws.workspaceId),
          discoveryUrl: str(ws.discoveryUrl),
          mlFlowTrackingUri: str(ws.mlFlowTrackingUri),
          storageAccount: str(ws.storageAccount),
          keyVault: str(ws.keyVault),
          applicationInsights: str(ws.applicationInsights),
          containerRegistry: str(ws.containerRegistry),
          publicNetworkAccess: str(ws.publicNetworkAccess),
          hbiWorkspace: str(ws.hbiWorkspace),
        },
        status: provisioningHealth(provState),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cognitive Services Accounts
  // -----------------------------------------------------------------------
  {
    type: 'cognitive-account',
    category: 'ml',
    sdkPackage: '@azure/arm-cognitiveservices',
    clientClass: 'CognitiveServicesManagementClient',
    listMethod: 'accounts.list',
    importance: 7,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      const props = account.properties ?? {}
      const provState = props.provisioningState ?? ''
      return {
        id: `az-cog-${name}`,
        label: `Cognitive: ${name}`,
        type: 'cognitive-account',
        category: 'ml',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          kind: str(account.kind),
          sku: account.sku ? str(account.sku.name) : '',
          endpoint: str(props.endpoint),
          customSubDomainName: str(props.customSubDomainName),
          publicNetworkAccess: str(props.publicNetworkAccess),
          disableLocalAuth: str(props.disableLocalAuth),
          isMigrated: str(props.isMigrated),
          dateCreated: str(props.dateCreated),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure OpenAI (filtered by kind from Cognitive Services)
  // -----------------------------------------------------------------------
  {
    type: 'openai',
    category: 'ml',
    sdkPackage: '@azure/arm-cognitiveservices',
    clientClass: 'CognitiveServicesManagementClient',
    listMethod: 'accounts.list',
    importance: 9,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      const props = account.properties ?? {}
      const provState = props.provisioningState ?? ''
      return {
        id: `az-openai-${name}`,
        label: `OpenAI: ${name}`,
        type: 'openai',
        category: 'ml',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          kind: str(account.kind),
          sku: account.sku ? str(account.sku.name) : '',
          endpoint: str(props.endpoint),
          customSubDomainName: str(props.customSubDomainName),
          publicNetworkAccess: str(props.publicNetworkAccess),
          disableLocalAuth: str(props.disableLocalAuth),
          dateCreated: str(props.dateCreated),
        },
        status: provisioningHealth(provState),
        importance: 9,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Bot Service
  // -----------------------------------------------------------------------
  {
    type: 'bot-service',
    category: 'ml',
    sdkPackage: '@azure/arm-botservice',
    clientClass: 'AzureBotServiceClient',
    listMethod: 'bots.list',
    importance: 5,
    mapResource: (bot: any, subscriptionId: string) => {
      const name = bot.name ?? 'unknown'
      const id = bot.id ?? ''
      const rg = extractResourceGroup(id)
      const location = bot.location ?? 'global'
      const props = bot.properties ?? {}
      return {
        id: `az-bot-${name}`,
        label: `Bot: ${name}`,
        type: 'bot-service',
        category: 'ml',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          displayName: str(props.displayName),
          endpoint: str(props.endpoint),
          msaAppId: str(props.msaAppId),
          sku: bot.sku ? str(bot.sku.name) : '',
          kind: str(bot.kind),
          isDeveloperAppInsightsApiKeySet: str(props.isDeveloperAppInsightsApiKeySet),
          isStreamingSupported: str(props.isStreamingSupported),
          schemaTransformationVersion: str(props.schemaTransformationVersion),
        },
        status: 'healthy',
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure AI Search (Cognitive Search)
  // -----------------------------------------------------------------------
  {
    type: 'search',
    category: 'ml',
    sdkPackage: '@azure/arm-search',
    clientClass: 'SearchManagementClient',
    listMethod: 'services.listBySubscription',
    importance: 7,
    mapResource: (svc: any, subscriptionId: string) => {
      const name = svc.name ?? 'unknown'
      const id = svc.id ?? ''
      const rg = extractResourceGroup(id)
      const location = svc.location ?? 'unknown'
      const provState = svc.provisioningState ?? ''
      const status = svc.status ?? ''
      return {
        id: `az-search-${name}`,
        label: `AI Search: ${name}`,
        type: 'search',
        category: 'ml',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          status,
          sku: svc.sku ? str(svc.sku.name) : '',
          replicaCount: str(svc.replicaCount),
          partitionCount: str(svc.partitionCount),
          hostingMode: str(svc.hostingMode),
          publicNetworkAccess: str(svc.publicNetworkAccess),
          statusDetails: str(svc.statusDetails),
        },
        status: status.toLowerCase() === 'running' ? 'healthy' : provisioningHealth(status),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Video Indexer
  // -----------------------------------------------------------------------
  {
    type: 'video-indexer',
    category: 'ml',
    sdkPackage: '@azure/arm-videoindexer',
    clientClass: 'VideoIndexerClient',
    listMethod: 'accounts.listBySubscription',
    importance: 4,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      const provState = account.provisioningState ?? ''
      return {
        id: `az-vi-${name}`,
        label: `VideoIndexer: ${name}`,
        type: 'video-indexer',
        category: 'ml',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          accountId: str(account.accountId),
          accountName: str(account.accountName),
          tenantId: str(account.tenantId),
        },
        status: provisioningHealth(provState),
        importance: 4,
      }
    },
  },

  // =======================================================================
  // IOT
  // =======================================================================

  // -----------------------------------------------------------------------
  // IoT Hub
  // -----------------------------------------------------------------------
  {
    type: 'iot-hub',
    category: 'iot',
    sdkPackage: '@azure/arm-iothub',
    clientClass: 'IotHubClient',
    listMethod: 'iotHubResource.listBySubscription',
    importance: 8,
    mapResource: (hub: any, subscriptionId: string) => {
      const name = hub.name ?? 'unknown'
      const id = hub.id ?? ''
      const rg = extractResourceGroup(id)
      const location = hub.location ?? 'unknown'
      const provState = hub.properties?.provisioningState ?? ''
      const state = hub.properties?.state ?? ''
      return {
        id: `az-iothub-${name}`,
        label: `IoT Hub: ${name}`,
        type: 'iot-hub',
        category: 'iot',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          state,
          sku: hub.sku ? `${hub.sku.name ?? ''} (capacity: ${hub.sku.capacity ?? ''})` : '',
          hostName: str(hub.properties?.hostName),
          eventHubEndpoints: hub.properties?.eventHubEndpoints ? Object.keys(hub.properties.eventHubEndpoints).join(', ') : '',
          publicNetworkAccess: str(hub.properties?.publicNetworkAccess),
          enableFileUploadNotifications: str(hub.properties?.enableFileUploadNotifications),
          minTlsVersion: str(hub.properties?.minTlsVersion),
          disableLocalAuth: str(hub.properties?.disableLocalAuth),
        },
        status: state.toLowerCase() === 'active' ? 'healthy' : provisioningHealth(state),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IoT Central Applications
  // -----------------------------------------------------------------------
  {
    type: 'iot-central',
    category: 'iot',
    sdkPackage: '@azure/arm-iotcentral',
    clientClass: 'IotCentralClient',
    listMethod: 'apps.listBySubscription',
    importance: 6,
    mapResource: (app: any, subscriptionId: string) => {
      const name = app.name ?? 'unknown'
      const id = app.id ?? ''
      const rg = extractResourceGroup(id)
      const location = app.location ?? 'unknown'
      const state = app.state ?? ''
      return {
        id: `az-iotcentral-${name}`,
        label: `IoT Central: ${name}`,
        type: 'iot-central',
        category: 'iot',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          state,
          sku: app.sku ? str(app.sku.name) : '',
          applicationId: str(app.applicationId),
          displayName: str(app.displayName),
          subdomain: str(app.subdomain),
          template: str(app.template),
          publicNetworkAccess: str(app.publicNetworkAccess),
        },
        status: state.toLowerCase() === 'created' ? 'healthy' : provisioningHealth(state),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IoT Hub Device Provisioning Service
  // -----------------------------------------------------------------------
  {
    type: 'iot-dps',
    category: 'iot',
    sdkPackage: '@azure/arm-deviceprovisioningservices',
    clientClass: 'IotDpsClient',
    listMethod: 'iotDpsResource.listBySubscription',
    importance: 6,
    mapResource: (dps: any, subscriptionId: string) => {
      const name = dps.name ?? 'unknown'
      const id = dps.id ?? ''
      const rg = extractResourceGroup(id)
      const location = dps.location ?? 'unknown'
      const props = dps.properties ?? {}
      const state = props.state ?? ''
      const provState = props.provisioningState ?? ''
      return {
        id: `az-iotdps-${name}`,
        label: `IoT DPS: ${name}`,
        type: 'iot-dps',
        category: 'iot',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          state,
          sku: dps.sku ? `${dps.sku.name ?? ''} (capacity: ${dps.sku.capacity ?? ''})` : '',
          serviceOperationsHostName: str(props.serviceOperationsHostName),
          deviceProvisioningHostName: str(props.deviceProvisioningHostName),
          idScope: str(props.idScope),
          allocationPolicy: str(props.allocationPolicy),
          publicNetworkAccess: str(props.publicNetworkAccess),
        },
        status: state.toLowerCase() === 'active' ? 'healthy' : provisioningHealth(state),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Digital Twins
  // -----------------------------------------------------------------------
  {
    type: 'digital-twins',
    category: 'iot',
    sdkPackage: '@azure/arm-digitaltwins',
    clientClass: 'AzureDigitalTwinsManagementClient',
    listMethod: 'digitalTwins.list',
    importance: 6,
    mapResource: (dt: any, subscriptionId: string) => {
      const name = dt.name ?? 'unknown'
      const id = dt.id ?? ''
      const rg = extractResourceGroup(id)
      const location = dt.location ?? 'unknown'
      const provState = dt.provisioningState ?? ''
      return {
        id: `az-dt-${name}`,
        label: `DigitalTwins: ${name}`,
        type: 'digital-twins',
        category: 'iot',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          hostName: str(dt.hostName),
          publicNetworkAccess: str(dt.publicNetworkAccess),
          createdTime: dt.createdTime?.toISOString?.() ?? str(dt.createdTime),
          lastUpdatedTime: dt.lastUpdatedTime?.toISOString?.() ?? str(dt.lastUpdatedTime),
        },
        status: provisioningHealth(provState),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Time Series Insights
  // -----------------------------------------------------------------------
  {
    type: 'time-series-insights',
    category: 'iot',
    sdkPackage: '@azure/arm-timeseriesinsights',
    clientClass: 'TimeSeriesInsightsClient',
    listMethod: 'environments.listBySubscription',
    importance: 5,
    mapResource: (env: any, subscriptionId: string) => {
      const name = env.name ?? 'unknown'
      const id = env.id ?? ''
      const rg = extractResourceGroup(id)
      const location = env.location ?? 'unknown'
      const provState = env.provisioningState ?? ''
      return {
        id: `az-tsi-${name}`,
        label: `TSI: ${name}`,
        type: 'time-series-insights',
        category: 'iot',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          kind: str(env.kind),
          sku: env.sku ? `${env.sku.name ?? ''} (capacity: ${env.sku.capacity ?? ''})` : '',
          dataAccessId: str(env.dataAccessId),
          dataAccessFqdn: str(env.dataAccessFqdn),
          creationTime: env.creationTime?.toISOString?.() ?? str(env.creationTime),
          status: str(env.status?.ingress?.state),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Sphere (limited ARM support)
  // -----------------------------------------------------------------------
  {
    type: 'sphere',
    category: 'iot',
    sdkPackage: '@azure/arm-sphere',
    clientClass: 'AzureSphereClient',
    listMethod: 'catalogs.listBySubscription',
    importance: 4,
    mapResource: (catalog: any, subscriptionId: string) => {
      const name = catalog.name ?? 'unknown'
      const id = catalog.id ?? ''
      const rg = extractResourceGroup(id)
      const location = catalog.location ?? 'unknown'
      const provState = catalog.provisioningState ?? ''
      return {
        id: `az-sphere-${name}`,
        label: `Sphere: ${name}`,
        type: 'sphere',
        category: 'iot',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
        },
        status: provisioningHealth(provState),
        importance: 4,
      }
    },
  },

  // =======================================================================
  // DEVOPS
  // =======================================================================

  // -----------------------------------------------------------------------
  // DevTest Labs
  // -----------------------------------------------------------------------
  {
    type: 'devtest-lab',
    category: 'devops',
    sdkPackage: '@azure/arm-devtestlabs',
    clientClass: 'DevTestLabsClient',
    listMethod: 'labs.listBySubscription',
    importance: 5,
    mapResource: (lab: any, subscriptionId: string) => {
      const name = lab.name ?? 'unknown'
      const id = lab.id ?? ''
      const rg = extractResourceGroup(id)
      const location = lab.location ?? 'unknown'
      const provState = lab.provisioningState ?? ''
      return {
        id: `az-dtl-${name}`,
        label: `DevTestLab: ${name}`,
        type: 'devtest-lab',
        category: 'devops',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          uniqueIdentifier: str(lab.uniqueIdentifier),
          vaultName: str(lab.vaultName),
          labStorageType: str(lab.labStorageType),
          premiumDataDisks: str(lab.premiumDataDisks),
          environmentPermission: str(lab.environmentPermission),
          mandatoryArtifactsResourceIdsLinux: str((lab.mandatoryArtifactsResourceIdsLinux ?? []).length),
          mandatoryArtifactsResourceIdsWindows: str((lab.mandatoryArtifactsResourceIdsWindows ?? []).length),
          vmCreationResourceGroup: str(lab.vmCreationResourceGroup),
          publicIpId: str(lab.publicIpId),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Load Testing
  // -----------------------------------------------------------------------
  {
    type: 'load-testing',
    category: 'devops',
    sdkPackage: '@azure/arm-loadtesting',
    clientClass: 'LoadTestClient',
    listMethod: 'loadTests.listBySubscription',
    importance: 5,
    mapResource: (lt: any, subscriptionId: string) => {
      const name = lt.name ?? 'unknown'
      const id = lt.id ?? ''
      const rg = extractResourceGroup(id)
      const location = lt.location ?? 'unknown'
      const provState = lt.provisioningState ?? ''
      return {
        id: `az-loadtest-${name}`,
        label: `LoadTest: ${name}`,
        type: 'load-testing',
        category: 'devops',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          dataPlaneURI: str(lt.dataPlaneURI),
          description: str(lt.description),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Deployment Scripts
  // -----------------------------------------------------------------------
  {
    type: 'deployment-script',
    category: 'devops',
    sdkPackage: '@azure/arm-resources',
    clientClass: 'ResourceManagementClient',
    listMethod: 'deploymentScripts.listBySubscription',
    importance: 3,
    mapResource: (script: any, subscriptionId: string) => {
      const name = script.name ?? 'unknown'
      const id = script.id ?? ''
      const rg = extractResourceGroup(id)
      const location = script.location ?? 'unknown'
      const provState = script.provisioningState ?? ''
      return {
        id: `az-dscript-${name}`,
        label: `DeployScript: ${name}`,
        type: 'deployment-script',
        category: 'devops',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          kind: str(script.kind),
          status: str(script.status?.containerInstanceId),
          cleanupPreference: str(script.cleanupPreference),
          retentionInterval: str(script.retentionInterval),
        },
        status: provisioningHealth(provState),
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Managed Grafana
  // -----------------------------------------------------------------------
  {
    type: 'managed-grafana',
    category: 'devops',
    sdkPackage: '@azure/arm-dashboard',
    clientClass: 'DashboardManagementClient',
    listMethod: 'grafana.list',
    importance: 5,
    mapResource: (grafana: any, subscriptionId: string) => {
      const name = grafana.name ?? 'unknown'
      const id = grafana.id ?? ''
      const rg = extractResourceGroup(id)
      const location = grafana.location ?? 'unknown'
      const provState = grafana.properties?.provisioningState ?? ''
      return {
        id: `az-grafana-${name}`,
        label: `Grafana: ${name}`,
        type: 'managed-grafana',
        category: 'devops',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: grafana.sku ? str(grafana.sku.name) : '',
          endpoint: str(grafana.properties?.endpoint),
          grafanaVersion: str(grafana.properties?.grafanaVersion),
          zoneRedundancy: str(grafana.properties?.zoneRedundancy),
          autoGeneratedDomainNameLabelScope: str(grafana.properties?.autoGeneratedDomainNameLabelScope),
          publicNetworkAccess: str(grafana.properties?.publicNetworkAccess),
          deterministicOutboundIP: str(grafana.properties?.deterministicOutboundIP),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Monitor Managed Prometheus (via Monitor workspaces)
  // -----------------------------------------------------------------------
  {
    type: 'managed-prometheus',
    category: 'devops',
    sdkPackage: '@azure/arm-monitor',
    clientClass: 'MonitorClient',
    listMethod: 'azureMonitorWorkspaces.listBySubscription',
    importance: 5,
    mapResource: (ws: any, subscriptionId: string) => {
      const name = ws.name ?? 'unknown'
      const id = ws.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ws.location ?? 'unknown'
      const provState = ws.provisioningState ?? ''
      return {
        id: `az-prometheus-${name}`,
        label: `Prometheus: ${name}`,
        type: 'managed-prometheus',
        category: 'devops',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          accountId: str(ws.accountId),
          defaultIngestionSettingsDataCollectionEndpointResourceId: str(ws.defaultIngestionSettings?.dataCollectionEndpointResourceId),
          defaultIngestionSettingsDataCollectionRuleResourceId: str(ws.defaultIngestionSettings?.dataCollectionRuleResourceId),
          publicNetworkAccess: str(ws.publicNetworkAccess),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // MANAGEMENT
  // =======================================================================

  // -----------------------------------------------------------------------
  // Resource Groups
  // -----------------------------------------------------------------------
  {
    type: 'resource-group',
    category: 'management',
    sdkPackage: '@azure/arm-resources',
    clientClass: 'ResourceManagementClient',
    listMethod: 'resourceGroups.list',
    importance: 5,
    mapResource: (rg: any, subscriptionId: string) => {
      const name = rg.name ?? 'unknown'
      const id = rg.id ?? ''
      const location = rg.location ?? 'unknown'
      const provState = rg.properties?.provisioningState ?? ''
      return {
        id: `az-rg-${name}`,
        label: `RG: ${name}`,
        type: 'resource-group',
        category: 'management',
        region: location,
        metadata: {
          resourceId: id,
          provisioningState: provState,
          managedBy: str(rg.managedBy),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Management Groups
  // -----------------------------------------------------------------------
  {
    type: 'management-group',
    category: 'management',
    sdkPackage: '@azure/arm-managementgroups',
    clientClass: 'ManagementGroupsAPI',
    listMethod: 'managementGroups.list',
    importance: 6,
    mapResource: (mg: any, subscriptionId: string) => {
      const name = mg.name ?? 'unknown'
      const id = mg.id ?? ''
      return {
        id: `az-mg-${name}`,
        label: `MgmtGroup: ${mg.displayName ?? name}`,
        type: 'management-group',
        category: 'management',
        region: 'global',
        metadata: {
          resourceId: id,
          displayName: str(mg.displayName),
          tenantId: str(mg.tenantId),
          type: str(mg.type),
        },
        status: 'healthy',
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Subscriptions
  // -----------------------------------------------------------------------
  {
    type: 'subscription',
    category: 'management',
    sdkPackage: '@azure/arm-subscriptions',
    clientClass: 'SubscriptionClient',
    listMethod: 'subscriptions.list',
    importance: 7,
    mapResource: (sub: any, subscriptionId: string) => {
      const name = sub.displayName ?? 'unknown'
      const id = sub.id ?? ''
      return {
        id: `az-sub-${sub.subscriptionId ?? name}`,
        label: `Subscription: ${name}`,
        type: 'subscription',
        category: 'management',
        region: 'global',
        metadata: {
          resourceId: id,
          subscriptionId: str(sub.subscriptionId),
          displayName: str(sub.displayName),
          state: str(sub.state),
          tenantId: str(sub.tenantId),
          locationPlacementId: str(sub.subscriptionPolicies?.locationPlacementId),
          quotaId: str(sub.subscriptionPolicies?.quotaId),
          spendingLimit: str(sub.subscriptionPolicies?.spendingLimit),
        },
        status: sub.state === 'Enabled' ? 'healthy' : 'warning',
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Blueprints
  // -----------------------------------------------------------------------
  {
    type: 'blueprint',
    category: 'management',
    sdkPackage: '@azure/arm-blueprint',
    clientClass: 'BlueprintManagementClient',
    listMethod: 'blueprints.list',
    importance: 4,
    mapResource: (bp: any, subscriptionId: string) => {
      const name = bp.name ?? 'unknown'
      const id = bp.id ?? ''
      return {
        id: `az-bp-${name}`,
        label: `Blueprint: ${name}`,
        type: 'blueprint',
        category: 'management',
        region: 'global',
        metadata: {
          resourceId: id,
          displayName: str(bp.displayName),
          description: str(bp.description),
          status: str(bp.status?.timeCreated),
          targetScope: str(bp.targetScope),
          versions: str(bp.versions),
        },
        status: 'healthy',
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cost Management (Export definitions)
  // -----------------------------------------------------------------------
  {
    type: 'cost-management',
    category: 'management',
    sdkPackage: '@azure/arm-costmanagement',
    clientClass: 'CostManagementClient',
    listMethod: 'exports.list',
    importance: 4,
    mapResource: (exp: any, subscriptionId: string) => {
      const name = exp.name ?? 'unknown'
      const id = exp.id ?? ''
      return {
        id: `az-cost-${name}`,
        label: `CostExport: ${name}`,
        type: 'cost-management',
        category: 'management',
        region: 'global',
        metadata: {
          resourceId: id,
          format: str(exp.format),
          deliveryInfoDestinationContainer: str(exp.deliveryInfo?.destination?.container),
          deliveryInfoDestinationRootFolderPath: str(exp.deliveryInfo?.destination?.rootFolderPath),
          definitionType: str(exp.definition?.type),
          definitionTimeframe: str(exp.definition?.timeframe),
          scheduleStatus: str(exp.schedule?.status),
          scheduleRecurrence: str(exp.schedule?.recurrence),
        },
        status: 'healthy',
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Policy Definitions
  // -----------------------------------------------------------------------
  {
    type: 'policy-definition',
    category: 'management',
    sdkPackage: '@azure/arm-policy',
    clientClass: 'PolicyClient',
    listMethod: 'policyDefinitions.list',
    importance: 3,
    mapResource: (pd: any, subscriptionId: string) => {
      const name = pd.name ?? 'unknown'
      const id = pd.id ?? ''
      return {
        id: `az-poldef-${name}`,
        label: `PolicyDef: ${pd.displayName ?? name}`,
        type: 'policy-definition',
        category: 'management',
        region: 'global',
        metadata: {
          resourceId: id,
          displayName: str(pd.displayName),
          policyType: str(pd.policyType),
          mode: str(pd.mode),
          description: str(pd.description),
        },
        status: 'healthy',
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Automation Accounts
  // -----------------------------------------------------------------------
  {
    type: 'automation-account',
    category: 'management',
    sdkPackage: '@azure/arm-automation',
    clientClass: 'AutomationClient',
    listMethod: 'automationAccount.list',
    importance: 5,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      const state = account.state ?? ''
      return {
        id: `az-auto-${name}`,
        label: `Automation: ${name}`,
        type: 'automation-account',
        category: 'management',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          state,
          sku: account.sku ? str(account.sku.name) : '',
          lastModifiedBy: str(account.lastModifiedBy),
          creationTime: account.creationTime?.toISOString?.() ?? str(account.creationTime),
          lastModifiedTime: account.lastModifiedTime?.toISOString?.() ?? str(account.lastModifiedTime),
          publicNetworkAccess: str(account.publicNetworkAccess),
          disableLocalAuth: str(account.disableLocalAuth),
          automationHybridServiceUrl: str(account.automationHybridServiceUrl),
        },
        status: state.toLowerCase() === 'ok' ? 'healthy' : provisioningHealth(state),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Maintenance Configurations
  // -----------------------------------------------------------------------
  {
    type: 'maintenance-config',
    category: 'management',
    sdkPackage: '@azure/arm-maintenance',
    clientClass: 'MaintenanceManagementClient',
    listMethod: 'maintenanceConfigurations.list',
    importance: 3,
    mapResource: (config: any, subscriptionId: string) => {
      const name = config.name ?? 'unknown'
      const id = config.id ?? ''
      const rg = extractResourceGroup(id)
      const location = config.location ?? 'unknown'
      return {
        id: `az-maint-${name}`,
        label: `Maintenance: ${name}`,
        type: 'maintenance-config',
        category: 'management',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          maintenanceScope: str(config.maintenanceScope),
          visibility: str(config.visibility),
          namespace: str(config.namespace),
          recurEvery: str(config.maintenanceWindow?.recurEvery),
          startDateTime: str(config.maintenanceWindow?.startDateTime),
          duration: str(config.maintenanceWindow?.duration),
          timeZone: str(config.maintenanceWindow?.timeZone),
          expirationDateTime: str(config.maintenanceWindow?.expirationDateTime),
        },
        status: 'healthy',
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Advisor Recommendations
  // -----------------------------------------------------------------------
  {
    type: 'advisor',
    category: 'management',
    sdkPackage: '@azure/arm-advisor',
    clientClass: 'AdvisorManagementClient',
    listMethod: 'recommendations.list',
    importance: 3,
    mapResource: (rec: any, subscriptionId: string) => {
      const name = rec.name ?? 'unknown'
      const id = rec.id ?? ''
      return {
        id: `az-advisor-${name}`,
        label: `Advisor: ${str(rec.shortDescription?.problem ?? name)}`,
        type: 'advisor',
        category: 'management',
        region: 'global',
        metadata: {
          resourceId: id,
          category: str(rec.category),
          impact: str(rec.impact),
          impactedField: str(rec.impactedField),
          impactedValue: str(rec.impactedValue),
          shortDescriptionProblem: str(rec.shortDescription?.problem),
          shortDescriptionSolution: str(rec.shortDescription?.solution),
          lastUpdated: rec.lastUpdated?.toISOString?.() ?? str(rec.lastUpdated),
        },
        status: rec.impact === 'High' ? 'error' : rec.impact === 'Medium' ? 'warning' : 'healthy',
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Arc Servers
  // -----------------------------------------------------------------------
  {
    type: 'arc-server',
    category: 'management',
    sdkPackage: '@azure/arm-hybridcompute',
    clientClass: 'HybridComputeManagementClient',
    listMethod: 'machines.listBySubscription',
    importance: 6,
    mapResource: (machine: any, subscriptionId: string) => {
      const name = machine.name ?? 'unknown'
      const id = machine.id ?? ''
      const rg = extractResourceGroup(id)
      const location = machine.location ?? 'unknown'
      const status = machine.status ?? ''
      return {
        id: `az-arc-${name}`,
        label: `Arc Server: ${name}`,
        type: 'arc-server',
        category: 'management',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          status,
          provisioningState: str(machine.provisioningState),
          vmId: str(machine.vmId),
          displayName: str(machine.displayName),
          machineFqdn: str(machine.machineFqdn),
          osName: str(machine.osName),
          osVersion: str(machine.osVersion),
          osSku: str(machine.osSku),
          domainName: str(machine.domainName),
          adFqdn: str(machine.adFqdn),
          agentVersion: str(machine.agentVersion),
          lastStatusChange: machine.lastStatusChange?.toISOString?.() ?? str(machine.lastStatusChange),
        },
        status: status.toLowerCase() === 'connected' ? 'healthy' : status.toLowerCase() === 'disconnected' ? 'error' : 'warning',
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Arc Kubernetes
  // -----------------------------------------------------------------------
  {
    type: 'arc-kubernetes',
    category: 'management',
    sdkPackage: '@azure/arm-hybridkubernetes',
    clientClass: 'ConnectedKubernetesClient',
    listMethod: 'connectedClusters.listBySubscription',
    importance: 7,
    mapResource: (cluster: any, subscriptionId: string) => {
      const name = cluster.name ?? 'unknown'
      const id = cluster.id ?? ''
      const rg = extractResourceGroup(id)
      const location = cluster.location ?? 'unknown'
      const connectivityStatus = cluster.connectivityStatus ?? ''
      const provState = cluster.provisioningState ?? ''
      return {
        id: `az-arck8s-${name}`,
        label: `Arc K8s: ${name}`,
        type: 'arc-kubernetes',
        category: 'management',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          connectivityStatus,
          distribution: str(cluster.distribution),
          distributionVersion: str(cluster.distributionVersion),
          infrastructure: str(cluster.infrastructure),
          kubernetesVersion: str(cluster.kubernetesVersion),
          totalNodeCount: str(cluster.totalNodeCount),
          totalCoreCount: str(cluster.totalCoreCount),
          agentVersion: str(cluster.agentVersion),
          lastConnectivityTime: cluster.lastConnectivityTime?.toISOString?.() ?? str(cluster.lastConnectivityTime),
          offering: str(cluster.offering),
        },
        status: connectivityStatus.toLowerCase() === 'connected' ? 'healthy' : 'error',
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Monitor Workspace
  // -----------------------------------------------------------------------
  {
    type: 'monitor-workspace',
    category: 'management',
    sdkPackage: '@azure/arm-monitor',
    clientClass: 'MonitorClient',
    listMethod: 'azureMonitorWorkspaces.listBySubscription',
    importance: 5,
    mapResource: (ws: any, subscriptionId: string) => {
      const name = ws.name ?? 'unknown'
      const id = ws.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ws.location ?? 'unknown'
      const provState = ws.provisioningState ?? ''
      return {
        id: `az-monws-${name}`,
        label: `MonitorWS: ${name}`,
        type: 'monitor-workspace',
        category: 'management',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          accountId: str(ws.accountId),
          publicNetworkAccess: str(ws.publicNetworkAccess),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Recovery Services Vault
  // -----------------------------------------------------------------------
  {
    type: 'recovery-vault',
    category: 'management',
    sdkPackage: '@azure/arm-recoveryservices',
    clientClass: 'RecoveryServicesClient',
    listMethod: 'vaults.listBySubscriptionId',
    importance: 7,
    mapResource: (vault: any, subscriptionId: string) => {
      const name = vault.name ?? 'unknown'
      const id = vault.id ?? ''
      const rg = extractResourceGroup(id)
      const location = vault.location ?? 'unknown'
      const provState = vault.properties?.provisioningState ?? ''
      return {
        id: `az-rsv-${name}`,
        label: `RecoveryVault: ${name}`,
        type: 'recovery-vault',
        category: 'management',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: vault.sku ? str(vault.sku.name) : '',
          skuTier: vault.sku ? str(vault.sku.tier) : '',
          privateEndpointStateForBackup: str(vault.properties?.privateEndpointStateForBackup),
          privateEndpointStateForSiteRecovery: str(vault.properties?.privateEndpointStateForSiteRecovery),
          publicNetworkAccess: str(vault.properties?.publicNetworkAccess),
          moveState: str(vault.properties?.moveState),
          redundancySettings: str(vault.properties?.redundancySettings?.standardTierStorageRedundancy),
          crossSubscriptionRestoreState: str(vault.properties?.redundancySettings?.crossRegionRestore),
        },
        status: provisioningHealth(provState),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Service Health
  // -----------------------------------------------------------------------
  {
    type: 'service-health',
    category: 'management',
    sdkPackage: '@azure/arm-resourcehealth',
    clientClass: 'MicrosoftResourceHealth',
    listMethod: 'availabilityStatuses.listBySubscriptionId',
    importance: 3,
    mapResource: (status: any, subscriptionId: string) => {
      const name = status.name ?? 'unknown'
      const id = status.id ?? ''
      const location = status.location ?? 'global'
      return {
        id: `az-health-${name}`,
        label: `Health: ${name}`,
        type: 'service-health',
        category: 'management',
        region: location,
        metadata: {
          resourceId: id,
          availabilityState: str(status.properties?.availabilityState),
          summary: str(status.properties?.summary),
          detailedStatus: str(status.properties?.detailedStatus),
          reasonType: str(status.properties?.reasonType),
          reasonChronicity: str(status.properties?.reasonChronicity),
          occuredTime: str(status.properties?.occuredTime),
          reportedTime: str(status.properties?.reportedTime),
        },
        status: status.properties?.availabilityState === 'Available' ? 'healthy' : 'error',
        importance: 3,
      }
    },
  },

  // =======================================================================
  // INTEGRATION
  // =======================================================================

  // -----------------------------------------------------------------------
  // Logic App Standard
  // -----------------------------------------------------------------------
  {
    type: 'logic-app-standard',
    category: 'integration',
    sdkPackage: '@azure/arm-appservice',
    clientClass: 'WebSiteManagementClient',
    listMethod: 'webApps.list',
    importance: 6,
    mapResource: (app: any, subscriptionId: string) => {
      const name = app.name ?? 'unknown'
      const id = app.id ?? ''
      const rg = extractResourceGroup(id)
      const location = app.location ?? 'unknown'
      const state = app.state ?? ''
      return {
        id: `az-logicstd-${name}`,
        label: `LogicStd: ${name}`,
        type: 'logic-app-standard',
        category: 'integration',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          state,
          kind: str(app.kind),
          defaultHostName: str(app.defaultHostName),
          enabled: str(app.enabled),
          httpsOnly: str(app.httpsOnly),
          hostNames: (app.hostNames ?? []).join(', '),
          repositorySiteName: str(app.repositorySiteName),
        },
        status: state.toLowerCase() === 'running' ? 'healthy' : provisioningHealth(state),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // API Connections
  // -----------------------------------------------------------------------
  {
    type: 'api-connection',
    category: 'integration',
    sdkPackage: '@azure/arm-web',
    clientClass: 'WebSiteManagementClient',
    listMethod: 'connections.list',
    importance: 3,
    mapResource: (conn: any, subscriptionId: string) => {
      const name = conn.name ?? 'unknown'
      const id = conn.id ?? ''
      const rg = extractResourceGroup(id)
      const location = conn.location ?? 'unknown'
      return {
        id: `az-apiconn-${name}`,
        label: `APIConn: ${name}`,
        type: 'api-connection',
        category: 'integration',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          displayName: str(conn.properties?.displayName),
          apiDisplayName: str(conn.properties?.api?.displayName),
          apiName: str(conn.properties?.api?.name),
          statuses: (conn.properties?.statuses ?? []).map((s: any) => str(s.status)).join(', '),
        },
        status: 'healthy',
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Integration Accounts
  // -----------------------------------------------------------------------
  {
    type: 'integration-account',
    category: 'integration',
    sdkPackage: '@azure/arm-logic',
    clientClass: 'LogicManagementClient',
    listMethod: 'integrationAccounts.listBySubscription',
    importance: 5,
    mapResource: (ia: any, subscriptionId: string) => {
      const name = ia.name ?? 'unknown'
      const id = ia.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ia.location ?? 'unknown'
      const state = ia.state ?? ''
      return {
        id: `az-intacct-${name}`,
        label: `IntAccount: ${name}`,
        type: 'integration-account',
        category: 'integration',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          state,
          sku: ia.sku ? str(ia.sku.name) : '',
          integrationServiceEnvironmentId: str(ia.integrationServiceEnvironment?.id),
          createdTime: ia.createdTime?.toISOString?.() ?? str(ia.createdTime),
          changedTime: ia.changedTime?.toISOString?.() ?? str(ia.changedTime),
        },
        status: state.toLowerCase() === 'enabled' ? 'healthy' : provisioningHealth(state),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Service Connector
  // -----------------------------------------------------------------------
  {
    type: 'service-connector',
    category: 'integration',
    sdkPackage: '@azure/arm-servicelinker',
    clientClass: 'ServiceLinkerManagementClient',
    listMethod: 'linker.list',
    importance: 3,
    mapResource: (linker: any, subscriptionId: string) => {
      const name = linker.name ?? 'unknown'
      const id = linker.id ?? ''
      const provState = linker.provisioningState ?? ''
      return {
        id: `az-svcconn-${name}`,
        label: `SvcConnector: ${name}`,
        type: 'service-connector',
        category: 'integration',
        region: 'global',
        metadata: {
          resourceId: id,
          provisioningState: provState,
          targetServiceType: str(linker.targetService?.type),
          authType: str(linker.authInfo?.authType),
          clientType: str(linker.clientType),
        },
        status: provisioningHealth(provState),
        importance: 3,
      }
    },
  },

  // =======================================================================
  // MEDIA
  // =======================================================================

  // -----------------------------------------------------------------------
  // Azure Media Services
  // -----------------------------------------------------------------------
  {
    type: 'media-services',
    category: 'media',
    sdkPackage: '@azure/arm-mediaservices',
    clientClass: 'AzureMediaServices',
    listMethod: 'mediaservices.listBySubscription',
    importance: 5,
    mapResource: (ms: any, subscriptionId: string) => {
      const name = ms.name ?? 'unknown'
      const id = ms.id ?? ''
      const rg = extractResourceGroup(id)
      const location = ms.location ?? 'unknown'
      const provState = ms.provisioningState ?? ''
      return {
        id: `az-media-${name}`,
        label: `MediaSvc: ${name}`,
        type: 'media-services',
        category: 'media',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          mediaServiceId: str(ms.mediaServiceId),
          storageAccountCount: str((ms.storageAccounts ?? []).length),
          publicNetworkAccess: str(ms.publicNetworkAccess),
          storageAuthentication: str(ms.storageAuthentication),
          encryption: str(ms.encryption?.type),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Spatial Anchors
  // -----------------------------------------------------------------------
  {
    type: 'spatial-anchors',
    category: 'media',
    sdkPackage: '@azure/arm-mixedreality',
    clientClass: 'MixedRealityClient',
    listMethod: 'spatialAnchorsAccounts.listBySubscription',
    importance: 4,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      return {
        id: `az-spatial-${name}`,
        label: `SpatialAnchors: ${name}`,
        type: 'spatial-anchors',
        category: 'media',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          accountDomain: str(account.accountDomain),
          accountId: str(account.accountId),
          sku: account.sku ? str(account.sku.name) : '',
        },
        status: 'healthy',
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Remote Rendering
  // -----------------------------------------------------------------------
  {
    type: 'remote-rendering',
    category: 'media',
    sdkPackage: '@azure/arm-mixedreality',
    clientClass: 'MixedRealityClient',
    listMethod: 'remoteRenderingAccounts.listBySubscription',
    importance: 4,
    mapResource: (account: any, subscriptionId: string) => {
      const name = account.name ?? 'unknown'
      const id = account.id ?? ''
      const rg = extractResourceGroup(id)
      const location = account.location ?? 'unknown'
      return {
        id: `az-remrender-${name}`,
        label: `RemoteRender: ${name}`,
        type: 'remote-rendering',
        category: 'media',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          accountDomain: str(account.accountDomain),
          accountId: str(account.accountId),
          sku: account.sku ? str(account.sku.name) : '',
        },
        status: 'healthy',
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Virtual Desktop (Host Pools)
  // -----------------------------------------------------------------------
  {
    type: 'virtual-desktop',
    category: 'media',
    sdkPackage: '@azure/arm-desktopvirtualization',
    clientClass: 'DesktopVirtualizationAPIClient',
    listMethod: 'hostPools.list',
    importance: 6,
    mapResource: (pool: any, subscriptionId: string) => {
      const name = pool.name ?? 'unknown'
      const id = pool.id ?? ''
      const rg = extractResourceGroup(id)
      const location = pool.location ?? 'unknown'
      return {
        id: `az-avd-${name}`,
        label: `AVD Pool: ${name}`,
        type: 'virtual-desktop',
        category: 'media',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          friendlyName: str(pool.friendlyName),
          hostPoolType: str(pool.hostPoolType),
          personalDesktopAssignmentType: str(pool.personalDesktopAssignmentType),
          loadBalancerType: str(pool.loadBalancerType),
          maxSessionLimit: str(pool.maxSessionLimit),
          preferredAppGroupType: str(pool.preferredAppGroupType),
          validationEnvironment: str(pool.validationEnvironment),
          startVMOnConnect: str(pool.startVMOnConnect),
          registrationInfoExpirationTime: str(pool.registrationInfo?.expirationTime),
        },
        status: 'healthy',
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Lab Services Labs
  // -----------------------------------------------------------------------
  {
    type: 'lab-services',
    category: 'media',
    sdkPackage: '@azure/arm-labservices',
    clientClass: 'LabServicesClient',
    listMethod: 'labs.listBySubscription',
    importance: 4,
    mapResource: (lab: any, subscriptionId: string) => {
      const name = lab.name ?? 'unknown'
      const id = lab.id ?? ''
      const rg = extractResourceGroup(id)
      const location = lab.location ?? 'unknown'
      const provState = lab.provisioningState ?? ''
      const state = lab.state ?? ''
      return {
        id: `az-labsvc-${name}`,
        label: `LabService: ${name}`,
        type: 'lab-services',
        category: 'media',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          state,
          title: str(lab.title),
          description: str(lab.description),
          labPlanId: str(lab.labPlanId),
        },
        status: provisioningHealth(provState),
        importance: 4,
      }
    },
  },

  // =======================================================================
  // MIGRATION
  // =======================================================================

  // -----------------------------------------------------------------------
  // Database Migration Service
  // -----------------------------------------------------------------------
  {
    type: 'database-migration',
    category: 'migration',
    sdkPackage: '@azure/arm-datamigration',
    clientClass: 'DataMigrationServiceClient',
    listMethod: 'services.list',
    importance: 5,
    mapResource: (svc: any, subscriptionId: string) => {
      const name = svc.name ?? 'unknown'
      const id = svc.id ?? ''
      const rg = extractResourceGroup(id)
      const location = svc.location ?? 'unknown'
      const provState = svc.provisioningState ?? ''
      return {
        id: `az-dms-${name}`,
        label: `DMS: ${name}`,
        type: 'database-migration',
        category: 'migration',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          sku: svc.sku ? str(svc.sku.name) : '',
          skuTier: svc.sku ? str(svc.sku.tier) : '',
          virtualSubnetId: str(svc.virtualSubnetId),
          kind: str(svc.kind),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Migrate Projects
  // -----------------------------------------------------------------------
  {
    type: 'migrate-project',
    category: 'migration',
    sdkPackage: '@azure/arm-migrate',
    clientClass: 'AzureMigrateV2',
    listMethod: 'migrateProjects.list',
    importance: 5,
    mapResource: (project: any, subscriptionId: string) => {
      const name = project.name ?? 'unknown'
      const id = project.id ?? ''
      const rg = extractResourceGroup(id)
      const location = project.location ?? 'unknown'
      const provState = project.properties?.provisioningState ?? ''
      return {
        id: `az-migrate-${name}`,
        label: `Migrate: ${name}`,
        type: 'migrate-project',
        category: 'migration',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          provisioningState: provState,
          registeredTools: (project.properties?.registeredTools ?? []).join(', '),
          summary: str(project.properties?.summary ? Object.keys(project.properties.summary).length : 0),
          lastSummaryRefreshedTime: str(project.properties?.lastSummaryRefreshedTime),
          refreshSummaryState: str(project.properties?.refreshSummaryState),
        },
        status: provisioningHealth(provState),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Azure Data Box
  // -----------------------------------------------------------------------
  {
    type: 'data-box',
    category: 'migration',
    sdkPackage: '@azure/arm-databox',
    clientClass: 'DataBoxManagementClient',
    listMethod: 'jobs.list',
    importance: 5,
    mapResource: (job: any, subscriptionId: string) => {
      const name = job.name ?? 'unknown'
      const id = job.id ?? ''
      const rg = extractResourceGroup(id)
      const location = job.location ?? 'unknown'
      const status = job.status ?? ''
      return {
        id: `az-databox-${name}`,
        label: `DataBox: ${name}`,
        type: 'data-box',
        category: 'migration',
        region: location,
        metadata: {
          resourceId: id,
          resourceGroup: rg,
          status,
          sku: job.sku ? str(job.sku.name) : '',
          transferType: str(job.transferType),
          isCancellable: str(job.isCancellable),
          isDeletable: str(job.isDeletable),
          isShippingAddressEditable: str(job.isShippingAddressEditable),
          isPrepareToShipEnabled: str(job.isPrepareToShipEnabled),
          startTime: job.startTime?.toISOString?.() ?? str(job.startTime),
          deliveryType: str(job.deliveryType),
        },
        status: status.toLowerCase() === 'completed' ? 'healthy' : status.toLowerCase() === 'cancelled' ? 'error' : 'warning',
        importance: 5,
      }
    },
  },
]
