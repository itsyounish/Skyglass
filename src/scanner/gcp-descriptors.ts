/**
 * Declarative GCP Service Descriptors
 *
 * Each descriptor defines how to scan a specific GCP service:
 * - Which SDK package and client to use
 * - Which method lists the resources
 * - How to map each raw resource into an InfraNode
 *
 * This mirrors the AWS descriptor pattern (descriptors.ts) for GCP.
 * New services can be added by creating a new descriptor -- no scanner
 * boilerplate needed.
 *
 * These descriptors cover services NOT already in the imperative gcp.ts
 * scanner (which handles VPC, Compute Engine, Cloud Run, BigQuery,
 * Cloud Storage, and Pub/Sub).
 */

import type { InfraNode, NodeCategory, HealthStatus } from '../types'

// ---------------------------------------------------------------------------
// Descriptor interface
// ---------------------------------------------------------------------------

export interface GCPServiceDescriptor {
  /** Internal resource type key (e.g. 'cloud-sql', 'cloud-functions') */
  type: string
  /** Node category for the viewer */
  category: NodeCategory
  /** NPM package for the GCP SDK client */
  sdkPackage: string
  /** Name of the client class to instantiate from the package */
  clientClass: string
  /** Name of the method that lists resources */
  listMethod: string
  /** Default importance score (1-10) for this resource type */
  importance: number
  /** Map a raw GCP SDK resource + projectId into an InfraNode (minus `provider` field) */
  mapResource: (resource: any, projectId: string) => Omit<InfraNode, 'provider'>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val)
}

function gcpHealth(status: string | undefined): HealthStatus {
  if (!status) return 'warning'
  const s = status.toUpperCase()
  if (s === 'RUNNING' || s === 'RUNNABLE' || s === 'READY' || s === 'ACTIVE' || s === 'ENABLED') return 'healthy'
  if (s === 'STAGING' || s === 'PROVISIONING' || s === 'PENDING' || s === 'CREATING') return 'warning'
  return 'error'
}

// ---------------------------------------------------------------------------
// Descriptors for NEW GCP services (not in the existing imperative scanner)
// ---------------------------------------------------------------------------

export const GCP_SERVICE_DESCRIPTORS: GCPServiceDescriptor[] = [
  // -----------------------------------------------------------------------
  // Cloud SQL -- Managed relational database instances
  // -----------------------------------------------------------------------
  {
    type: 'cloud-sql',
    category: 'database',
    sdkPackage: '@google-cloud/sql',
    clientClass: 'SqlInstancesServiceClient',
    listMethod: 'list',
    importance: 8,
    mapResource: (instance: any, projectId: string) => {
      const name = instance.name ?? 'unknown'
      const region = instance.region ?? instance.gceZone?.replace(/-[a-z]$/, '') ?? 'unknown'
      const state = instance.state ?? ''
      const dbVersion = instance.databaseVersion ?? ''
      const tier = instance.settings?.tier ?? ''
      return {
        id: `gcp-cloudsql-${name}`,
        label: `SQL: ${name}`,
        type: 'cloud-sql',
        category: 'database',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/instances/${name}`,
          name,
          databaseVersion: dbVersion,
          tier,
          state,
          ipAddress: instance.ipAddresses?.[0]?.ipAddress ?? '',
          storageSize: str(instance.settings?.dataDiskSizeGb) + ' GB',
          backupEnabled: str(instance.settings?.backupConfiguration?.enabled ?? false),
          availabilityType: str(instance.settings?.availabilityType ?? 'ZONAL'),
          connectionName: instance.connectionName ?? '',
        },
        status: gcpHealth(state),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Functions -- Serverless functions
  // -----------------------------------------------------------------------
  {
    type: 'cloud-function',
    category: 'serverless',
    sdkPackage: '@google-cloud/functions',
    clientClass: 'FunctionServiceClient',
    listMethod: 'listFunctions',
    importance: 6,
    mapResource: (fn: any, projectId: string) => {
      // The resource name is projects/{project}/locations/{location}/functions/{function}
      const fullName = fn.name ?? ''
      const parts = fullName.split('/')
      const fnName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = fn.state ?? ''
      const runtime = fn.buildConfig?.runtime ?? ''
      const entryPoint = fn.buildConfig?.entryPoint ?? ''
      return {
        id: `gcp-gcf-${fnName}`,
        label: `Fn: ${fnName}`,
        type: 'cloud-function',
        category: 'serverless',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: fnName,
          state,
          runtime,
          entryPoint,
          environment: str(fn.environment),
          availableMemory: str(fn.serviceConfig?.availableMemory ?? ''),
          timeoutSeconds: str(fn.serviceConfig?.timeoutSeconds ?? ''),
          maxInstanceCount: str(fn.serviceConfig?.maxInstanceCount ?? ''),
          ingressSettings: str(fn.serviceConfig?.ingressSettings ?? ''),
          updateTime: fn.updateTime ?? '',
        },
        status: gcpHealth(state),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Memorystore / Redis -- Managed Redis instances
  // -----------------------------------------------------------------------
  {
    type: 'memorystore-redis',
    category: 'database',
    sdkPackage: '@google-cloud/redis',
    clientClass: 'CloudRedisClient',
    listMethod: 'listInstances',
    importance: 7,
    mapResource: (instance: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/instances/{instance}
      const fullName = instance.name ?? ''
      const parts = fullName.split('/')
      const instanceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = instance.state ?? ''
      return {
        id: `gcp-redis-${instanceName}`,
        label: `Redis: ${instanceName}`,
        type: 'memorystore-redis',
        category: 'database',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: instanceName,
          state: str(state),
          tier: str(instance.tier),
          memorySizeGb: str(instance.memorySizeGb),
          redisVersion: str(instance.redisVersion),
          host: str(instance.host),
          port: str(instance.port),
          displayName: str(instance.displayName),
          authorizedNetwork: str(instance.authorizedNetwork),
          connectMode: str(instance.connectMode),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'READY' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Artifact Registry -- Container and package repositories
  // -----------------------------------------------------------------------
  {
    type: 'artifact-registry',
    category: 'storage',
    sdkPackage: '@google-cloud/artifact-registry',
    clientClass: 'ArtifactRegistryClient',
    listMethod: 'listRepositories',
    importance: 5,
    mapResource: (repo: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/repositories/{repo}
      const fullName = repo.name ?? ''
      const parts = fullName.split('/')
      const repoName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const format = repo.format ?? ''
      return {
        id: `gcp-ar-${repoName}`,
        label: `AR: ${repoName}`,
        type: 'artifact-registry',
        category: 'storage',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: repoName,
          format: str(format),
          description: str(repo.description),
          mode: str(repo.mode),
          sizeBytes: str(repo.sizeBytes),
          createTime: repo.createTime ?? '',
          updateTime: repo.updateTime ?? '',
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Armor -- Security policies (WAF)
  // -----------------------------------------------------------------------
  {
    type: 'cloud-armor',
    category: 'security',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'SecurityPoliciesClient',
    listMethod: 'list',
    importance: 7,
    mapResource: (policy: any, projectId: string) => {
      const name = policy.name ?? 'unknown'
      const ruleCount = policy.rules?.length ?? 0
      return {
        id: `gcp-armor-${name}`,
        label: `Armor: ${name}`,
        type: 'cloud-armor',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/securityPolicies/${name}`,
          name,
          selfLink: str(policy.selfLink),
          description: str(policy.description),
          type: str(policy.type),
          rules: str(ruleCount),
          adaptiveProtection: str(policy.adaptiveProtectionConfig ? 'enabled' : 'disabled'),
          creationTimestamp: str(policy.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud DNS -- Managed zones
  // -----------------------------------------------------------------------
  {
    type: 'cloud-dns',
    category: 'network',
    sdkPackage: '@google-cloud/dns',
    clientClass: 'DNS',
    listMethod: 'getZones',
    importance: 6,
    mapResource: (zone: any, projectId: string) => {
      const zoneName = zone.name ?? zone.id ?? 'unknown'
      const dnsName = zone.metadata?.dnsName ?? zone.dnsName ?? ''
      const visibility = zone.metadata?.visibility ?? zone.visibility ?? 'public'
      return {
        id: `gcp-dns-${zoneName}`,
        label: `DNS: ${dnsName.replace(/\.$/, '') || zoneName}`,
        type: 'cloud-dns',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/managedZones/${zoneName}`,
          name: zoneName,
          dnsName,
          visibility: str(visibility),
          description: str(zone.metadata?.description ?? zone.description ?? ''),
          nameServers: (zone.metadata?.nameServers ?? zone.nameServers ?? []).join(', '),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // GKE -- Google Kubernetes Engine clusters
  // -----------------------------------------------------------------------
  {
    type: 'gke',
    category: 'container',
    sdkPackage: '@google-cloud/container',
    clientClass: 'ClusterManagerClient',
    listMethod: 'listClusters',
    importance: 9,
    mapResource: (cluster: any, projectId: string) => {
      const name = cluster.name ?? 'unknown'
      const location = cluster.location ?? cluster.zone ?? 'unknown'
      const status = cluster.status ?? ''
      const nodeCount = cluster.currentNodeCount ?? 0
      return {
        id: `gcp-gke-${name}`,
        label: `GKE: ${name}`,
        type: 'gke',
        category: 'container',
        region: location,
        metadata: {
          resourcePath: `projects/${projectId}/locations/${location}/clusters/${name}`,
          name,
          status: str(status),
          currentMasterVersion: str(cluster.currentMasterVersion),
          currentNodeVersion: str(cluster.currentNodeVersion),
          nodeCount: str(nodeCount),
          network: str(cluster.network),
          subnetwork: str(cluster.subnetwork),
          endpoint: str(cluster.endpoint),
          clusterIpv4Cidr: str(cluster.clusterIpv4Cidr),
          servicesIpv4Cidr: str(cluster.servicesIpv4Cidr),
          releaseChannel: str(cluster.releaseChannel?.channel ?? ''),
          autopilot: str(cluster.autopilot?.enabled ?? false),
          createTime: str(cluster.createTime),
        },
        status: gcpHealth(typeof status === 'number' ? (status === 2 ? 'RUNNING' : 'PENDING') : str(status)),
        importance: 9,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Spanner -- Globally distributed database
  // -----------------------------------------------------------------------
  {
    type: 'cloud-spanner',
    category: 'database',
    sdkPackage: '@google-cloud/spanner',
    clientClass: 'Spanner',
    listMethod: 'getInstances',
    importance: 9,
    mapResource: (instance: any, projectId: string) => {
      // Spanner instance object from the Node.js SDK
      const fullName = instance.name ?? instance.id ?? 'unknown'
      const instanceName = fullName.split('/').pop() ?? fullName
      const metadata = instance.metadata ?? {}
      const state = metadata.state ?? ''
      return {
        id: `gcp-spanner-${instanceName}`,
        label: `Spanner: ${instanceName}`,
        type: 'cloud-spanner',
        category: 'database',
        region: metadata.config?.split('/').pop() ?? 'unknown',
        metadata: {
          resourcePath: `projects/${projectId}/instances/${instanceName}`,
          name: instanceName,
          displayName: str(metadata.displayName),
          state: str(state),
          nodeCount: str(metadata.nodeCount),
          processingUnits: str(metadata.processingUnits),
          config: str(metadata.config),
          createTime: str(metadata.createTime),
          updateTime: str(metadata.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'READY' : 'PENDING') : str(state)),
        importance: 9,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Firestore -- NoSQL document database
  // -----------------------------------------------------------------------
  {
    type: 'firestore',
    category: 'database',
    sdkPackage: '@google-cloud/firestore',
    clientClass: 'Firestore',
    listMethod: 'listCollections',
    importance: 7,
    mapResource: (collection: any, projectId: string) => {
      // Firestore listCollections returns collection references
      const collectionId = collection.id ?? collection._queryOptions?.collectionId ?? 'unknown'
      return {
        id: `gcp-firestore-${collectionId}`,
        label: `Firestore: ${collectionId}`,
        type: 'firestore',
        category: 'database',
        region: 'default',
        metadata: {
          resourcePath: `projects/${projectId}/databases/(default)/documents/${collectionId}`,
          collectionId,
          projectId,
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Tasks -- Task queues
  // -----------------------------------------------------------------------
  {
    type: 'cloud-tasks',
    category: 'messaging',
    sdkPackage: '@google-cloud/tasks',
    clientClass: 'CloudTasksClient',
    listMethod: 'listQueues',
    importance: 6,
    mapResource: (queue: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/queues/{queue}
      const fullName = queue.name ?? ''
      const parts = fullName.split('/')
      const queueName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = queue.state ?? ''
      return {
        id: `gcp-tasks-${queueName}`,
        label: `Tasks: ${queueName}`,
        type: 'cloud-tasks',
        category: 'messaging',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: queueName,
          state: str(state),
          rateLimits: str(queue.rateLimits?.maxDispatchesPerSecond ?? ''),
          retryMaxAttempts: str(queue.retryConfig?.maxAttempts ?? ''),
          retryMinBackoff: str(queue.retryConfig?.minBackoff?.seconds ?? ''),
          retryMaxBackoff: str(queue.retryConfig?.maxBackoff?.seconds ?? ''),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Scheduler -- Managed cron jobs
  // -----------------------------------------------------------------------
  {
    type: 'cloud-scheduler',
    category: 'serverless',
    sdkPackage: '@google-cloud/scheduler',
    clientClass: 'CloudSchedulerClient',
    listMethod: 'listJobs',
    importance: 5,
    mapResource: (job: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/jobs/{job}
      const fullName = job.name ?? ''
      const parts = fullName.split('/')
      const jobName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = job.state ?? ''
      const schedule = job.schedule ?? ''

      // Determine target type and extract target details
      let targetType = 'unknown'
      let targetUri = ''
      if (job.httpTarget) {
        targetType = 'HTTP'
        targetUri = str(job.httpTarget.uri)
      } else if (job.appEngineHttpTarget) {
        targetType = 'App Engine'
        targetUri = str(job.appEngineHttpTarget.relativeUri)
      } else if (job.pubsubTarget) {
        targetType = 'Pub/Sub'
        targetUri = str(job.pubsubTarget.topicName)
      }

      return {
        id: `gcp-scheduler-${jobName}`,
        label: `Cron: ${jobName}`,
        type: 'cloud-scheduler',
        category: 'serverless',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: jobName,
          state: str(state),
          schedule,
          timezone: str(job.timeZone),
          targetType,
          targetUri,
          lastAttemptTime: str(job.lastAttemptTime),
          scheduleTime: str(job.scheduleTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ENABLED' : 'PENDING') : str(state)),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // COMPUTE
  // =======================================================================

  // -----------------------------------------------------------------------
  // Compute Engine Instances
  // -----------------------------------------------------------------------
  {
    type: 'compute-instance',
    category: 'compute',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'InstancesClient',
    listMethod: 'aggregatedList',
    importance: 8,
    mapResource: (instance: any, projectId: string) => {
      const name = instance.name ?? 'unknown'
      const zone = instance.zone?.split('/').pop() ?? 'unknown'
      const region = zone.replace(/-[a-z]$/, '')
      const status = instance.status ?? ''
      return {
        id: `gcp-instance-${name}`,
        label: `VM: ${name}`,
        type: 'compute-instance',
        category: 'compute',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/zones/${zone}/instances/${name}`,
          name,
          status: str(status),
          machineType: str(instance.machineType?.split('/').pop() ?? ''),
          zone,
          networkInterfaces: str(instance.networkInterfaces?.length ?? 0),
          externalIp: str(instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? ''),
          internalIp: str(instance.networkInterfaces?.[0]?.networkIP ?? ''),
          disks: str(instance.disks?.length ?? 0),
          creationTimestamp: str(instance.creationTimestamp),
        },
        status: gcpHealth(status),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Instance Groups (Managed)
  // -----------------------------------------------------------------------
  {
    type: 'compute-instance-group',
    category: 'compute',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'InstanceGroupManagersClient',
    listMethod: 'aggregatedList',
    importance: 7,
    mapResource: (group: any, projectId: string) => {
      const name = group.name ?? 'unknown'
      const zone = group.zone?.split('/').pop() ?? 'unknown'
      const region = zone.replace(/-[a-z]$/, '')
      const status = group.status?.isStable ? 'RUNNING' : 'PENDING'
      return {
        id: `gcp-ig-${name}`,
        label: `IG: ${name}`,
        type: 'compute-instance-group',
        category: 'compute',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/zones/${zone}/instanceGroupManagers/${name}`,
          name,
          status,
          targetSize: str(group.targetSize),
          instanceTemplate: str(group.instanceTemplate?.split('/').pop() ?? ''),
          baseInstanceName: str(group.baseInstanceName),
          currentActions: str(JSON.stringify(group.currentActions ?? {})),
          creationTimestamp: str(group.creationTimestamp),
        },
        status: gcpHealth(status),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Instance Templates
  // -----------------------------------------------------------------------
  {
    type: 'compute-instance-template',
    category: 'compute',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'InstanceTemplatesClient',
    listMethod: 'list',
    importance: 4,
    mapResource: (template: any, projectId: string) => {
      const name = template.name ?? 'unknown'
      const machineType = template.properties?.machineType ?? ''
      return {
        id: `gcp-it-${name}`,
        label: `Template: ${name}`,
        type: 'compute-instance-template',
        category: 'compute',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/instanceTemplates/${name}`,
          name,
          machineType: str(machineType),
          disks: str(template.properties?.disks?.length ?? 0),
          networkInterfaces: str(template.properties?.networkInterfaces?.length ?? 0),
          description: str(template.description),
          creationTimestamp: str(template.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Persistent Disks
  // -----------------------------------------------------------------------
  {
    type: 'compute-disk',
    category: 'compute',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'DisksClient',
    listMethod: 'aggregatedList',
    importance: 5,
    mapResource: (disk: any, projectId: string) => {
      const name = disk.name ?? 'unknown'
      const zone = disk.zone?.split('/').pop() ?? 'unknown'
      const region = zone.replace(/-[a-z]$/, '')
      const status = disk.status ?? ''
      return {
        id: `gcp-disk-${name}`,
        label: `Disk: ${name}`,
        type: 'compute-disk',
        category: 'compute',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/zones/${zone}/disks/${name}`,
          name,
          status: str(status),
          sizeGb: str(disk.sizeGb),
          type: str(disk.type?.split('/').pop() ?? ''),
          zone,
          sourceImage: str(disk.sourceImage?.split('/').pop() ?? ''),
          users: str(disk.users?.length ?? 0),
          creationTimestamp: str(disk.creationTimestamp),
        },
        status: gcpHealth(status),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Custom Images
  // -----------------------------------------------------------------------
  {
    type: 'compute-image',
    category: 'compute',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'ImagesClient',
    listMethod: 'list',
    importance: 3,
    mapResource: (image: any, projectId: string) => {
      const name = image.name ?? 'unknown'
      const status = image.status ?? ''
      return {
        id: `gcp-image-${name}`,
        label: `Image: ${name}`,
        type: 'compute-image',
        category: 'compute',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/images/${name}`,
          name,
          status: str(status),
          diskSizeGb: str(image.diskSizeGb),
          archiveSizeBytes: str(image.archiveSizeBytes),
          family: str(image.family),
          sourceType: str(image.sourceType),
          description: str(image.description),
          creationTimestamp: str(image.creationTimestamp),
        },
        status: gcpHealth(status),
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Disk Snapshots
  // -----------------------------------------------------------------------
  {
    type: 'compute-snapshot',
    category: 'compute',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'SnapshotsClient',
    listMethod: 'list',
    importance: 4,
    mapResource: (snapshot: any, projectId: string) => {
      const name = snapshot.name ?? 'unknown'
      const status = snapshot.status ?? ''
      return {
        id: `gcp-snapshot-${name}`,
        label: `Snapshot: ${name}`,
        type: 'compute-snapshot',
        category: 'compute',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/snapshots/${name}`,
          name,
          status: str(status),
          diskSizeGb: str(snapshot.diskSizeGb),
          storageBytes: str(snapshot.storageBytes),
          sourceDisk: str(snapshot.sourceDisk?.split('/').pop() ?? ''),
          storageLocations: str((snapshot.storageLocations ?? []).join(', ')),
          creationTimestamp: str(snapshot.creationTimestamp),
        },
        status: gcpHealth(status),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Machine Images
  // -----------------------------------------------------------------------
  {
    type: 'compute-machine-image',
    category: 'compute',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'MachineImagesClient',
    listMethod: 'list',
    importance: 3,
    mapResource: (machineImage: any, projectId: string) => {
      const name = machineImage.name ?? 'unknown'
      const status = machineImage.status ?? ''
      return {
        id: `gcp-machine-image-${name}`,
        label: `MachineImg: ${name}`,
        type: 'compute-machine-image',
        category: 'compute',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/machineImages/${name}`,
          name,
          status: str(status),
          sourceInstance: str(machineImage.sourceInstance?.split('/').pop() ?? ''),
          totalStorageBytes: str(machineImage.totalStorageBytes),
          description: str(machineImage.description),
          storageLocations: str((machineImage.storageLocations ?? []).join(', ')),
          creationTimestamp: str(machineImage.creationTimestamp),
        },
        status: gcpHealth(status),
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Sole-Tenant Nodes
  // -----------------------------------------------------------------------
  {
    type: 'sole-tenant',
    category: 'compute',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'NodeGroupsClient',
    listMethod: 'aggregatedList',
    importance: 6,
    mapResource: (nodeGroup: any, projectId: string) => {
      const name = nodeGroup.name ?? 'unknown'
      const zone = nodeGroup.zone?.split('/').pop() ?? 'unknown'
      const region = zone.replace(/-[a-z]$/, '')
      const status = nodeGroup.status ?? ''
      return {
        id: `gcp-sole-tenant-${name}`,
        label: `SoleTenant: ${name}`,
        type: 'sole-tenant',
        category: 'compute',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/zones/${zone}/nodeGroups/${name}`,
          name,
          status: str(status),
          zone,
          nodeTemplate: str(nodeGroup.nodeTemplate?.split('/').pop() ?? ''),
          size: str(nodeGroup.size),
          maintenancePolicy: str(nodeGroup.maintenancePolicy),
          creationTimestamp: str(nodeGroup.creationTimestamp),
        },
        status: gcpHealth(status),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Batch
  // -----------------------------------------------------------------------
  {
    type: 'batch',
    category: 'compute',
    sdkPackage: '@google-cloud/batch',
    clientClass: 'BatchServiceClient',
    listMethod: 'listJobs',
    importance: 5,
    mapResource: (job: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/jobs/{job}
      const fullName = job.name ?? ''
      const parts = fullName.split('/')
      const jobName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const status = job.status?.state ?? ''
      return {
        id: `gcp-batch-${jobName}`,
        label: `Batch: ${jobName}`,
        type: 'batch',
        category: 'compute',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: jobName,
          state: str(status),
          taskGroupsCount: str(job.taskGroups?.length ?? 0),
          priority: str(job.priority),
          createTime: str(job.createTime),
          updateTime: str(job.updateTime),
        },
        status: gcpHealth(str(status)),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Preemptible / Spot VMs (scanned as compute instances with scheduling)
  // -----------------------------------------------------------------------
  {
    type: 'preemptible-vm',
    category: 'compute',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'InstancesClient',
    listMethod: 'aggregatedList',
    importance: 5,
    mapResource: (instance: any, projectId: string) => {
      const name = instance.name ?? 'unknown'
      const zone = instance.zone?.split('/').pop() ?? 'unknown'
      const region = zone.replace(/-[a-z]$/, '')
      const status = instance.status ?? ''
      return {
        id: `gcp-spot-${name}`,
        label: `Spot: ${name}`,
        type: 'preemptible-vm',
        category: 'compute',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/zones/${zone}/instances/${name}`,
          name,
          status: str(status),
          machineType: str(instance.machineType?.split('/').pop() ?? ''),
          zone,
          preemptible: str(instance.scheduling?.preemptible ?? false),
          provisioningModel: str(instance.scheduling?.provisioningModel ?? ''),
          creationTimestamp: str(instance.creationTimestamp),
        },
        status: gcpHealth(status),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // DATABASE
  // =======================================================================

  // -----------------------------------------------------------------------
  // AlloyDB -- PostgreSQL-compatible managed database
  // -----------------------------------------------------------------------
  {
    type: 'alloydb',
    category: 'database',
    sdkPackage: '@google-cloud/alloydb',
    clientClass: 'AlloyDBAdminClient',
    listMethod: 'listClusters',
    importance: 8,
    mapResource: (cluster: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/clusters/{cluster}
      const fullName = cluster.name ?? ''
      const parts = fullName.split('/')
      const clusterName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = cluster.state ?? ''
      return {
        id: `gcp-alloydb-${clusterName}`,
        label: `AlloyDB: ${clusterName}`,
        type: 'alloydb',
        category: 'database',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: clusterName,
          state: str(state),
          databaseVersion: str(cluster.databaseVersion),
          network: str(cluster.network),
          displayName: str(cluster.displayName),
          clusterType: str(cluster.clusterType),
          createTime: str(cluster.createTime),
          updateTime: str(cluster.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'READY' : 'PENDING') : str(state)),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Bigtable -- Wide-column NoSQL
  // -----------------------------------------------------------------------
  {
    type: 'bigtable',
    category: 'database',
    sdkPackage: '@google-cloud/bigtable',
    clientClass: 'Bigtable',
    listMethod: 'getInstances',
    importance: 8,
    mapResource: (instance: any, projectId: string) => {
      const fullName = instance.name ?? instance.id ?? 'unknown'
      const instanceName = fullName.split('/').pop() ?? fullName
      const metadata = instance.metadata ?? {}
      const state = metadata.state ?? ''
      return {
        id: `gcp-bigtable-${instanceName}`,
        label: `Bigtable: ${instanceName}`,
        type: 'bigtable',
        category: 'database',
        region: 'multi-region',
        metadata: {
          resourcePath: `projects/${projectId}/instances/${instanceName}`,
          name: instanceName,
          displayName: str(metadata.displayName),
          state: str(state),
          type: str(metadata.type),
          createTime: str(metadata.createTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'READY' : 'PENDING') : str(state)),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Datastore -- NoSQL document database (project-level)
  // -----------------------------------------------------------------------
  {
    type: 'datastore',
    category: 'database',
    sdkPackage: '@google-cloud/datastore',
    clientClass: 'Datastore',
    listMethod: 'getProjectId',
    importance: 6,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-datastore-${projectId}`,
        label: `Datastore: ${projectId}`,
        type: 'datastore',
        category: 'database',
        region: 'default',
        metadata: {
          resourcePath: `projects/${projectId}/databases/datastore`,
          projectId,
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Bare Metal Solution
  // -----------------------------------------------------------------------
  {
    type: 'bare-metal-solution',
    category: 'database',
    sdkPackage: '@google-cloud/bare-metal-solution',
    clientClass: 'BareMetalSolutionClient',
    listMethod: 'listInstances',
    importance: 7,
    mapResource: (instance: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/instances/{instance}
      const fullName = instance.name ?? ''
      const parts = fullName.split('/')
      const instanceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = instance.state ?? ''
      return {
        id: `gcp-bms-${instanceName}`,
        label: `BMS: ${instanceName}`,
        type: 'bare-metal-solution',
        category: 'database',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: instanceName,
          state: str(state),
          machineType: str(instance.machineType),
          hyperthreadingEnabled: str(instance.hyperthreadingEnabled),
          osImage: str(instance.osImage),
          createTime: str(instance.createTime),
          updateTime: str(instance.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Database Migration Service
  // -----------------------------------------------------------------------
  {
    type: 'database-migration',
    category: 'database',
    sdkPackage: '@google-cloud/dms',
    clientClass: 'DataMigrationServiceClient',
    listMethod: 'listMigrationJobs',
    importance: 5,
    mapResource: (job: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/migrationJobs/{job}
      const fullName = job.name ?? ''
      const parts = fullName.split('/')
      const jobName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = job.state ?? ''
      return {
        id: `gcp-dms-${jobName}`,
        label: `DMS: ${jobName}`,
        type: 'database-migration',
        category: 'database',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: jobName,
          state: str(state),
          type: str(job.type),
          source: str(job.source),
          destination: str(job.destination),
          displayName: str(job.displayName),
          createTime: str(job.createTime),
          updateTime: str(job.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // STORAGE
  // =======================================================================

  // -----------------------------------------------------------------------
  // Filestore -- Managed NFS file storage
  // -----------------------------------------------------------------------
  {
    type: 'filestore',
    category: 'storage',
    sdkPackage: '@google-cloud/filestore',
    clientClass: 'CloudFilestoreManagerClient',
    listMethod: 'listInstances',
    importance: 6,
    mapResource: (instance: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/instances/{instance}
      const fullName = instance.name ?? ''
      const parts = fullName.split('/')
      const instanceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = instance.state ?? ''
      return {
        id: `gcp-filestore-${instanceName}`,
        label: `Filestore: ${instanceName}`,
        type: 'filestore',
        category: 'storage',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: instanceName,
          state: str(state),
          tier: str(instance.tier),
          capacityGb: str(instance.fileShares?.[0]?.capacityGb ?? ''),
          shareName: str(instance.fileShares?.[0]?.name ?? ''),
          network: str(instance.networks?.[0]?.network ?? ''),
          ipAddresses: str((instance.networks?.[0]?.ipAddresses ?? []).join(', ')),
          createTime: str(instance.createTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'READY' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Storage Transfer Service
  // -----------------------------------------------------------------------
  {
    type: 'storage-transfer',
    category: 'storage',
    sdkPackage: '@google-cloud/storage-transfer-service',
    clientClass: 'StorageTransferServiceClient',
    listMethod: 'listTransferJobs',
    importance: 4,
    mapResource: (job: any, projectId: string) => {
      const jobName = job.name ?? 'unknown'
      const status = job.status ?? ''
      return {
        id: `gcp-transfer-${jobName}`,
        label: `Transfer: ${jobName}`,
        type: 'storage-transfer',
        category: 'storage',
        region: 'global',
        metadata: {
          resourcePath: `transferJobs/${jobName}`,
          name: jobName,
          status: str(status),
          description: str(job.description),
          schedule: str(job.schedule ? 'scheduled' : 'manual'),
          projectId,
          creationTime: str(job.creationTime),
          lastModificationTime: str(job.lastModificationTime),
        },
        status: gcpHealth(status),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Backup and DR
  // -----------------------------------------------------------------------
  {
    type: 'backup-dr',
    category: 'storage',
    sdkPackage: '@google-cloud/backupdr',
    clientClass: 'BackupDRClient',
    listMethod: 'listBackupVaults',
    importance: 6,
    mapResource: (vault: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/backupVaults/{vault}
      const fullName = vault.name ?? ''
      const parts = fullName.split('/')
      const vaultName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = vault.state ?? ''
      return {
        id: `gcp-backupdr-${vaultName}`,
        label: `BackupDR: ${vaultName}`,
        type: 'backup-dr',
        category: 'storage',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: vaultName,
          state: str(state),
          description: str(vault.description),
          backupCount: str(vault.backupCount),
          totalStoredBytes: str(vault.totalStoredBytes),
          createTime: str(vault.createTime),
          updateTime: str(vault.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Parallelstore -- High-performance parallel file system
  // -----------------------------------------------------------------------
  {
    type: 'parallelstore',
    category: 'storage',
    sdkPackage: '@google-cloud/parallelstore',
    clientClass: 'ParallelstoreClient',
    listMethod: 'listInstances',
    importance: 5,
    mapResource: (instance: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/instances/{instance}
      const fullName = instance.name ?? ''
      const parts = fullName.split('/')
      const instanceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = instance.state ?? ''
      return {
        id: `gcp-parallelstore-${instanceName}`,
        label: `Parallelstore: ${instanceName}`,
        type: 'parallelstore',
        category: 'storage',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: instanceName,
          state: str(state),
          capacityGib: str(instance.capacityGib),
          description: str(instance.description),
          network: str(instance.network),
          createTime: str(instance.createTime),
          updateTime: str(instance.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // NETWORK
  // =======================================================================

  // -----------------------------------------------------------------------
  // VPC Networks
  // -----------------------------------------------------------------------
  {
    type: 'vpc-network',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'NetworksClient',
    listMethod: 'list',
    importance: 8,
    mapResource: (network: any, projectId: string) => {
      const name = network.name ?? 'unknown'
      return {
        id: `gcp-vpc-${name}`,
        label: `VPC: ${name}`,
        type: 'vpc-network',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/networks/${name}`,
          name,
          selfLink: str(network.selfLink),
          autoCreateSubnetworks: str(network.autoCreateSubnetworks),
          routingMode: str(network.routingConfig?.routingMode ?? ''),
          subnetworksCount: str(network.subnetworks?.length ?? 0),
          mtu: str(network.mtu),
          creationTimestamp: str(network.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Subnets
  // -----------------------------------------------------------------------
  {
    type: 'subnet',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'SubnetworksClient',
    listMethod: 'aggregatedList',
    importance: 6,
    mapResource: (subnet: any, projectId: string) => {
      const name = subnet.name ?? 'unknown'
      const region = subnet.region?.split('/').pop() ?? 'unknown'
      return {
        id: `gcp-subnet-${name}`,
        label: `Subnet: ${name}`,
        type: 'subnet',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/subnetworks/${name}`,
          name,
          ipCidrRange: str(subnet.ipCidrRange),
          network: str(subnet.network?.split('/').pop() ?? ''),
          region,
          purpose: str(subnet.purpose),
          privateIpGoogleAccess: str(subnet.privateIpGoogleAccess),
          stackType: str(subnet.stackType),
          creationTimestamp: str(subnet.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Firewall Rules
  // -----------------------------------------------------------------------
  {
    type: 'firewall-rule',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'FirewallsClient',
    listMethod: 'list',
    importance: 6,
    mapResource: (firewall: any, projectId: string) => {
      const name = firewall.name ?? 'unknown'
      return {
        id: `gcp-fw-${name}`,
        label: `FW: ${name}`,
        type: 'firewall-rule',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/firewalls/${name}`,
          name,
          direction: str(firewall.direction),
          priority: str(firewall.priority),
          network: str(firewall.network?.split('/').pop() ?? ''),
          disabled: str(firewall.disabled),
          sourceRanges: str((firewall.sourceRanges ?? []).join(', ')),
          destinationRanges: str((firewall.destinationRanges ?? []).join(', ')),
          allowed: str(JSON.stringify(firewall.allowed ?? [])),
          denied: str(JSON.stringify(firewall.denied ?? [])),
          creationTimestamp: str(firewall.creationTimestamp),
        },
        status: firewall.disabled ? ('warning' as HealthStatus) : ('healthy' as HealthStatus),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Firewall Policies
  // -----------------------------------------------------------------------
  {
    type: 'firewall-policy',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'FirewallPoliciesClient',
    listMethod: 'list',
    importance: 7,
    mapResource: (policy: any, projectId: string) => {
      const name = policy.name ?? 'unknown'
      const displayName = policy.displayName ?? name
      return {
        id: `gcp-fwpolicy-${name}`,
        label: `FWPolicy: ${displayName}`,
        type: 'firewall-policy',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/firewallPolicies/${name}`,
          name,
          displayName,
          description: str(policy.description),
          rulesCount: str(policy.rules?.length ?? 0),
          selfLink: str(policy.selfLink),
          creationTimestamp: str(policy.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud NAT
  // -----------------------------------------------------------------------
  {
    type: 'cloud-nat',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'RoutersClient',
    listMethod: 'aggregatedList',
    importance: 6,
    mapResource: (router: any, projectId: string) => {
      const name = router.name ?? 'unknown'
      const region = router.region?.split('/').pop() ?? 'unknown'
      const nats = router.nats ?? []
      const natName = nats[0]?.name ?? name
      return {
        id: `gcp-nat-${natName}`,
        label: `NAT: ${natName}`,
        type: 'cloud-nat',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/routers/${name}`,
          name: natName,
          routerName: name,
          region,
          sourceSubnetworkIpRangesToNat: str(nats[0]?.sourceSubnetworkIpRangesToNat ?? ''),
          natIpAllocateOption: str(nats[0]?.natIpAllocateOption ?? ''),
          minPortsPerVm: str(nats[0]?.minPortsPerVm ?? ''),
          creationTimestamp: str(router.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Router
  // -----------------------------------------------------------------------
  {
    type: 'cloud-router',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'RoutersClient',
    listMethod: 'aggregatedList',
    importance: 6,
    mapResource: (router: any, projectId: string) => {
      const name = router.name ?? 'unknown'
      const region = router.region?.split('/').pop() ?? 'unknown'
      return {
        id: `gcp-router-${name}`,
        label: `Router: ${name}`,
        type: 'cloud-router',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/routers/${name}`,
          name,
          region,
          network: str(router.network?.split('/').pop() ?? ''),
          bgpAsn: str(router.bgp?.asn ?? ''),
          bgpAdvertiseMode: str(router.bgp?.advertiseMode ?? ''),
          natsCount: str(router.nats?.length ?? 0),
          interfacesCount: str(router.interfaces?.length ?? 0),
          creationTimestamp: str(router.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud VPN Gateways
  // -----------------------------------------------------------------------
  {
    type: 'cloud-vpn',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'VpnGatewaysClient',
    listMethod: 'aggregatedList',
    importance: 7,
    mapResource: (gateway: any, projectId: string) => {
      const name = gateway.name ?? 'unknown'
      const region = gateway.region?.split('/').pop() ?? 'unknown'
      return {
        id: `gcp-vpn-${name}`,
        label: `VPN: ${name}`,
        type: 'cloud-vpn',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/vpnGateways/${name}`,
          name,
          region,
          network: str(gateway.network?.split('/').pop() ?? ''),
          vpnInterfaces: str(gateway.vpnInterfaces?.length ?? 0),
          stackType: str(gateway.stackType),
          creationTimestamp: str(gateway.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // VPN Tunnels
  // -----------------------------------------------------------------------
  {
    type: 'cloud-vpn-tunnel',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'VpnTunnelsClient',
    listMethod: 'aggregatedList',
    importance: 6,
    mapResource: (tunnel: any, projectId: string) => {
      const name = tunnel.name ?? 'unknown'
      const region = tunnel.region?.split('/').pop() ?? 'unknown'
      const status = tunnel.status ?? ''
      return {
        id: `gcp-vpn-tunnel-${name}`,
        label: `VPNTunnel: ${name}`,
        type: 'cloud-vpn-tunnel',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/vpnTunnels/${name}`,
          name,
          region,
          status: str(status),
          peerIp: str(tunnel.peerIp),
          vpnGateway: str(tunnel.vpnGateway?.split('/').pop() ?? ''),
          ikeVersion: str(tunnel.ikeVersion),
          detailedStatus: str(tunnel.detailedStatus),
          creationTimestamp: str(tunnel.creationTimestamp),
        },
        status: status === 'ESTABLISHED' ? ('healthy' as HealthStatus) : ('warning' as HealthStatus),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Interconnect
  // -----------------------------------------------------------------------
  {
    type: 'cloud-interconnect',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'InterconnectsClient',
    listMethod: 'list',
    importance: 8,
    mapResource: (interconnect: any, projectId: string) => {
      const name = interconnect.name ?? 'unknown'
      const state = interconnect.state ?? ''
      return {
        id: `gcp-interconnect-${name}`,
        label: `Interconnect: ${name}`,
        type: 'cloud-interconnect',
        category: 'network',
        region: str(interconnect.location?.split('/').pop() ?? 'global'),
        metadata: {
          resourcePath: `projects/${projectId}/global/interconnects/${name}`,
          name,
          state: str(state),
          interconnectType: str(interconnect.interconnectType),
          linkType: str(interconnect.linkType),
          operationalStatus: str(interconnect.operationalStatus),
          requestedLinkCount: str(interconnect.requestedLinkCount),
          provisionedLinkCount: str(interconnect.provisionedLinkCount),
          creationTimestamp: str(interconnect.creationTimestamp),
        },
        status: gcpHealth(state),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Interconnect Attachments (VLAN Attachments)
  // -----------------------------------------------------------------------
  {
    type: 'cloud-interconnect-attachment',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'InterconnectAttachmentsClient',
    listMethod: 'aggregatedList',
    importance: 6,
    mapResource: (attachment: any, projectId: string) => {
      const name = attachment.name ?? 'unknown'
      const region = attachment.region?.split('/').pop() ?? 'unknown'
      const state = attachment.state ?? ''
      return {
        id: `gcp-ic-attach-${name}`,
        label: `ICAttach: ${name}`,
        type: 'cloud-interconnect-attachment',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/interconnectAttachments/${name}`,
          name,
          state: str(state),
          region,
          type: str(attachment.type),
          router: str(attachment.router?.split('/').pop() ?? ''),
          interconnect: str(attachment.interconnect?.split('/').pop() ?? ''),
          bandwidth: str(attachment.bandwidth),
          vlanTag8021q: str(attachment.vlanTag8021q),
          creationTimestamp: str(attachment.creationTimestamp),
        },
        status: gcpHealth(state),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Backend Services (Load Balancer)
  // -----------------------------------------------------------------------
  {
    type: 'load-balancer-backend',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'BackendServicesClient',
    listMethod: 'aggregatedList',
    importance: 7,
    mapResource: (backend: any, projectId: string) => {
      const name = backend.name ?? 'unknown'
      const protocol = backend.protocol ?? ''
      return {
        id: `gcp-be-${name}`,
        label: `Backend: ${name}`,
        type: 'load-balancer-backend',
        category: 'network',
        region: str(backend.region?.split('/').pop() ?? 'global'),
        metadata: {
          resourcePath: `projects/${projectId}/global/backendServices/${name}`,
          name,
          protocol: str(protocol),
          loadBalancingScheme: str(backend.loadBalancingScheme),
          timeoutSec: str(backend.timeoutSec),
          backendsCount: str(backend.backends?.length ?? 0),
          healthChecks: str((backend.healthChecks ?? []).map((hc: string) => hc.split('/').pop()).join(', ')),
          enableCDN: str(backend.enableCDN),
          sessionAffinity: str(backend.sessionAffinity),
          creationTimestamp: str(backend.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // URL Maps (Load Balancer)
  // -----------------------------------------------------------------------
  {
    type: 'load-balancer-urlmap',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'UrlMapsClient',
    listMethod: 'list',
    importance: 6,
    mapResource: (urlMap: any, projectId: string) => {
      const name = urlMap.name ?? 'unknown'
      return {
        id: `gcp-urlmap-${name}`,
        label: `URLMap: ${name}`,
        type: 'load-balancer-urlmap',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/urlMaps/${name}`,
          name,
          defaultService: str(urlMap.defaultService?.split('/').pop() ?? ''),
          hostRulesCount: str(urlMap.hostRules?.length ?? 0),
          pathMatchersCount: str(urlMap.pathMatchers?.length ?? 0),
          description: str(urlMap.description),
          creationTimestamp: str(urlMap.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Forwarding Rules (Load Balancer)
  // -----------------------------------------------------------------------
  {
    type: 'load-balancer-forwarding',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'GlobalForwardingRulesClient',
    listMethod: 'list',
    importance: 7,
    mapResource: (rule: any, projectId: string) => {
      const name = rule.name ?? 'unknown'
      return {
        id: `gcp-fwd-${name}`,
        label: `Fwd: ${name}`,
        type: 'load-balancer-forwarding',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/forwardingRules/${name}`,
          name,
          IPAddress: str(rule.IPAddress),
          IPProtocol: str(rule.IPProtocol),
          portRange: str(rule.portRange),
          target: str(rule.target?.split('/').pop() ?? ''),
          loadBalancingScheme: str(rule.loadBalancingScheme),
          networkTier: str(rule.networkTier),
          creationTimestamp: str(rule.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Target Pools (Load Balancer)
  // -----------------------------------------------------------------------
  {
    type: 'load-balancer-target-pool',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'TargetPoolsClient',
    listMethod: 'aggregatedList',
    importance: 5,
    mapResource: (pool: any, projectId: string) => {
      const name = pool.name ?? 'unknown'
      const region = pool.region?.split('/').pop() ?? 'unknown'
      return {
        id: `gcp-tp-${name}`,
        label: `TargetPool: ${name}`,
        type: 'load-balancer-target-pool',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/targetPools/${name}`,
          name,
          region,
          sessionAffinity: str(pool.sessionAffinity),
          instancesCount: str(pool.instances?.length ?? 0),
          healthChecks: str((pool.healthChecks ?? []).map((hc: string) => hc.split('/').pop()).join(', ')),
          failoverRatio: str(pool.failoverRatio),
          creationTimestamp: str(pool.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Health Checks (Load Balancer)
  // -----------------------------------------------------------------------
  {
    type: 'load-balancer-health-check',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'HealthChecksClient',
    listMethod: 'aggregatedList',
    importance: 5,
    mapResource: (hc: any, projectId: string) => {
      const name = hc.name ?? 'unknown'
      return {
        id: `gcp-hc-${name}`,
        label: `HC: ${name}`,
        type: 'load-balancer-health-check',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/healthChecks/${name}`,
          name,
          type: str(hc.type),
          checkIntervalSec: str(hc.checkIntervalSec),
          timeoutSec: str(hc.timeoutSec),
          healthyThreshold: str(hc.healthyThreshold),
          unhealthyThreshold: str(hc.unhealthyThreshold),
          port: str(hc.tcpHealthCheck?.port ?? hc.httpHealthCheck?.port ?? hc.httpsHealthCheck?.port ?? ''),
          creationTimestamp: str(hc.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Endpoints
  // -----------------------------------------------------------------------
  {
    type: 'cloud-endpoints',
    category: 'network',
    sdkPackage: '@google-cloud/service-management',
    clientClass: 'ServiceManagerClient',
    listMethod: 'listServices',
    importance: 5,
    mapResource: (service: any, projectId: string) => {
      const serviceName = service.serviceName ?? 'unknown'
      return {
        id: `gcp-endpoint-${serviceName}`,
        label: `Endpoint: ${serviceName}`,
        type: 'cloud-endpoints',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `services/${serviceName}`,
          name: serviceName,
          producerProjectId: str(service.producerProjectId),
          projectId,
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Service Directory
  // -----------------------------------------------------------------------
  {
    type: 'service-directory',
    category: 'network',
    sdkPackage: '@google-cloud/service-directory',
    clientClass: 'RegistrationServiceClient',
    listMethod: 'listNamespaces',
    importance: 5,
    mapResource: (ns: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/namespaces/{namespace}
      const fullName = ns.name ?? ''
      const parts = fullName.split('/')
      const nsName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-sd-${nsName}`,
        label: `SvcDir: ${nsName}`,
        type: 'service-directory',
        category: 'network',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: nsName,
          location,
          labels: str(JSON.stringify(ns.labels ?? {})),
          createTime: str(ns.createTime),
          updateTime: str(ns.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Traffic Director (Network Services)
  // -----------------------------------------------------------------------
  {
    type: 'traffic-director',
    category: 'network',
    sdkPackage: '@google-cloud/network-services',
    clientClass: 'NetworkServicesClient',
    listMethod: 'listMeshes',
    importance: 6,
    mapResource: (mesh: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/meshes/{mesh}
      const fullName = mesh.name ?? ''
      const parts = fullName.split('/')
      const meshName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'global'
      return {
        id: `gcp-td-${meshName}`,
        label: `TrafficDir: ${meshName}`,
        type: 'traffic-director',
        category: 'network',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: meshName,
          description: str(mesh.description),
          interceptionPort: str(mesh.interceptionPort),
          createTime: str(mesh.createTime),
          updateTime: str(mesh.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Network Connectivity Center Hubs
  // -----------------------------------------------------------------------
  {
    type: 'network-connectivity-hub',
    category: 'network',
    sdkPackage: '@google-cloud/network-connectivity',
    clientClass: 'HubServiceClient',
    listMethod: 'listHubs',
    importance: 7,
    mapResource: (hub: any, projectId: string) => {
      // name = projects/{project}/locations/global/hubs/{hub}
      const fullName = hub.name ?? ''
      const parts = fullName.split('/')
      const hubName = parts[parts.length - 1] ?? 'unknown'
      const state = hub.state ?? ''
      return {
        id: `gcp-ncc-hub-${hubName}`,
        label: `NCCHub: ${hubName}`,
        type: 'network-connectivity-hub',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: hubName,
          state: str(state),
          description: str(hub.description),
          uniqueId: str(hub.uniqueId),
          createTime: str(hub.createTime),
          updateTime: str(hub.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Private Service Connect
  // -----------------------------------------------------------------------
  {
    type: 'private-service-connect',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'ServiceAttachmentsClient',
    listMethod: 'aggregatedList',
    importance: 6,
    mapResource: (attachment: any, projectId: string) => {
      const name = attachment.name ?? 'unknown'
      const region = attachment.region?.split('/').pop() ?? 'unknown'
      return {
        id: `gcp-psc-${name}`,
        label: `PSC: ${name}`,
        type: 'private-service-connect',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/serviceAttachments/${name}`,
          name,
          region,
          targetService: str(attachment.targetService?.split('/').pop() ?? ''),
          connectionPreference: str(attachment.connectionPreference),
          enableProxyProtocol: str(attachment.enableProxyProtocol),
          producerForwardingRule: str(attachment.producerForwardingRule?.split('/').pop() ?? ''),
          consumerCount: str(attachment.connectedEndpoints?.length ?? 0),
          creationTimestamp: str(attachment.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Network Intelligence Center
  // -----------------------------------------------------------------------
  {
    type: 'network-intelligence',
    category: 'network',
    sdkPackage: '@google-cloud/network-management',
    clientClass: 'ReachabilityServiceClient',
    listMethod: 'listConnectivityTests',
    importance: 4,
    mapResource: (test: any, projectId: string) => {
      // name = projects/{project}/locations/global/connectivityTests/{test}
      const fullName = test.name ?? ''
      const parts = fullName.split('/')
      const testName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-nic-${testName}`,
        label: `ConnTest: ${testName}`,
        type: 'network-intelligence',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: testName,
          description: str(test.description),
          protocol: str(test.protocol),
          reachabilityDetails: str(test.reachabilityDetails?.result ?? ''),
          createTime: str(test.createTime),
          updateTime: str(test.updateTime),
        },
        status: test.reachabilityDetails?.result === 'REACHABLE' ? ('healthy' as HealthStatus) : ('warning' as HealthStatus),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Packet Mirroring
  // -----------------------------------------------------------------------
  {
    type: 'packet-mirroring',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'PacketMirroringsClient',
    listMethod: 'aggregatedList',
    importance: 4,
    mapResource: (pm: any, projectId: string) => {
      const name = pm.name ?? 'unknown'
      const region = pm.region?.split('/').pop() ?? 'unknown'
      const enable = pm.enable ?? ''
      return {
        id: `gcp-pm-${name}`,
        label: `PktMirror: ${name}`,
        type: 'packet-mirroring',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/packetMirrorings/${name}`,
          name,
          region,
          enable: str(enable),
          network: str(pm.network?.url?.split('/').pop() ?? ''),
          collectorIlb: str(pm.collectorIlb?.url?.split('/').pop() ?? ''),
          description: str(pm.description),
          creationTimestamp: str(pm.creationTimestamp),
        },
        status: enable === 'TRUE' ? ('healthy' as HealthStatus) : ('warning' as HealthStatus),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SSL Certificates
  // -----------------------------------------------------------------------
  {
    type: 'ssl-certificate',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'SslCertificatesClient',
    listMethod: 'list',
    importance: 5,
    mapResource: (cert: any, projectId: string) => {
      const name = cert.name ?? 'unknown'
      return {
        id: `gcp-sslcert-${name}`,
        label: `SSL: ${name}`,
        type: 'ssl-certificate',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/sslCertificates/${name}`,
          name,
          type: str(cert.type),
          subjectAlternativeNames: str((cert.subjectAlternativeNames ?? []).join(', ')),
          expireTime: str(cert.expireTime),
          managed: str(cert.managed ? 'true' : 'false'),
          description: str(cert.description),
          creationTimestamp: str(cert.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SSL Policies
  // -----------------------------------------------------------------------
  {
    type: 'ssl-policy',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'SslPoliciesClient',
    listMethod: 'list',
    importance: 4,
    mapResource: (policy: any, projectId: string) => {
      const name = policy.name ?? 'unknown'
      return {
        id: `gcp-sslpolicy-${name}`,
        label: `SSLPolicy: ${name}`,
        type: 'ssl-policy',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/sslPolicies/${name}`,
          name,
          profile: str(policy.profile),
          minTlsVersion: str(policy.minTlsVersion),
          enabledFeatures: str((policy.enabledFeatures ?? []).join(', ')),
          customFeatures: str((policy.customFeatures ?? []).join(', ')),
          description: str(policy.description),
          creationTimestamp: str(policy.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // External IP Addresses (Regional)
  // -----------------------------------------------------------------------
  {
    type: 'external-ip',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'AddressesClient',
    listMethod: 'aggregatedList',
    importance: 4,
    mapResource: (address: any, projectId: string) => {
      const name = address.name ?? 'unknown'
      const region = address.region?.split('/').pop() ?? 'unknown'
      const status = address.status ?? ''
      return {
        id: `gcp-ip-${name}`,
        label: `IP: ${name}`,
        type: 'external-ip',
        category: 'network',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/addresses/${name}`,
          name,
          status: str(status),
          address: str(address.address),
          addressType: str(address.addressType),
          purpose: str(address.purpose),
          networkTier: str(address.networkTier),
          users: str((address.users ?? []).map((u: string) => u.split('/').pop()).join(', ')),
          creationTimestamp: str(address.creationTimestamp),
        },
        status: status === 'IN_USE' ? ('healthy' as HealthStatus) : ('warning' as HealthStatus),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Global IP Addresses
  // -----------------------------------------------------------------------
  {
    type: 'global-ip',
    category: 'network',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'GlobalAddressesClient',
    listMethod: 'list',
    importance: 4,
    mapResource: (address: any, projectId: string) => {
      const name = address.name ?? 'unknown'
      const status = address.status ?? ''
      return {
        id: `gcp-global-ip-${name}`,
        label: `GlobalIP: ${name}`,
        type: 'global-ip',
        category: 'network',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/addresses/${name}`,
          name,
          status: str(status),
          address: str(address.address),
          addressType: str(address.addressType),
          purpose: str(address.purpose),
          networkTier: str(address.networkTier),
          users: str((address.users ?? []).map((u: string) => u.split('/').pop()).join(', ')),
          creationTimestamp: str(address.creationTimestamp),
        },
        status: status === 'IN_USE' ? ('healthy' as HealthStatus) : ('warning' as HealthStatus),
        importance: 4,
      }
    },
  },

  // =======================================================================
  // CDN
  // =======================================================================

  // -----------------------------------------------------------------------
  // Cloud CDN (backend services with CDN enabled)
  // -----------------------------------------------------------------------
  {
    type: 'cloud-cdn',
    category: 'cdn',
    sdkPackage: '@google-cloud/compute',
    clientClass: 'BackendServicesClient',
    listMethod: 'aggregatedList',
    importance: 6,
    mapResource: (backend: any, projectId: string) => {
      const name = backend.name ?? 'unknown'
      return {
        id: `gcp-cdn-${name}`,
        label: `CDN: ${name}`,
        type: 'cloud-cdn',
        category: 'cdn',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/backendServices/${name}`,
          name,
          enableCDN: str(backend.enableCDN),
          cacheMode: str(backend.cdnPolicy?.cacheMode ?? ''),
          defaultTtl: str(backend.cdnPolicy?.defaultTtl ?? ''),
          maxTtl: str(backend.cdnPolicy?.maxTtl ?? ''),
          clientTtl: str(backend.cdnPolicy?.clientTtl ?? ''),
          signedUrlCacheMaxAgeSec: str(backend.cdnPolicy?.signedUrlCacheMaxAgeSec ?? ''),
          cacheKeyPolicy: str(backend.cdnPolicy?.cacheKeyPolicy ? 'configured' : 'default'),
          creationTimestamp: str(backend.creationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // =======================================================================
  // MESSAGING
  // =======================================================================

  // -----------------------------------------------------------------------
  // Pub/Sub Subscriptions
  // -----------------------------------------------------------------------
  {
    type: 'pubsub-subscription',
    category: 'messaging',
    sdkPackage: '@google-cloud/pubsub',
    clientClass: 'PubSub',
    listMethod: 'getSubscriptions',
    importance: 6,
    mapResource: (subscription: any, projectId: string) => {
      const fullName = subscription.name ?? subscription.metadata?.name ?? 'unknown'
      const subName = fullName.split('/').pop() ?? fullName
      return {
        id: `gcp-pubsub-sub-${subName}`,
        label: `Sub: ${subName}`,
        type: 'pubsub-subscription',
        category: 'messaging',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/subscriptions/${subName}`,
          name: subName,
          topic: str(subscription.metadata?.topic?.split('/').pop() ?? subscription.topic ?? ''),
          ackDeadlineSeconds: str(subscription.metadata?.ackDeadlineSeconds ?? ''),
          pushEndpoint: str(subscription.metadata?.pushConfig?.pushEndpoint ?? ''),
          messageRetentionDuration: str(subscription.metadata?.messageRetentionDuration?.seconds ?? ''),
          expirationPolicy: str(subscription.metadata?.expirationPolicy?.ttl?.seconds ?? 'never'),
          deadLetterPolicy: str(subscription.metadata?.deadLetterPolicy ? 'configured' : 'none'),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Pub/Sub Schemas
  // -----------------------------------------------------------------------
  {
    type: 'pubsub-schema',
    category: 'messaging',
    sdkPackage: '@google-cloud/pubsub',
    clientClass: 'SchemaServiceClient',
    listMethod: 'listSchemas',
    importance: 4,
    mapResource: (schema: any, projectId: string) => {
      // name = projects/{project}/schemas/{schema}
      const fullName = schema.name ?? ''
      const parts = fullName.split('/')
      const schemaName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-pubsub-schema-${schemaName}`,
        label: `Schema: ${schemaName}`,
        type: 'pubsub-schema',
        category: 'messaging',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: schemaName,
          type: str(schema.type),
          revisionId: str(schema.revisionId),
          revisionCreateTime: str(schema.revisionCreateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Eventarc Triggers
  // -----------------------------------------------------------------------
  {
    type: 'eventarc',
    category: 'messaging',
    sdkPackage: '@google-cloud/eventarc',
    clientClass: 'EventarcClient',
    listMethod: 'listTriggers',
    importance: 5,
    mapResource: (trigger: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/triggers/{trigger}
      const fullName = trigger.name ?? ''
      const parts = fullName.split('/')
      const triggerName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-eventarc-${triggerName}`,
        label: `Eventarc: ${triggerName}`,
        type: 'eventarc',
        category: 'messaging',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: triggerName,
          destination: str(trigger.destination?.cloudRun?.service ?? trigger.destination?.cloudFunction ?? ''),
          transport: str(trigger.transport?.pubsub?.topic ?? ''),
          matchingCriteria: str(trigger.eventFilters?.map((f: any) => `${f.attribute}=${f.value}`).join(', ') ?? ''),
          channel: str(trigger.channel),
          createTime: str(trigger.createTime),
          updateTime: str(trigger.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Eventarc Channels
  // -----------------------------------------------------------------------
  {
    type: 'eventarc-channel',
    category: 'messaging',
    sdkPackage: '@google-cloud/eventarc',
    clientClass: 'EventarcClient',
    listMethod: 'listChannels',
    importance: 4,
    mapResource: (channel: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/channels/{channel}
      const fullName = channel.name ?? ''
      const parts = fullName.split('/')
      const channelName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = channel.state ?? ''
      return {
        id: `gcp-eventarc-ch-${channelName}`,
        label: `EventarcCh: ${channelName}`,
        type: 'eventarc-channel',
        category: 'messaging',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: channelName,
          state: str(state),
          provider: str(channel.provider),
          pubsubTopic: str(channel.pubsubTopic),
          createTime: str(channel.createTime),
          updateTime: str(channel.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Workflows
  // -----------------------------------------------------------------------
  {
    type: 'workflows',
    category: 'messaging',
    sdkPackage: '@google-cloud/workflows',
    clientClass: 'WorkflowsClient',
    listMethod: 'listWorkflows',
    importance: 5,
    mapResource: (workflow: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/workflows/{workflow}
      const fullName = workflow.name ?? ''
      const parts = fullName.split('/')
      const workflowName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = workflow.state ?? ''
      return {
        id: `gcp-workflow-${workflowName}`,
        label: `Workflow: ${workflowName}`,
        type: 'workflows',
        category: 'messaging',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: workflowName,
          state: str(state),
          description: str(workflow.description),
          revisionId: str(workflow.revisionId),
          serviceAccount: str(workflow.serviceAccount),
          createTime: str(workflow.createTime),
          updateTime: str(workflow.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // ANALYTICS
  // =======================================================================

  // -----------------------------------------------------------------------
  // Dataflow Jobs
  // -----------------------------------------------------------------------
  {
    type: 'dataflow',
    category: 'analytics',
    sdkPackage: '@google-cloud/dataflow',
    clientClass: 'JobsV1Beta3Client',
    listMethod: 'listJobs',
    importance: 7,
    mapResource: (job: any, projectId: string) => {
      const jobName = job.name ?? 'unknown'
      const jobId = job.id ?? 'unknown'
      const location = job.location ?? 'unknown'
      const currentState = job.currentState ?? ''
      return {
        id: `gcp-dataflow-${jobId}`,
        label: `Dataflow: ${jobName}`,
        type: 'dataflow',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: `projects/${projectId}/locations/${location}/jobs/${jobId}`,
          name: jobName,
          jobId,
          currentState: str(currentState),
          type: str(job.type),
          sdkVersion: str(job.jobMetadata?.sdkVersion?.version ?? ''),
          createTime: str(job.createTime),
          startTime: str(job.startTime),
        },
        status: gcpHealth(str(currentState).replace('JOB_STATE_', '')),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Dataproc Clusters
  // -----------------------------------------------------------------------
  {
    type: 'dataproc',
    category: 'analytics',
    sdkPackage: '@google-cloud/dataproc',
    clientClass: 'ClusterControllerClient',
    listMethod: 'listClusters',
    importance: 7,
    mapResource: (cluster: any, projectId: string) => {
      const clusterName = cluster.clusterName ?? 'unknown'
      const region = cluster.config?.gceClusterConfig?.zoneUri?.split('/').pop()?.replace(/-[a-z]$/, '') ?? 'unknown'
      const state = cluster.status?.state ?? ''
      return {
        id: `gcp-dataproc-${clusterName}`,
        label: `Dataproc: ${clusterName}`,
        type: 'dataproc',
        category: 'analytics',
        region,
        metadata: {
          resourcePath: `projects/${projectId}/regions/${region}/clusters/${clusterName}`,
          name: clusterName,
          state: str(state),
          masterNumInstances: str(cluster.config?.masterConfig?.numInstances ?? ''),
          workerNumInstances: str(cluster.config?.workerConfig?.numInstances ?? ''),
          imageVersion: str(cluster.config?.softwareConfig?.imageVersion ?? ''),
          clusterUuid: str(cluster.clusterUuid),
          createTime: str(cluster.status?.stateStartTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Dataproc Metastore
  // -----------------------------------------------------------------------
  {
    type: 'dataproc-metastore',
    category: 'analytics',
    sdkPackage: '@google-cloud/dataproc-metastore',
    clientClass: 'DataprocMetastoreClient',
    listMethod: 'listServices',
    importance: 5,
    mapResource: (service: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/services/{service}
      const fullName = service.name ?? ''
      const parts = fullName.split('/')
      const serviceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = service.state ?? ''
      return {
        id: `gcp-metastore-${serviceName}`,
        label: `Metastore: ${serviceName}`,
        type: 'dataproc-metastore',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: serviceName,
          state: str(state),
          tier: str(service.tier),
          port: str(service.port),
          endpointUri: str(service.endpointUri),
          network: str(service.network),
          createTime: str(service.createTime),
          updateTime: str(service.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Data Fusion
  // -----------------------------------------------------------------------
  {
    type: 'data-fusion',
    category: 'analytics',
    sdkPackage: '@google-cloud/data-fusion',
    clientClass: 'DataFusionClient',
    listMethod: 'listInstances',
    importance: 6,
    mapResource: (instance: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/instances/{instance}
      const fullName = instance.name ?? ''
      const parts = fullName.split('/')
      const instanceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = instance.state ?? ''
      return {
        id: `gcp-datafusion-${instanceName}`,
        label: `DataFusion: ${instanceName}`,
        type: 'data-fusion',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: instanceName,
          state: str(state),
          type: str(instance.type),
          version: str(instance.version),
          serviceEndpoint: str(instance.serviceEndpoint),
          apiEndpoint: str(instance.apiEndpoint),
          zone: str(instance.zone),
          createTime: str(instance.createTime),
          updateTime: str(instance.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Composer (Managed Airflow)
  // -----------------------------------------------------------------------
  {
    type: 'composer',
    category: 'analytics',
    sdkPackage: '@google-cloud/orchestration-airflow',
    clientClass: 'EnvironmentsClient',
    listMethod: 'listEnvironments',
    importance: 7,
    mapResource: (env: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/environments/{environment}
      const fullName = env.name ?? ''
      const parts = fullName.split('/')
      const envName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = env.state ?? ''
      return {
        id: `gcp-composer-${envName}`,
        label: `Composer: ${envName}`,
        type: 'composer',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: envName,
          state: str(state),
          airflowUri: str(env.config?.airflowUri),
          dagGcsPrefix: str(env.config?.dagGcsPrefix),
          nodeCount: str(env.config?.nodeCount),
          softwareVersion: str(env.config?.softwareConfig?.imageVersion ?? ''),
          environmentSize: str(env.config?.environmentSize ?? ''),
          createTime: str(env.createTime),
          updateTime: str(env.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Dataform Repositories
  // -----------------------------------------------------------------------
  {
    type: 'dataform',
    category: 'analytics',
    sdkPackage: '@google-cloud/dataform',
    clientClass: 'DataformClient',
    listMethod: 'listRepositories',
    importance: 5,
    mapResource: (repo: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/repositories/{repo}
      const fullName = repo.name ?? ''
      const parts = fullName.split('/')
      const repoName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-dataform-${repoName}`,
        label: `Dataform: ${repoName}`,
        type: 'dataform',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: repoName,
          gitRemoteUrl: str(repo.gitRemoteSettings?.url ?? ''),
          defaultBranch: str(repo.gitRemoteSettings?.defaultBranch ?? ''),
          displayName: str(repo.displayName),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Dataplex Lakes
  // -----------------------------------------------------------------------
  {
    type: 'dataplex',
    category: 'analytics',
    sdkPackage: '@google-cloud/dataplex',
    clientClass: 'DataplexServiceClient',
    listMethod: 'listLakes',
    importance: 6,
    mapResource: (lake: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/lakes/{lake}
      const fullName = lake.name ?? ''
      const parts = fullName.split('/')
      const lakeName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = lake.state ?? ''
      return {
        id: `gcp-dataplex-${lakeName}`,
        label: `Dataplex: ${lakeName}`,
        type: 'dataplex',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: lakeName,
          state: str(state),
          displayName: str(lake.displayName),
          description: str(lake.description),
          serviceAccount: str(lake.serviceAccount),
          createTime: str(lake.createTime),
          updateTime: str(lake.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Data Catalog
  // -----------------------------------------------------------------------
  {
    type: 'data-catalog',
    category: 'analytics',
    sdkPackage: '@google-cloud/datacatalog',
    clientClass: 'DataCatalogClient',
    listMethod: 'searchCatalog',
    importance: 5,
    mapResource: (result: any, projectId: string) => {
      const relativeResourceName = result.relativeResourceName ?? 'unknown'
      const displayName = result.displayName ?? relativeResourceName.split('/').pop() ?? 'unknown'
      return {
        id: `gcp-datacatalog-${displayName}`,
        label: `Catalog: ${displayName}`,
        type: 'data-catalog',
        category: 'analytics',
        region: 'global',
        metadata: {
          resourcePath: str(relativeResourceName),
          name: displayName,
          searchResultType: str(result.searchResultType),
          searchResultSubtype: str(result.searchResultSubtype),
          linkedResource: str(result.linkedResource),
          fullyQualifiedName: str(result.fullyQualifiedName),
          modifyTime: str(result.modifyTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Looker Instances
  // -----------------------------------------------------------------------
  {
    type: 'looker',
    category: 'analytics',
    sdkPackage: '@google-cloud/looker',
    clientClass: 'LookerClient',
    listMethod: 'listInstances',
    importance: 7,
    mapResource: (instance: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/instances/{instance}
      const fullName = instance.name ?? ''
      const parts = fullName.split('/')
      const instanceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = instance.state ?? ''
      return {
        id: `gcp-looker-${instanceName}`,
        label: `Looker: ${instanceName}`,
        type: 'looker',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: instanceName,
          state: str(state),
          platformEdition: str(instance.platformEdition),
          lookerUri: str(instance.lookerUri),
          publicIpEnabled: str(instance.publicIpEnabled),
          createTime: str(instance.createTime),
          updateTime: str(instance.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // BigQuery Reservations
  // -----------------------------------------------------------------------
  {
    type: 'bigquery-reservation',
    category: 'analytics',
    sdkPackage: '@google-cloud/bigquery-reservation',
    clientClass: 'ReservationServiceClient',
    listMethod: 'listReservations',
    importance: 6,
    mapResource: (reservation: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/reservations/{reservation}
      const fullName = reservation.name ?? ''
      const parts = fullName.split('/')
      const resName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-bq-res-${resName}`,
        label: `BQRes: ${resName}`,
        type: 'bigquery-reservation',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: resName,
          slotCapacity: str(reservation.slotCapacity),
          ignoreIdleSlots: str(reservation.ignoreIdleSlots),
          edition: str(reservation.edition),
          creationTime: str(reservation.creationTime),
          updateTime: str(reservation.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // BigQuery Connections
  // -----------------------------------------------------------------------
  {
    type: 'bigquery-connection',
    category: 'analytics',
    sdkPackage: '@google-cloud/bigquery-connection',
    clientClass: 'ConnectionServiceClient',
    listMethod: 'listConnections',
    importance: 5,
    mapResource: (connection: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/connections/{connection}
      const fullName = connection.name ?? ''
      const parts = fullName.split('/')
      const connName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-bq-conn-${connName}`,
        label: `BQConn: ${connName}`,
        type: 'bigquery-connection',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: connName,
          friendlyName: str(connection.friendlyName),
          description: str(connection.description),
          hasCloudSql: str(!!connection.cloudSql),
          hasCloudSpanner: str(!!connection.cloudSpanner),
          hasCloudResource: str(!!connection.cloudResource),
          creationTime: str(connection.creationTime),
          lastModifiedTime: str(connection.lastModifiedTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // BigQuery Data Transfer
  // -----------------------------------------------------------------------
  {
    type: 'bigquery-data-transfer',
    category: 'analytics',
    sdkPackage: '@google-cloud/bigquery-data-transfer',
    clientClass: 'DataTransferServiceClient',
    listMethod: 'listTransferConfigs',
    importance: 5,
    mapResource: (config: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/transferConfigs/{config}
      const fullName = config.name ?? ''
      const parts = fullName.split('/')
      const configName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = config.state ?? ''
      return {
        id: `gcp-bq-transfer-${configName}`,
        label: `BQTransfer: ${str(config.displayName || configName)}`,
        type: 'bigquery-data-transfer',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: configName,
          displayName: str(config.displayName),
          state: str(state),
          dataSourceId: str(config.dataSourceId),
          destinationDatasetId: str(config.destinationDatasetId),
          schedule: str(config.schedule),
          updateTime: str(config.updateTime),
          nextRunTime: str(config.nextRunTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Data Lineage (part of Dataplex)
  // -----------------------------------------------------------------------
  {
    type: 'data-lineage',
    category: 'analytics',
    sdkPackage: '@google-cloud/dataplex',
    clientClass: 'DataplexServiceClient',
    listMethod: 'listLakes',
    importance: 4,
    mapResource: (lake: any, projectId: string) => {
      const fullName = lake.name ?? ''
      const parts = fullName.split('/')
      const lakeName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-lineage-${lakeName}`,
        label: `Lineage: ${lakeName}`,
        type: 'data-lineage',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: lakeName,
          displayName: str(lake.displayName),
          projectId,
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Analytics Hub
  // -----------------------------------------------------------------------
  {
    type: 'analytics-hub',
    category: 'analytics',
    sdkPackage: '@google-cloud/bigquery-analyticshub',
    clientClass: 'AnalyticsHubServiceClient',
    listMethod: 'listDataExchanges',
    importance: 5,
    mapResource: (exchange: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/dataExchanges/{exchange}
      const fullName = exchange.name ?? ''
      const parts = fullName.split('/')
      const exchangeName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-analyticshub-${exchangeName}`,
        label: `AHub: ${str(exchange.displayName || exchangeName)}`,
        type: 'analytics-hub',
        category: 'analytics',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: exchangeName,
          displayName: str(exchange.displayName),
          description: str(exchange.description),
          primaryContact: str(exchange.primaryContact),
          listingCount: str(exchange.listingCount),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  // SECURITY
  // =======================================================================

  // -----------------------------------------------------------------------
  // IAM Service Accounts
  // -----------------------------------------------------------------------
  {
    type: 'iam-service-account',
    category: 'security',
    sdkPackage: '@google-cloud/iam',
    clientClass: 'IAMClient',
    listMethod: 'listServiceAccounts',
    importance: 7,
    mapResource: (sa: any, projectId: string) => {
      const email = sa.email ?? 'unknown'
      const name = sa.displayName ?? email.split('@')[0] ?? 'unknown'
      const disabled = sa.disabled ?? false
      return {
        id: `gcp-sa-${email}`,
        label: `SA: ${name}`,
        type: 'iam-service-account',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/serviceAccounts/${sa.uniqueId ?? email}`,
          name,
          email,
          uniqueId: str(sa.uniqueId),
          disabled: str(disabled),
          description: str(sa.description),
          oauth2ClientId: str(sa.oauth2ClientId),
        },
        status: disabled ? ('warning' as HealthStatus) : ('healthy' as HealthStatus),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IAM Policies (organizational level)
  // -----------------------------------------------------------------------
  {
    type: 'iam-policy',
    category: 'security',
    sdkPackage: '@google-cloud/resource-manager',
    clientClass: 'ProjectsClient',
    listMethod: 'getIamPolicy',
    importance: 8,
    mapResource: (policy: any, projectId: string) => {
      const bindingsCount = policy.bindings?.length ?? 0
      return {
        id: `gcp-iam-policy-${projectId}`,
        label: `IAMPolicy: ${projectId}`,
        type: 'iam-policy',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          bindingsCount: str(bindingsCount),
          version: str(policy.version),
          etag: str(policy.etag),
        },
        status: 'healthy' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Secret Manager
  // -----------------------------------------------------------------------
  {
    type: 'secret-manager',
    category: 'security',
    sdkPackage: '@google-cloud/secret-manager',
    clientClass: 'SecretManagerServiceClient',
    listMethod: 'listSecrets',
    importance: 7,
    mapResource: (secret: any, projectId: string) => {
      // name = projects/{project}/secrets/{secret}
      const fullName = secret.name ?? ''
      const parts = fullName.split('/')
      const secretName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-secret-${secretName}`,
        label: `Secret: ${secretName}`,
        type: 'secret-manager',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: secretName,
          replication: str(secret.replication?.automatic ? 'automatic' : 'user-managed'),
          createTime: str(secret.createTime),
          labels: str(JSON.stringify(secret.labels ?? {})),
          versionCount: str(secret.versionAliases ? Object.keys(secret.versionAliases).length : ''),
          expireTime: str(secret.expireTime ?? 'never'),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud KMS Key Rings
  // -----------------------------------------------------------------------
  {
    type: 'kms',
    category: 'security',
    sdkPackage: '@google-cloud/kms',
    clientClass: 'KeyManagementServiceClient',
    listMethod: 'listKeyRings',
    importance: 8,
    mapResource: (keyRing: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/keyRings/{keyRing}
      const fullName = keyRing.name ?? ''
      const parts = fullName.split('/')
      const keyRingName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-kms-${keyRingName}`,
        label: `KMS: ${keyRingName}`,
        type: 'kms',
        category: 'security',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: keyRingName,
          location,
          createTime: str(keyRing.createTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Security Command Center
  // -----------------------------------------------------------------------
  {
    type: 'security-command-center',
    category: 'security',
    sdkPackage: '@google-cloud/security-center',
    clientClass: 'SecurityCenterClient',
    listMethod: 'listSources',
    importance: 8,
    mapResource: (source: any, projectId: string) => {
      // name = organizations/{org}/sources/{source}
      const fullName = source.name ?? ''
      const parts = fullName.split('/')
      const sourceName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-scc-${sourceName}`,
        label: `SCC: ${str(source.displayName || sourceName)}`,
        type: 'security-command-center',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: sourceName,
          displayName: str(source.displayName),
          description: str(source.description),
        },
        status: 'healthy' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Binary Authorization
  // -----------------------------------------------------------------------
  {
    type: 'binary-authorization',
    category: 'security',
    sdkPackage: '@google-cloud/binary-authorization',
    clientClass: 'BinauthzManagementServiceV1Client',
    listMethod: 'getPolicy',
    importance: 7,
    mapResource: (policy: any, projectId: string) => {
      const name = policy.name ?? `projects/${projectId}/policy`
      return {
        id: `gcp-binauth-${projectId}`,
        label: `BinAuth: ${projectId}`,
        type: 'binary-authorization',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: name,
          projectId,
          defaultAdmissionRule: str(policy.defaultAdmissionRule?.evaluationMode ?? ''),
          globalPolicyEvaluationMode: str(policy.globalPolicyEvaluationMode),
          clusterAdmissionRulesCount: str(Object.keys(policy.clusterAdmissionRules ?? {}).length),
          updateTime: str(policy.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Certificate Authority Service (CAS)
  // -----------------------------------------------------------------------
  {
    type: 'certificate-authority',
    category: 'security',
    sdkPackage: '@google-cloud/security-private-ca',
    clientClass: 'CertificateAuthorityServiceClient',
    listMethod: 'listCertificateAuthorities',
    importance: 7,
    mapResource: (ca: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/caPools/{pool}/certificateAuthorities/{ca}
      const fullName = ca.name ?? ''
      const parts = fullName.split('/')
      const caName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = ca.state ?? ''
      return {
        id: `gcp-ca-${caName}`,
        label: `CA: ${caName}`,
        type: 'certificate-authority',
        category: 'security',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: caName,
          state: str(state),
          type: str(ca.type),
          tier: str(ca.tier),
          lifetime: str(ca.lifetime?.seconds ?? ''),
          caPool: str(parts[5] ?? ''),
          createTime: str(ca.createTime),
          updateTime: str(ca.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'ENABLED' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Certificate Manager
  // -----------------------------------------------------------------------
  {
    type: 'certificate-manager',
    category: 'security',
    sdkPackage: '@google-cloud/certificate-manager',
    clientClass: 'CertificateManagerClient',
    listMethod: 'listCertificates',
    importance: 6,
    mapResource: (cert: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/certificates/{certificate}
      const fullName = cert.name ?? ''
      const parts = fullName.split('/')
      const certName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-certmgr-${certName}`,
        label: `Cert: ${certName}`,
        type: 'certificate-manager',
        category: 'security',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: certName,
          scope: str(cert.scope),
          sanDnsnames: str((cert.sanDnsnames ?? []).join(', ')),
          managed: str(cert.managed ? 'true' : 'false'),
          expireTime: str(cert.expireTime),
          createTime: str(cert.createTime),
          updateTime: str(cert.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Access Context Manager
  // -----------------------------------------------------------------------
  {
    type: 'access-context-manager',
    category: 'security',
    sdkPackage: '@google-cloud/access-context-manager',
    clientClass: 'AccessContextManagerClient',
    listMethod: 'listAccessPolicies',
    importance: 7,
    mapResource: (policy: any, projectId: string) => {
      // name = accessPolicies/{policy}
      const fullName = policy.name ?? ''
      const parts = fullName.split('/')
      const policyName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-acm-${policyName}`,
        label: `ACM: ${str(policy.title || policyName)}`,
        type: 'access-context-manager',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: policyName,
          title: str(policy.title),
          parent: str(policy.parent),
          scopes: str((policy.scopes ?? []).join(', ')),
          etag: str(policy.etag),
          createTime: str(policy.createTime),
          updateTime: str(policy.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // reCAPTCHA Enterprise
  // -----------------------------------------------------------------------
  {
    type: 'recaptcha-enterprise',
    category: 'security',
    sdkPackage: '@google-cloud/recaptcha-enterprise',
    clientClass: 'RecaptchaEnterpriseServiceClient',
    listMethod: 'listKeys',
    importance: 5,
    mapResource: (key: any, projectId: string) => {
      // name = projects/{project}/keys/{key}
      const fullName = key.name ?? ''
      const parts = fullName.split('/')
      const keyName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-recaptcha-${keyName}`,
        label: `reCAPTCHA: ${str(key.displayName || keyName)}`,
        type: 'recaptcha-enterprise',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: keyName,
          displayName: str(key.displayName),
          hasWebSettings: str(!!key.webSettings),
          hasAndroidSettings: str(!!key.androidSettings),
          hasIosSettings: str(!!key.iosSettings),
          createTime: str(key.createTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Web Security Scanner
  // -----------------------------------------------------------------------
  {
    type: 'web-security-scanner',
    category: 'security',
    sdkPackage: '@google-cloud/web-security-scanner',
    clientClass: 'WebSecurityScannerClient',
    listMethod: 'listScanConfigs',
    importance: 5,
    mapResource: (config: any, projectId: string) => {
      // name = projects/{project}/scanConfigs/{config}
      const fullName = config.name ?? ''
      const parts = fullName.split('/')
      const configName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-wss-${configName}`,
        label: `WSS: ${str(config.displayName || configName)}`,
        type: 'web-security-scanner',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: configName,
          displayName: str(config.displayName),
          startingUrls: str((config.startingUrls ?? []).join(', ')),
          userAgent: str(config.userAgent),
          maxQps: str(config.maxQps),
          schedule: str(config.schedule?.scheduleTime ?? 'manual'),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Assured Workloads
  // -----------------------------------------------------------------------
  {
    type: 'assured-workloads',
    category: 'security',
    sdkPackage: '@google-cloud/assured-workloads',
    clientClass: 'AssuredWorkloadsServiceClient',
    listMethod: 'listWorkloads',
    importance: 7,
    mapResource: (workload: any, projectId: string) => {
      // name = organizations/{org}/locations/{location}/workloads/{workload}
      const fullName = workload.name ?? ''
      const parts = fullName.split('/')
      const workloadName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-assured-${workloadName}`,
        label: `Assured: ${str(workload.displayName || workloadName)}`,
        type: 'assured-workloads',
        category: 'security',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: workloadName,
          displayName: str(workload.displayName),
          complianceRegime: str(workload.complianceRegime),
          billingAccount: str(workload.billingAccount),
          createTime: str(workload.createTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // VPC Service Controls (perimeters -- part of Access Context Manager)
  // -----------------------------------------------------------------------
  {
    type: 'vpc-service-controls',
    category: 'security',
    sdkPackage: '@google-cloud/access-context-manager',
    clientClass: 'AccessContextManagerClient',
    listMethod: 'listServicePerimeters',
    importance: 7,
    mapResource: (perimeter: any, projectId: string) => {
      // name = accessPolicies/{policy}/servicePerimeters/{perimeter}
      const fullName = perimeter.name ?? ''
      const parts = fullName.split('/')
      const perimeterName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-vpcsc-${perimeterName}`,
        label: `VPCSC: ${str(perimeter.title || perimeterName)}`,
        type: 'vpc-service-controls',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: perimeterName,
          title: str(perimeter.title),
          perimeterType: str(perimeter.perimeterType),
          resourcesCount: str(perimeter.status?.resources?.length ?? 0),
          restrictedServices: str((perimeter.status?.restrictedServices ?? []).length),
          accessLevels: str((perimeter.status?.accessLevels ?? []).length),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Organization Policy
  // -----------------------------------------------------------------------
  {
    type: 'org-policy',
    category: 'security',
    sdkPackage: '@google-cloud/org-policy',
    clientClass: 'OrgPolicyClient',
    listMethod: 'listPolicies',
    importance: 6,
    mapResource: (policy: any, projectId: string) => {
      // name = projects/{project}/policies/{policy}
      const fullName = policy.name ?? ''
      const parts = fullName.split('/')
      const policyName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-orgpolicy-${policyName}`,
        label: `OrgPolicy: ${policyName}`,
        type: 'org-policy',
        category: 'security',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: policyName,
          constraint: str(policy.spec?.rules?.[0]?.condition ?? ''),
          enforced: str(policy.spec?.rules?.[0]?.enforce ?? ''),
          updateTime: str(policy.spec?.updateTime),
          etag: str(policy.spec?.etag),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // =======================================================================
  // ML (Machine Learning)
  // =======================================================================

  // -----------------------------------------------------------------------
  // Vertex AI Endpoints
  // -----------------------------------------------------------------------
  {
    type: 'vertex-ai-endpoint',
    category: 'ml',
    sdkPackage: '@google-cloud/aiplatform',
    clientClass: 'EndpointServiceClient',
    listMethod: 'listEndpoints',
    importance: 8,
    mapResource: (endpoint: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/endpoints/{endpoint}
      const fullName = endpoint.name ?? ''
      const parts = fullName.split('/')
      const endpointName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-vertex-ep-${endpointName}`,
        label: `VertexEP: ${str(endpoint.displayName || endpointName)}`,
        type: 'vertex-ai-endpoint',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: endpointName,
          displayName: str(endpoint.displayName),
          deployedModelsCount: str(endpoint.deployedModels?.length ?? 0),
          description: str(endpoint.description),
          trafficSplit: str(JSON.stringify(endpoint.trafficSplit ?? {})),
          createTime: str(endpoint.createTime),
          updateTime: str(endpoint.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Vertex AI Models
  // -----------------------------------------------------------------------
  {
    type: 'vertex-ai-model',
    category: 'ml',
    sdkPackage: '@google-cloud/aiplatform',
    clientClass: 'ModelServiceClient',
    listMethod: 'listModels',
    importance: 7,
    mapResource: (model: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/models/{model}
      const fullName = model.name ?? ''
      const parts = fullName.split('/')
      const modelName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-vertex-model-${modelName}`,
        label: `VertexModel: ${str(model.displayName || modelName)}`,
        type: 'vertex-ai-model',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: modelName,
          displayName: str(model.displayName),
          description: str(model.description),
          versionId: str(model.versionId),
          artifactUri: str(model.artifactUri),
          containerImageUri: str(model.containerSpec?.imageUri ?? ''),
          createTime: str(model.createTime),
          updateTime: str(model.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Vertex AI Datasets
  // -----------------------------------------------------------------------
  {
    type: 'vertex-ai-dataset',
    category: 'ml',
    sdkPackage: '@google-cloud/aiplatform',
    clientClass: 'DatasetServiceClient',
    listMethod: 'listDatasets',
    importance: 6,
    mapResource: (dataset: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/datasets/{dataset}
      const fullName = dataset.name ?? ''
      const parts = fullName.split('/')
      const datasetName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-vertex-ds-${datasetName}`,
        label: `VertexDS: ${str(dataset.displayName || datasetName)}`,
        type: 'vertex-ai-dataset',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: datasetName,
          displayName: str(dataset.displayName),
          description: str(dataset.description),
          metadataSchemaUri: str(dataset.metadataSchemaUri),
          dataItemCount: str(dataset.dataItemCount),
          createTime: str(dataset.createTime),
          updateTime: str(dataset.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Vertex AI Pipelines
  // -----------------------------------------------------------------------
  {
    type: 'vertex-ai-pipeline',
    category: 'ml',
    sdkPackage: '@google-cloud/aiplatform',
    clientClass: 'PipelineServiceClient',
    listMethod: 'listPipelineJobs',
    importance: 6,
    mapResource: (pipeline: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/pipelineJobs/{pipeline}
      const fullName = pipeline.name ?? ''
      const parts = fullName.split('/')
      const pipelineName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = pipeline.state ?? ''
      return {
        id: `gcp-vertex-pipeline-${pipelineName}`,
        label: `VertexPipe: ${str(pipeline.displayName || pipelineName)}`,
        type: 'vertex-ai-pipeline',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: pipelineName,
          displayName: str(pipeline.displayName),
          state: str(state),
          templateUri: str(pipeline.templateUri),
          serviceAccount: str(pipeline.serviceAccount),
          createTime: str(pipeline.createTime),
          startTime: str(pipeline.startTime),
          endTime: str(pipeline.endTime),
          updateTime: str(pipeline.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 4 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Vertex AI Training Jobs
  // -----------------------------------------------------------------------
  {
    type: 'vertex-ai-training',
    category: 'ml',
    sdkPackage: '@google-cloud/aiplatform',
    clientClass: 'JobServiceClient',
    listMethod: 'listCustomJobs',
    importance: 6,
    mapResource: (job: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/customJobs/{job}
      const fullName = job.name ?? ''
      const parts = fullName.split('/')
      const jobName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = job.state ?? ''
      return {
        id: `gcp-vertex-train-${jobName}`,
        label: `VertexTrain: ${str(job.displayName || jobName)}`,
        type: 'vertex-ai-training',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: jobName,
          displayName: str(job.displayName),
          state: str(state),
          createTime: str(job.createTime),
          startTime: str(job.startTime),
          endTime: str(job.endTime),
          updateTime: str(job.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 3 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Vertex AI Feature Store
  // -----------------------------------------------------------------------
  {
    type: 'vertex-ai-featurestore',
    category: 'ml',
    sdkPackage: '@google-cloud/aiplatform',
    clientClass: 'FeaturestoreServiceClient',
    listMethod: 'listFeaturestores',
    importance: 6,
    mapResource: (fs: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/featurestores/{featurestore}
      const fullName = fs.name ?? ''
      const parts = fullName.split('/')
      const fsName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = fs.state ?? ''
      return {
        id: `gcp-vertex-fs-${fsName}`,
        label: `VertexFS: ${fsName}`,
        type: 'vertex-ai-featurestore',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: fsName,
          state: str(state),
          onlineServingConfig: str(fs.onlineServingConfig?.fixedNodeCount ?? ''),
          entityTypeCount: str(fs.entityTypeCount),
          createTime: str(fs.createTime),
          updateTime: str(fs.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Vertex AI TensorBoard
  // -----------------------------------------------------------------------
  {
    type: 'vertex-ai-tensorboard',
    category: 'ml',
    sdkPackage: '@google-cloud/aiplatform',
    clientClass: 'TensorboardServiceClient',
    listMethod: 'listTensorboards',
    importance: 5,
    mapResource: (tb: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/tensorboards/{tensorboard}
      const fullName = tb.name ?? ''
      const parts = fullName.split('/')
      const tbName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-vertex-tb-${tbName}`,
        label: `VertexTB: ${str(tb.displayName || tbName)}`,
        type: 'vertex-ai-tensorboard',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: tbName,
          displayName: str(tb.displayName),
          description: str(tb.description),
          runCount: str(tb.runCount),
          blobStoragePathPrefix: str(tb.blobStoragePathPrefix),
          createTime: str(tb.createTime),
          updateTime: str(tb.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Vertex AI Notebooks / Workbench
  // -----------------------------------------------------------------------
  {
    type: 'vertex-ai-notebook',
    category: 'ml',
    sdkPackage: '@google-cloud/notebooks',
    clientClass: 'NotebookServiceClient',
    listMethod: 'listInstances',
    importance: 6,
    mapResource: (instance: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/instances/{instance}
      const fullName = instance.name ?? ''
      const parts = fullName.split('/')
      const instanceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = instance.state ?? ''
      return {
        id: `gcp-notebook-${instanceName}`,
        label: `Notebook: ${instanceName}`,
        type: 'vertex-ai-notebook',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: instanceName,
          state: str(state),
          machineType: str(instance.machineType?.split('/').pop() ?? ''),
          framework: str(instance.containerImage?.repository ?? instance.vmImage?.imageFamily ?? ''),
          proxyUri: str(instance.proxyUri),
          createTime: str(instance.createTime),
          updateTime: str(instance.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Vertex AI Metadata Store
  // -----------------------------------------------------------------------
  {
    type: 'vertex-ai-metadata',
    category: 'ml',
    sdkPackage: '@google-cloud/aiplatform',
    clientClass: 'MetadataServiceClient',
    listMethod: 'listMetadataStores',
    importance: 4,
    mapResource: (store: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/metadataStores/{store}
      const fullName = store.name ?? ''
      const parts = fullName.split('/')
      const storeName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-vertex-meta-${storeName}`,
        label: `VertexMeta: ${storeName}`,
        type: 'vertex-ai-metadata',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: storeName,
          description: str(store.description),
          createTime: str(store.createTime),
          updateTime: str(store.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // AutoML
  // -----------------------------------------------------------------------
  {
    type: 'automl',
    category: 'ml',
    sdkPackage: '@google-cloud/automl',
    clientClass: 'AutoMlClient',
    listMethod: 'listModels',
    importance: 6,
    mapResource: (model: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/models/{model}
      const fullName = model.name ?? ''
      const parts = fullName.split('/')
      const modelName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const deploymentState = model.deploymentState ?? ''
      return {
        id: `gcp-automl-${modelName}`,
        label: `AutoML: ${str(model.displayName || modelName)}`,
        type: 'automl',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: modelName,
          displayName: str(model.displayName),
          deploymentState: str(deploymentState),
          datasetId: str(model.datasetId),
          createTime: str(model.createTime),
          updateTime: str(model.updateTime),
        },
        status: deploymentState === 'DEPLOYED' ? ('healthy' as HealthStatus) : ('warning' as HealthStatus),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Natural Language API (API-only, project-level)
  // -----------------------------------------------------------------------
  {
    type: 'natural-language',
    category: 'ml',
    sdkPackage: '@google-cloud/language',
    clientClass: 'LanguageServiceClient',
    listMethod: 'analyzeSentiment',
    importance: 3,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-nlp-${projectId}`,
        label: `NLP: ${projectId}`,
        type: 'natural-language',
        category: 'ml',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Natural Language API',
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Translation
  // -----------------------------------------------------------------------
  {
    type: 'translation',
    category: 'ml',
    sdkPackage: '@google-cloud/translate',
    clientClass: 'TranslationServiceClient',
    listMethod: 'listGlossaries',
    importance: 5,
    mapResource: (glossary: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/glossaries/{glossary}
      const fullName = glossary.name ?? ''
      const parts = fullName.split('/')
      const glossaryName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-translate-${glossaryName}`,
        label: `Translate: ${str(glossary.displayName || glossaryName)}`,
        type: 'translation',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: glossaryName,
          displayName: str(glossary.displayName),
          entryCount: str(glossary.entryCount),
          inputUri: str(glossary.inputConfig?.gcsSource?.inputUri ?? ''),
          submitTime: str(glossary.submitTime),
          endTime: str(glossary.endTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Vision (API-only, project-level)
  // -----------------------------------------------------------------------
  {
    type: 'vision-ai',
    category: 'ml',
    sdkPackage: '@google-cloud/vision',
    clientClass: 'ImageAnnotatorClient',
    listMethod: 'listProductSets',
    importance: 3,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-vision-${projectId}`,
        label: `Vision: ${projectId}`,
        type: 'vision-ai',
        category: 'ml',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Cloud Vision API',
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Speech-to-Text (API-only, project-level)
  // -----------------------------------------------------------------------
  {
    type: 'speech-to-text',
    category: 'ml',
    sdkPackage: '@google-cloud/speech',
    clientClass: 'SpeechClient',
    listMethod: 'listCustomClasses',
    importance: 3,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-stt-${projectId}`,
        label: `STT: ${projectId}`,
        type: 'speech-to-text',
        category: 'ml',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Speech-to-Text API',
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Text-to-Speech (API-only, project-level)
  // -----------------------------------------------------------------------
  {
    type: 'text-to-speech',
    category: 'ml',
    sdkPackage: '@google-cloud/text-to-speech',
    clientClass: 'TextToSpeechClient',
    listMethod: 'listVoices',
    importance: 3,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-tts-${projectId}`,
        label: `TTS: ${projectId}`,
        type: 'text-to-speech',
        category: 'ml',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Text-to-Speech API',
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Video Intelligence (API-only, project-level)
  // -----------------------------------------------------------------------
  {
    type: 'video-ai',
    category: 'ml',
    sdkPackage: '@google-cloud/video-intelligence',
    clientClass: 'VideoIntelligenceServiceClient',
    listMethod: 'annotateVideo',
    importance: 3,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-video-ai-${projectId}`,
        label: `VideoAI: ${projectId}`,
        type: 'video-ai',
        category: 'ml',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Video Intelligence API',
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Dialogflow CX Agents
  // -----------------------------------------------------------------------
  {
    type: 'dialogflow',
    category: 'ml',
    sdkPackage: '@google-cloud/dialogflow-cx',
    clientClass: 'AgentsClient',
    listMethod: 'listAgents',
    importance: 6,
    mapResource: (agent: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/agents/{agent}
      const fullName = agent.name ?? ''
      const parts = fullName.split('/')
      const agentName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-dialogflow-cx-${agentName}`,
        label: `DFCX: ${str(agent.displayName || agentName)}`,
        type: 'dialogflow',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: agentName,
          displayName: str(agent.displayName),
          defaultLanguageCode: str(agent.defaultLanguageCode),
          timeZone: str(agent.timeZone),
          description: str(agent.description),
          startFlow: str(agent.startFlow),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Dialogflow ES Agents
  // -----------------------------------------------------------------------
  {
    type: 'dialogflow-es',
    category: 'ml',
    sdkPackage: '@google-cloud/dialogflow',
    clientClass: 'AgentsClient',
    listMethod: 'getAgent',
    importance: 6,
    mapResource: (agent: any, projectId: string) => {
      const displayName = agent.displayName ?? 'unknown'
      return {
        id: `gcp-dialogflow-es-${projectId}`,
        label: `DFES: ${displayName}`,
        type: 'dialogflow-es',
        category: 'ml',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/agent`,
          name: displayName,
          displayName,
          defaultLanguageCode: str(agent.defaultLanguageCode),
          timeZone: str(agent.timeZone),
          description: str(agent.description),
          apiVersion: str(agent.apiVersion),
          tier: str(agent.tier),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Recommendations AI (Retail)
  // -----------------------------------------------------------------------
  {
    type: 'recommendations-ai',
    category: 'ml',
    sdkPackage: '@google-cloud/retail',
    clientClass: 'CatalogServiceClient',
    listMethod: 'listCatalogs',
    importance: 5,
    mapResource: (catalog: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/catalogs/{catalog}
      const fullName = catalog.name ?? ''
      const parts = fullName.split('/')
      const catalogName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-retail-${catalogName}`,
        label: `Retail: ${str(catalog.displayName || catalogName)}`,
        type: 'recommendations-ai',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: catalogName,
          displayName: str(catalog.displayName),
          productLevelConfig: str(catalog.productLevelConfig?.ingestionProductType ?? ''),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Document AI Processors
  // -----------------------------------------------------------------------
  {
    type: 'document-ai',
    category: 'ml',
    sdkPackage: '@google-cloud/documentai',
    clientClass: 'DocumentProcessorServiceClient',
    listMethod: 'listProcessors',
    importance: 6,
    mapResource: (processor: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/processors/{processor}
      const fullName = processor.name ?? ''
      const parts = fullName.split('/')
      const processorName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = processor.state ?? ''
      return {
        id: `gcp-docai-${processorName}`,
        label: `DocAI: ${str(processor.displayName || processorName)}`,
        type: 'document-ai',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: processorName,
          displayName: str(processor.displayName),
          state: str(state),
          type: str(processor.type),
          defaultProcessorVersion: str(processor.defaultProcessorVersion),
          createTime: str(processor.createTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'ENABLED' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Contact Center AI Insights
  // -----------------------------------------------------------------------
  {
    type: 'contact-center-ai',
    category: 'ml',
    sdkPackage: '@google-cloud/contact-center-insights',
    clientClass: 'ContactCenterInsightsClient',
    listMethod: 'listConversations',
    importance: 5,
    mapResource: (conversation: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/conversations/{conversation}
      const fullName = conversation.name ?? ''
      const parts = fullName.split('/')
      const convName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-ccai-${convName}`,
        label: `CCAI: ${convName}`,
        type: 'contact-center-ai',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: convName,
          medium: str(conversation.medium),
          duration: str(conversation.duration?.seconds ?? ''),
          turnCount: str(conversation.turnCount),
          agentId: str(conversation.agentId),
          startTime: str(conversation.startTime),
          createTime: str(conversation.createTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Media Translation (API-only, project-level)
  // -----------------------------------------------------------------------
  {
    type: 'media-translation',
    category: 'ml',
    sdkPackage: '@google-cloud/media-translation',
    clientClass: 'SpeechTranslationServiceClient',
    listMethod: 'streamingTranslateSpeech',
    importance: 3,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-media-translate-${projectId}`,
        label: `MediaTranslate: ${projectId}`,
        type: 'media-translation',
        category: 'ml',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Media Translation API',
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Talent Solution
  // -----------------------------------------------------------------------
  {
    type: 'talent-solution',
    category: 'ml',
    sdkPackage: '@google-cloud/talent',
    clientClass: 'CompanyServiceClient',
    listMethod: 'listCompanies',
    importance: 5,
    mapResource: (company: any, projectId: string) => {
      // name = projects/{project}/tenants/{tenant}/companies/{company}
      const fullName = company.name ?? ''
      const parts = fullName.split('/')
      const companyName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-talent-${companyName}`,
        label: `Talent: ${str(company.displayName || companyName)}`,
        type: 'talent-solution',
        category: 'ml',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: companyName,
          displayName: str(company.displayName),
          externalId: str(company.externalId),
          size: str(company.size),
          headquartersAddress: str(company.headquartersAddress),
          websiteUri: str(company.websiteUri),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Healthcare API Datasets
  // -----------------------------------------------------------------------
  {
    type: 'healthcare',
    category: 'ml',
    sdkPackage: '@google-cloud/healthcare',
    clientClass: 'HealthcareService',
    listMethod: 'listDatasets',
    importance: 7,
    mapResource: (dataset: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/datasets/{dataset}
      const fullName = dataset.name ?? ''
      const parts = fullName.split('/')
      const datasetName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-healthcare-${datasetName}`,
        label: `Healthcare: ${datasetName}`,
        type: 'healthcare',
        category: 'ml',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: datasetName,
          location,
          timeZone: str(dataset.timeZone),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // =======================================================================
  // IOT
  // =======================================================================

  // -----------------------------------------------------------------------
  // IoT Core (deprecated but still exists)
  // -----------------------------------------------------------------------
  {
    type: 'iot-core',
    category: 'iot',
    sdkPackage: '@google-cloud/iot',
    clientClass: 'DeviceManagerClient',
    listMethod: 'listDeviceRegistries',
    importance: 5,
    mapResource: (registry: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/registries/{registry}
      const fullName = registry.name ?? ''
      const parts = fullName.split('/')
      const registryName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-iot-${registryName}`,
        label: `IoT: ${str(registry.id || registryName)}`,
        type: 'iot-core',
        category: 'iot',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: registryName,
          id: str(registry.id),
          mqttConfig: str(registry.mqttConfig?.mqttEnabledState ?? ''),
          httpConfig: str(registry.httpConfig?.httpEnabledState ?? ''),
          stateNotificationTopic: str(registry.stateNotificationConfig?.pubsubTopicName ?? ''),
          eventNotificationConfigs: str(registry.eventNotificationConfigs?.length ?? 0),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  // DEVOPS
  // =======================================================================

  // -----------------------------------------------------------------------
  // Cloud Build Triggers
  // -----------------------------------------------------------------------
  {
    type: 'cloud-build',
    category: 'devops',
    sdkPackage: '@google-cloud/cloudbuild',
    clientClass: 'CloudBuildClient',
    listMethod: 'listBuildTriggers',
    importance: 6,
    mapResource: (trigger: any, projectId: string) => {
      const triggerId = trigger.id ?? 'unknown'
      const name = trigger.name ?? trigger.description ?? triggerId
      return {
        id: `gcp-build-${triggerId}`,
        label: `Build: ${name}`,
        type: 'cloud-build',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/triggers/${triggerId}`,
          name,
          id: triggerId,
          description: str(trigger.description),
          disabled: str(trigger.disabled),
          triggerTemplate: str(trigger.triggerTemplate?.repoName ?? ''),
          branchName: str(trigger.triggerTemplate?.branchName ?? ''),
          filename: str(trigger.filename),
          createTime: str(trigger.createTime),
        },
        status: trigger.disabled ? ('warning' as HealthStatus) : ('healthy' as HealthStatus),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Deploy Pipelines
  // -----------------------------------------------------------------------
  {
    type: 'cloud-deploy',
    category: 'devops',
    sdkPackage: '@google-cloud/deploy',
    clientClass: 'CloudDeployClient',
    listMethod: 'listDeliveryPipelines',
    importance: 6,
    mapResource: (pipeline: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/deliveryPipelines/{pipeline}
      const fullName = pipeline.name ?? ''
      const parts = fullName.split('/')
      const pipelineName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-deploy-${pipelineName}`,
        label: `Deploy: ${pipelineName}`,
        type: 'cloud-deploy',
        category: 'devops',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: pipelineName,
          description: str(pipeline.description),
          stagesCount: str(pipeline.serialPipeline?.stages?.length ?? 0),
          uid: str(pipeline.uid),
          suspended: str(pipeline.suspended),
          createTime: str(pipeline.createTime),
          updateTime: str(pipeline.updateTime),
        },
        status: pipeline.suspended ? ('warning' as HealthStatus) : ('healthy' as HealthStatus),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Source Repositories
  // -----------------------------------------------------------------------
  {
    type: 'cloud-source-repos',
    category: 'devops',
    sdkPackage: '@google-cloud/source-repos',
    clientClass: 'SourceRepoClient',
    listMethod: 'listRepos',
    importance: 4,
    mapResource: (repo: any, projectId: string) => {
      // name = projects/{project}/repos/{repo}
      const fullName = repo.name ?? ''
      const parts = fullName.split('/')
      const repoName = parts.slice(3).join('/') ?? 'unknown'
      return {
        id: `gcp-csr-${repoName}`,
        label: `CSR: ${repoName}`,
        type: 'cloud-source-repos',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: repoName,
          url: str(repo.url),
          size: str(repo.size),
          mirrorConfig: str(repo.mirrorConfig?.url ?? ''),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Container Analysis Notes
  // -----------------------------------------------------------------------
  {
    type: 'container-analysis',
    category: 'devops',
    sdkPackage: '@google-cloud/containeranalysis',
    clientClass: 'ContainerAnalysisClient',
    listMethod: 'listNotes',
    importance: 5,
    mapResource: (note: any, projectId: string) => {
      // name = projects/{project}/notes/{note}
      const fullName = note.name ?? ''
      const parts = fullName.split('/')
      const noteName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-ca-note-${noteName}`,
        label: `CANote: ${noteName}`,
        type: 'container-analysis',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: noteName,
          kind: str(note.kind),
          shortDescription: str(note.shortDescription),
          longDescription: str(note.longDescription),
          createTime: str(note.createTime),
          updateTime: str(note.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Profiler (API-only)
  // -----------------------------------------------------------------------
  {
    type: 'cloud-profiler',
    category: 'devops',
    sdkPackage: '@google-cloud/profiler',
    clientClass: 'ProfilerClient',
    listMethod: 'listProfiles',
    importance: 3,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-profiler-${projectId}`,
        label: `Profiler: ${projectId}`,
        type: 'cloud-profiler',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Cloud Profiler',
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Trace (API-only)
  // -----------------------------------------------------------------------
  {
    type: 'cloud-trace',
    category: 'devops',
    sdkPackage: '@google-cloud/trace-agent',
    clientClass: 'TraceServiceClient',
    listMethod: 'listTraces',
    importance: 3,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-trace-${projectId}`,
        label: `Trace: ${projectId}`,
        type: 'cloud-trace',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Cloud Trace',
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Debugger (deprecated)
  // -----------------------------------------------------------------------
  {
    type: 'cloud-debugger',
    category: 'devops',
    sdkPackage: '@google-cloud/debug-agent',
    clientClass: 'DebuggerClient',
    listMethod: 'listDebuggees',
    importance: 2,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-debugger-${projectId}`,
        label: `Debugger: ${projectId}`,
        type: 'cloud-debugger',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Cloud Debugger (deprecated)',
        },
        status: 'warning' as HealthStatus,
        importance: 2,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Error Reporting (API-only)
  // -----------------------------------------------------------------------
  {
    type: 'error-reporting',
    category: 'devops',
    sdkPackage: '@google-cloud/error-reporting',
    clientClass: 'ErrorReportingClient',
    listMethod: 'listGroupStats',
    importance: 4,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-error-reporting-${projectId}`,
        label: `Errors: ${projectId}`,
        type: 'error-reporting',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Error Reporting',
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Logging Sinks
  // -----------------------------------------------------------------------
  {
    type: 'cloud-logging',
    category: 'devops',
    sdkPackage: '@google-cloud/logging',
    clientClass: 'Logging',
    listMethod: 'getSinks',
    importance: 6,
    mapResource: (sink: any, projectId: string) => {
      const sinkName = sink.name ?? 'unknown'
      return {
        id: `gcp-logging-sink-${sinkName}`,
        label: `LogSink: ${sinkName}`,
        type: 'cloud-logging',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/sinks/${sinkName}`,
          name: sinkName,
          destination: str(sink.destination),
          filter: str(sink.filter),
          outputVersionFormat: str(sink.outputVersionFormat),
          writerIdentity: str(sink.writerIdentity),
          createTime: str(sink.createTime),
          updateTime: str(sink.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Monitoring Alert Policies
  // -----------------------------------------------------------------------
  {
    type: 'cloud-monitoring',
    category: 'devops',
    sdkPackage: '@google-cloud/monitoring',
    clientClass: 'AlertPolicyServiceClient',
    listMethod: 'listAlertPolicies',
    importance: 6,
    mapResource: (policy: any, projectId: string) => {
      // name = projects/{project}/alertPolicies/{policy}
      const fullName = policy.name ?? ''
      const parts = fullName.split('/')
      const policyName = parts[parts.length - 1] ?? 'unknown'
      const enabled = policy.enabled?.value ?? policy.enabled ?? true
      return {
        id: `gcp-alert-${policyName}`,
        label: `Alert: ${str(policy.displayName || policyName)}`,
        type: 'cloud-monitoring',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: policyName,
          displayName: str(policy.displayName),
          enabled: str(enabled),
          conditionsCount: str(policy.conditions?.length ?? 0),
          combiner: str(policy.combiner),
          notificationChannelsCount: str(policy.notificationChannels?.length ?? 0),
          createTime: str(policy.creationRecord?.mutateTime ?? ''),
          updateTime: str(policy.mutationRecord?.mutateTime ?? ''),
        },
        status: enabled ? ('healthy' as HealthStatus) : ('warning' as HealthStatus),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Monitoring Dashboards
  // -----------------------------------------------------------------------
  {
    type: 'cloud-monitoring-dashboard',
    category: 'devops',
    sdkPackage: '@google-cloud/monitoring-dashboards',
    clientClass: 'DashboardsServiceClient',
    listMethod: 'listDashboards',
    importance: 4,
    mapResource: (dashboard: any, projectId: string) => {
      // name = projects/{project}/dashboards/{dashboard}
      const fullName = dashboard.name ?? ''
      const parts = fullName.split('/')
      const dashName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-dashboard-${dashName}`,
        label: `Dashboard: ${str(dashboard.displayName || dashName)}`,
        type: 'cloud-monitoring-dashboard',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: dashName,
          displayName: str(dashboard.displayName),
          etag: str(dashboard.etag),
          widgetCount: str(dashboard.gridLayout?.widgets?.length ?? dashboard.mosaicLayout?.tiles?.length ?? 0),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Monitoring Uptime Checks
  // -----------------------------------------------------------------------
  {
    type: 'cloud-monitoring-uptime',
    category: 'devops',
    sdkPackage: '@google-cloud/monitoring',
    clientClass: 'UptimeCheckServiceClient',
    listMethod: 'listUptimeCheckConfigs',
    importance: 5,
    mapResource: (config: any, projectId: string) => {
      // name = projects/{project}/uptimeCheckConfigs/{config}
      const fullName = config.name ?? ''
      const parts = fullName.split('/')
      const configName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-uptime-${configName}`,
        label: `Uptime: ${str(config.displayName || configName)}`,
        type: 'cloud-monitoring-uptime',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: configName,
          displayName: str(config.displayName),
          monitoredResource: str(config.monitoredResource?.type ?? ''),
          host: str(config.httpCheck?.path ?? config.tcpCheck?.port ?? ''),
          period: str(config.period?.seconds ?? ''),
          timeout: str(config.timeout?.seconds ?? ''),
          isInternal: str(config.isInternal),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Deployment Manager
  // -----------------------------------------------------------------------
  {
    type: 'deployment-manager',
    category: 'devops',
    sdkPackage: '@google-cloud/deployment-manager',
    clientClass: 'DeploymentManagerClient',
    listMethod: 'listDeployments',
    importance: 5,
    mapResource: (deployment: any, projectId: string) => {
      const name = deployment.name ?? 'unknown'
      const operation = deployment.operation ?? {}
      return {
        id: `gcp-dm-${name}`,
        label: `DM: ${name}`,
        type: 'deployment-manager',
        category: 'devops',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/global/deployments/${name}`,
          name,
          description: str(deployment.description),
          status: str(operation.status),
          operationType: str(operation.operationType),
          insertTime: str(deployment.insertTime),
          updateTime: str(deployment.updateTime),
        },
        status: operation.status === 'DONE' ? ('healthy' as HealthStatus) : ('warning' as HealthStatus),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // MANAGEMENT
  // =======================================================================

  // -----------------------------------------------------------------------
  // GCP Organization
  // -----------------------------------------------------------------------
  {
    type: 'organization',
    category: 'management',
    sdkPackage: '@google-cloud/resource-manager',
    clientClass: 'OrganizationsClient',
    listMethod: 'searchOrganizations',
    importance: 10,
    mapResource: (org: any, projectId: string) => {
      // name = organizations/{org}
      const fullName = org.name ?? ''
      const parts = fullName.split('/')
      const orgId = parts[parts.length - 1] ?? 'unknown'
      const state = org.state ?? ''
      return {
        id: `gcp-org-${orgId}`,
        label: `Org: ${str(org.displayName || orgId)}`,
        type: 'organization',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: orgId,
          displayName: str(org.displayName),
          state: str(state),
          directoryCustomerId: str(org.directoryCustomerId),
          etag: str(org.etag),
          createTime: str(org.createTime),
          updateTime: str(org.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 10,
      }
    },
  },

  // -----------------------------------------------------------------------
  // GCP Folders
  // -----------------------------------------------------------------------
  {
    type: 'folder',
    category: 'management',
    sdkPackage: '@google-cloud/resource-manager',
    clientClass: 'FoldersClient',
    listMethod: 'listFolders',
    importance: 7,
    mapResource: (folder: any, projectId: string) => {
      // name = folders/{folder}
      const fullName = folder.name ?? ''
      const parts = fullName.split('/')
      const folderId = parts[parts.length - 1] ?? 'unknown'
      const state = folder.state ?? ''
      return {
        id: `gcp-folder-${folderId}`,
        label: `Folder: ${str(folder.displayName || folderId)}`,
        type: 'folder',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: folderId,
          displayName: str(folder.displayName),
          state: str(state),
          parent: str(folder.parent),
          etag: str(folder.etag),
          createTime: str(folder.createTime),
          updateTime: str(folder.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // GCP Projects
  // -----------------------------------------------------------------------
  {
    type: 'project',
    category: 'management',
    sdkPackage: '@google-cloud/resource-manager',
    clientClass: 'ProjectsClient',
    listMethod: 'listProjects',
    importance: 8,
    mapResource: (project: any, _projectId: string) => {
      const projId = project.projectId ?? 'unknown'
      const state = project.state ?? ''
      return {
        id: `gcp-project-${projId}`,
        label: `Project: ${str(project.displayName || projId)}`,
        type: 'project',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projId}`,
          name: projId,
          displayName: str(project.displayName),
          state: str(state),
          projectNumber: str(project.name?.split('/').pop() ?? ''),
          parent: str(project.parent),
          etag: str(project.etag),
          createTime: str(project.createTime),
          updateTime: str(project.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Billing Accounts
  // -----------------------------------------------------------------------
  {
    type: 'billing-account',
    category: 'management',
    sdkPackage: '@google-cloud/billing',
    clientClass: 'CloudBillingClient',
    listMethod: 'listBillingAccounts',
    importance: 7,
    mapResource: (account: any, projectId: string) => {
      // name = billingAccounts/{account}
      const fullName = account.name ?? ''
      const parts = fullName.split('/')
      const accountId = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-billing-${accountId}`,
        label: `Billing: ${str(account.displayName || accountId)}`,
        type: 'billing-account',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: accountId,
          displayName: str(account.displayName),
          open: str(account.open),
          masterBillingAccount: str(account.masterBillingAccount),
        },
        status: account.open ? ('healthy' as HealthStatus) : ('error' as HealthStatus),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Billing Budgets
  // -----------------------------------------------------------------------
  {
    type: 'billing-budget',
    category: 'management',
    sdkPackage: '@google-cloud/billing-budgets',
    clientClass: 'BudgetServiceClient',
    listMethod: 'listBudgets',
    importance: 5,
    mapResource: (budget: any, projectId: string) => {
      // name = billingAccounts/{account}/budgets/{budget}
      const fullName = budget.name ?? ''
      const parts = fullName.split('/')
      const budgetName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-budget-${budgetName}`,
        label: `Budget: ${str(budget.displayName || budgetName)}`,
        type: 'billing-budget',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: budgetName,
          displayName: str(budget.displayName),
          specifiedAmount: str(budget.amount?.specifiedAmount?.units ?? ''),
          currencyCode: str(budget.amount?.specifiedAmount?.currencyCode ?? ''),
          thresholdRulesCount: str(budget.thresholdRules?.length ?? 0),
          etag: str(budget.etag),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Service Usage (Enabled APIs)
  // -----------------------------------------------------------------------
  {
    type: 'service-usage',
    category: 'management',
    sdkPackage: '@google-cloud/service-usage',
    clientClass: 'ServiceUsageClient',
    listMethod: 'listServices',
    importance: 4,
    mapResource: (service: any, projectId: string) => {
      // name = projects/{project}/services/{service}
      const fullName = service.name ?? ''
      const parts = fullName.split('/')
      const serviceName = parts[parts.length - 1] ?? 'unknown'
      const state = service.state ?? ''
      return {
        id: `gcp-api-${serviceName}`,
        label: `API: ${serviceName}`,
        type: 'service-usage',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: serviceName,
          state: str(state),
          title: str(service.config?.title ?? ''),
          parent: str(service.parent),
        },
        status: gcpHealth(state),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Asset Inventory
  // -----------------------------------------------------------------------
  {
    type: 'asset-inventory',
    category: 'management',
    sdkPackage: '@google-cloud/asset',
    clientClass: 'AssetServiceClient',
    listMethod: 'listAssets',
    importance: 5,
    mapResource: (asset: any, projectId: string) => {
      const assetName = asset.name ?? 'unknown'
      const assetType = asset.assetType ?? 'unknown'
      return {
        id: `gcp-asset-${assetName.split('/').pop()}`,
        label: `Asset: ${assetName.split('/').pop() ?? assetName}`,
        type: 'asset-inventory',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: assetName,
          name: assetName.split('/').pop() ?? assetName,
          assetType,
          updateTime: str(asset.updateTime),
          orgPolicy: str(asset.orgPolicy?.length ?? 0),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Recommender
  // -----------------------------------------------------------------------
  {
    type: 'recommender',
    category: 'management',
    sdkPackage: '@google-cloud/recommender',
    clientClass: 'RecommenderClient',
    listMethod: 'listRecommendations',
    importance: 4,
    mapResource: (recommendation: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/recommenders/{recommender}/recommendations/{rec}
      const fullName = recommendation.name ?? ''
      const parts = fullName.split('/')
      const recName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = recommendation.stateInfo?.state ?? ''
      return {
        id: `gcp-rec-${recName}`,
        label: `Rec: ${recName}`,
        type: 'recommender',
        category: 'management',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: recName,
          state: str(state),
          recommenderSubtype: str(recommendation.recommenderSubtype),
          description: str(recommendation.description),
          priority: str(recommendation.priority),
          lastRefreshTime: str(recommendation.lastRefreshTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Essential Contacts
  // -----------------------------------------------------------------------
  {
    type: 'essential-contacts',
    category: 'management',
    sdkPackage: '@google-cloud/essential-contacts',
    clientClass: 'EssentialContactsServiceClient',
    listMethod: 'listContacts',
    importance: 3,
    mapResource: (contact: any, projectId: string) => {
      // name = projects/{project}/contacts/{contact}
      const fullName = contact.name ?? ''
      const parts = fullName.split('/')
      const contactName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-contact-${contactName}`,
        label: `Contact: ${str(contact.email || contactName)}`,
        type: 'essential-contacts',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: contactName,
          email: str(contact.email),
          notificationCategorySubscriptions: str((contact.notificationCategorySubscriptions ?? []).join(', ')),
          languageTag: str(contact.languageTag),
          validationState: str(contact.validationState),
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // OS Config Patch Deployments
  // -----------------------------------------------------------------------
  {
    type: 'os-config',
    category: 'management',
    sdkPackage: '@google-cloud/os-config',
    clientClass: 'OsConfigServiceClient',
    listMethod: 'listPatchDeployments',
    importance: 5,
    mapResource: (deployment: any, projectId: string) => {
      // name = projects/{project}/patchDeployments/{deployment}
      const fullName = deployment.name ?? ''
      const parts = fullName.split('/')
      const deploymentName = parts[parts.length - 1] ?? 'unknown'
      return {
        id: `gcp-osconfig-${deploymentName}`,
        label: `OSConfig: ${deploymentName}`,
        type: 'os-config',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: deploymentName,
          description: str(deployment.description),
          state: str(deployment.state),
          schedule: str(deployment.recurringSchedule ? 'recurring' : 'one-time'),
          lastExecuteTime: str(deployment.lastExecuteTime),
          createTime: str(deployment.createTime),
          updateTime: str(deployment.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // OS Login
  // -----------------------------------------------------------------------
  {
    type: 'os-login',
    category: 'management',
    sdkPackage: '@google-cloud/os-login',
    clientClass: 'OsLoginServiceClient',
    listMethod: 'getLoginProfile',
    importance: 3,
    mapResource: (profile: any, projectId: string) => {
      const name = profile.name ?? 'unknown'
      return {
        id: `gcp-oslogin-${name}`,
        label: `OSLogin: ${name}`,
        type: 'os-login',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: `users/${name}`,
          name,
          posixAccountsCount: str(profile.posixAccounts?.length ?? 0),
          sshPublicKeysCount: str(Object.keys(profile.sshPublicKeys ?? {}).length),
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Support
  // -----------------------------------------------------------------------
  {
    type: 'support',
    category: 'management',
    sdkPackage: '@google-cloud/support',
    clientClass: 'CaseServiceClient',
    listMethod: 'listCases',
    importance: 4,
    mapResource: (supportCase: any, projectId: string) => {
      // name = projects/{project}/cases/{case}
      const fullName = supportCase.name ?? ''
      const parts = fullName.split('/')
      const caseName = parts[parts.length - 1] ?? 'unknown'
      const state = supportCase.state ?? ''
      return {
        id: `gcp-support-${caseName}`,
        label: `Support: ${str(supportCase.displayName || caseName)}`,
        type: 'support',
        category: 'management',
        region: 'global',
        metadata: {
          resourcePath: fullName,
          name: caseName,
          displayName: str(supportCase.displayName),
          state: str(state),
          severity: str(supportCase.severity),
          classification: str(supportCase.classification?.displayName ?? ''),
          createTime: str(supportCase.createTime),
          updateTime: str(supportCase.updateTime),
        },
        status: state === 'CLOSED' ? ('healthy' as HealthStatus) : ('warning' as HealthStatus),
        importance: 4,
      }
    },
  },

  // =======================================================================
  // CONTAINER
  // =======================================================================

  // -----------------------------------------------------------------------
  // Cloud Run Jobs
  // -----------------------------------------------------------------------
  {
    type: 'cloud-run-job',
    category: 'container',
    sdkPackage: '@google-cloud/run',
    clientClass: 'JobsClient',
    listMethod: 'listJobs',
    importance: 6,
    mapResource: (job: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/jobs/{job}
      const fullName = job.name ?? ''
      const parts = fullName.split('/')
      const jobName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-run-job-${jobName}`,
        label: `RunJob: ${jobName}`,
        type: 'cloud-run-job',
        category: 'container',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: jobName,
          executionCount: str(job.executionCount),
          launchStage: str(job.launchStage),
          containerImage: str(job.template?.template?.containers?.[0]?.image ?? ''),
          maxRetries: str(job.template?.template?.maxRetries ?? ''),
          taskCount: str(job.template?.taskCount ?? ''),
          createTime: str(job.createTime),
          updateTime: str(job.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Anthos Attached Clusters
  // -----------------------------------------------------------------------
  {
    type: 'anthos',
    category: 'container',
    sdkPackage: '@google-cloud/gke-multi-cloud',
    clientClass: 'AttachedClustersClient',
    listMethod: 'listAttachedClusters',
    importance: 7,
    mapResource: (cluster: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/attachedClusters/{cluster}
      const fullName = cluster.name ?? ''
      const parts = fullName.split('/')
      const clusterName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = cluster.state ?? ''
      return {
        id: `gcp-anthos-${clusterName}`,
        label: `Anthos: ${clusterName}`,
        type: 'anthos',
        category: 'container',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: clusterName,
          state: str(state),
          description: str(cluster.description),
          distribution: str(cluster.distribution),
          platformVersion: str(cluster.platformVersion),
          kubernetesVersion: str(cluster.kubernetesVersion),
          uid: str(cluster.uid),
          createTime: str(cluster.createTime),
          updateTime: str(cluster.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Anthos Config Management (fleet-level)
  // -----------------------------------------------------------------------
  {
    type: 'anthos-config-management',
    category: 'container',
    sdkPackage: '@google-cloud/gke-hub',
    clientClass: 'GkeHubMembershipServiceClient',
    listMethod: 'listMemberships',
    importance: 6,
    mapResource: (membership: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/memberships/{membership}
      const fullName = membership.name ?? ''
      const parts = fullName.split('/')
      const membershipName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = membership.state?.code ?? ''
      return {
        id: `gcp-acm-${membershipName}`,
        label: `ACM: ${membershipName}`,
        type: 'anthos-config-management',
        category: 'container',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: membershipName,
          state: str(state),
          description: str(membership.description),
          externalId: str(membership.externalId),
          uniqueId: str(membership.uniqueId),
          createTime: str(membership.createTime),
          updateTime: str(membership.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'READY' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // GKE Hub Memberships
  // -----------------------------------------------------------------------
  {
    type: 'gke-hub',
    category: 'container',
    sdkPackage: '@google-cloud/gke-hub',
    clientClass: 'GkeHubMembershipServiceClient',
    listMethod: 'listMemberships',
    importance: 7,
    mapResource: (membership: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/memberships/{membership}
      const fullName = membership.name ?? ''
      const parts = fullName.split('/')
      const membershipName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = membership.state?.code ?? ''
      return {
        id: `gcp-gkehub-${membershipName}`,
        label: `GKEHub: ${membershipName}`,
        type: 'gke-hub',
        category: 'container',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: membershipName,
          state: str(state),
          description: str(membership.description),
          externalId: str(membership.externalId),
          uniqueId: str(membership.uniqueId),
          endpoint: str(membership.endpoint?.gkeCluster?.resourceLink ?? ''),
          createTime: str(membership.createTime),
          updateTime: str(membership.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 1 ? 'READY' : 'PENDING') : str(state)),
        importance: 7,
      }
    },
  },

  // =======================================================================
  // INTEGRATION
  // =======================================================================

  // -----------------------------------------------------------------------
  // Apigee API Management
  // -----------------------------------------------------------------------
  {
    type: 'apigee',
    category: 'integration',
    sdkPackage: '@google-cloud/apigee',
    clientClass: 'ApigeeClient',
    listMethod: 'listOrganizations',
    importance: 7,
    mapResource: (org: any, projectId: string) => {
      const orgName = org.name ?? 'unknown'
      const state = org.state ?? ''
      return {
        id: `gcp-apigee-${orgName}`,
        label: `Apigee: ${str(org.displayName || orgName)}`,
        type: 'apigee',
        category: 'integration',
        region: str(org.analyticsRegion ?? 'global'),
        metadata: {
          resourcePath: `organizations/${orgName}`,
          name: orgName,
          displayName: str(org.displayName),
          state: str(state),
          runtimeType: str(org.runtimeType),
          analyticsRegion: str(org.analyticsRegion),
          projectId: str(org.projectId),
          createdAt: str(org.createdAt),
          lastModifiedAt: str(org.lastModifiedAt),
        },
        status: gcpHealth(state),
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // API Gateway
  // -----------------------------------------------------------------------
  {
    type: 'api-gateway',
    category: 'integration',
    sdkPackage: '@google-cloud/api-gateway',
    clientClass: 'ApiGatewayServiceClient',
    listMethod: 'listGateways',
    importance: 6,
    mapResource: (gateway: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/gateways/{gateway}
      const fullName = gateway.name ?? ''
      const parts = fullName.split('/')
      const gatewayName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = gateway.state ?? ''
      return {
        id: `gcp-apigw-${gatewayName}`,
        label: `APIGW: ${str(gateway.displayName || gatewayName)}`,
        type: 'api-gateway',
        category: 'integration',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: gatewayName,
          displayName: str(gateway.displayName),
          state: str(state),
          apiConfig: str(gateway.apiConfig),
          defaultHostname: str(gateway.defaultHostname),
          createTime: str(gateway.createTime),
          updateTime: str(gateway.updateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'ACTIVE' : 'PENDING') : str(state)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Integration Connectors
  // -----------------------------------------------------------------------
  {
    type: 'integration-connectors',
    category: 'integration',
    sdkPackage: '@google-cloud/connectors',
    clientClass: 'ConnectorsClient',
    listMethod: 'listConnections',
    importance: 5,
    mapResource: (connection: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/connections/{connection}
      const fullName = connection.name ?? ''
      const parts = fullName.split('/')
      const connName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const status = connection.status?.state ?? ''
      return {
        id: `gcp-connector-${connName}`,
        label: `Connector: ${connName}`,
        type: 'integration-connectors',
        category: 'integration',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: connName,
          status: str(status),
          connectorVersion: str(connection.connectorVersion),
          serviceAccount: str(connection.serviceAccount),
          description: str(connection.description),
          createTime: str(connection.createTime),
          updateTime: str(connection.updateTime),
        },
        status: gcpHealth(typeof status === 'number' ? (status === 1 ? 'ACTIVE' : 'PENDING') : str(status)),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Application Integration
  // -----------------------------------------------------------------------
  {
    type: 'application-integration',
    category: 'integration',
    sdkPackage: '@google-cloud/integrations',
    clientClass: 'IntegrationsClient',
    listMethod: 'listIntegrations',
    importance: 5,
    mapResource: (integration: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/integrations/{integration}
      const fullName = integration.name ?? ''
      const parts = fullName.split('/')
      const integrationName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-appint-${integrationName}`,
        label: `AppInt: ${integrationName}`,
        type: 'application-integration',
        category: 'integration',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: integrationName,
          description: str(integration.description),
          active: str(integration.active),
          updateTime: str(integration.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  // MEDIA
  // =======================================================================

  // -----------------------------------------------------------------------
  // Transcoder API Jobs
  // -----------------------------------------------------------------------
  {
    type: 'transcoder',
    category: 'media',
    sdkPackage: '@google-cloud/video-transcoder',
    clientClass: 'TranscoderServiceClient',
    listMethod: 'listJobs',
    importance: 5,
    mapResource: (job: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/jobs/{job}
      const fullName = job.name ?? ''
      const parts = fullName.split('/')
      const jobName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = job.state ?? ''
      return {
        id: `gcp-transcoder-${jobName}`,
        label: `Transcoder: ${jobName}`,
        type: 'transcoder',
        category: 'media',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: jobName,
          state: str(state),
          inputUri: str(job.inputUri),
          outputUri: str(job.outputUri),
          templateId: str(job.templateId),
          startTime: str(job.startTime),
          endTime: str(job.endTime),
          createTime: str(job.createTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Live Stream API Channels
  // -----------------------------------------------------------------------
  {
    type: 'live-stream',
    category: 'media',
    sdkPackage: '@google-cloud/video-livestream',
    clientClass: 'LivestreamServiceClient',
    listMethod: 'listChannels',
    importance: 6,
    mapResource: (channel: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/channels/{channel}
      const fullName = channel.name ?? ''
      const parts = fullName.split('/')
      const channelName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const streamingState = channel.streamingState ?? ''
      return {
        id: `gcp-livestream-${channelName}`,
        label: `LiveStream: ${channelName}`,
        type: 'live-stream',
        category: 'media',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: channelName,
          streamingState: str(streamingState),
          inputsCount: str(channel.inputAttachments?.length ?? 0),
          outputUri: str(channel.output?.uri ?? ''),
          createTime: str(channel.createTime),
          updateTime: str(channel.updateTime),
        },
        status: gcpHealth(typeof streamingState === 'number' ? (streamingState === 3 ? 'RUNNING' : 'PENDING') : str(streamingState)),
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Video Stitcher Configs
  // -----------------------------------------------------------------------
  {
    type: 'video-stitcher',
    category: 'media',
    sdkPackage: '@google-cloud/video-stitcher',
    clientClass: 'VideoStitcherServiceClient',
    listMethod: 'listCdnKeys',
    importance: 5,
    mapResource: (cdnKey: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/cdnKeys/{cdnKey}
      const fullName = cdnKey.name ?? ''
      const parts = fullName.split('/')
      const keyName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-stitcher-${keyName}`,
        label: `Stitcher: ${keyName}`,
        type: 'video-stitcher',
        category: 'media',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: keyName,
          hostname: str(cdnKey.hostname),
          hasGoogleCdnKey: str(!!cdnKey.googleCdnKey),
          hasAkamaiCdnKey: str(!!cdnKey.akamaiCdnKey),
          hasMediaCdnKey: str(!!cdnKey.mediaCdnKey),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Media CDN (EdgeCacheService)
  // -----------------------------------------------------------------------
  {
    type: 'media-cdn',
    category: 'media',
    sdkPackage: '@google-cloud/network-services',
    clientClass: 'NetworkServicesClient',
    listMethod: 'listEdgeCacheServices',
    importance: 6,
    mapResource: (service: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/edgeCacheServices/{service}
      const fullName = service.name ?? ''
      const parts = fullName.split('/')
      const serviceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-mediacdn-${serviceName}`,
        label: `MediaCDN: ${serviceName}`,
        type: 'media-cdn',
        category: 'media',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: serviceName,
          description: str(service.description),
          disableQuic: str(service.disableQuic),
          edgeSslCertificates: str((service.edgeSslCertificates ?? []).length),
          routing: str(service.routing?.hostRules?.length ?? 0) + ' host rules',
          createTime: str(service.createTime),
          updateTime: str(service.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Game Servers (deprecated)
  // -----------------------------------------------------------------------
  {
    type: 'gaming',
    category: 'media',
    sdkPackage: '@google-cloud/game-servers',
    clientClass: 'GameServerClustersServiceClient',
    listMethod: 'listGameServerClusters',
    importance: 3,
    mapResource: (cluster: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/realms/{realm}/gameServerClusters/{cluster}
      const fullName = cluster.name ?? ''
      const parts = fullName.split('/')
      const clusterName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-gaming-${clusterName}`,
        label: `Gaming: ${clusterName}`,
        type: 'gaming',
        category: 'media',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: clusterName,
          description: str(cluster.description),
          connectionInfo: str(cluster.connectionInfo?.gkeClusterReference?.cluster ?? ''),
          etag: str(cluster.etag),
          createTime: str(cluster.createTime),
          updateTime: str(cluster.updateTime),
        },
        status: 'warning' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Immersive Stream for XR (limited)
  // -----------------------------------------------------------------------
  {
    type: 'immersive-stream',
    category: 'media',
    sdkPackage: '@google-cloud/stream',
    clientClass: 'StreamServiceClient',
    listMethod: 'listInstances',
    importance: 3,
    mapResource: (instance: any, projectId: string) => {
      const fullName = instance.name ?? ''
      const parts = fullName.split('/')
      const instanceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-xr-${instanceName}`,
        label: `XR: ${instanceName}`,
        type: 'immersive-stream',
        category: 'media',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: instanceName,
          projectId,
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // =======================================================================
  // MIGRATION
  // =======================================================================

  // -----------------------------------------------------------------------
  // Migrate for Compute Engine
  // -----------------------------------------------------------------------
  {
    type: 'migrate-for-compute',
    category: 'migration',
    sdkPackage: '@google-cloud/vmmigration',
    clientClass: 'VmMigrationClient',
    listMethod: 'listSources',
    importance: 5,
    mapResource: (source: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/sources/{source}
      const fullName = source.name ?? ''
      const parts = fullName.split('/')
      const sourceName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      return {
        id: `gcp-migrate-${sourceName}`,
        label: `Migrate: ${str(source.displayName || sourceName)}`,
        type: 'migrate-for-compute',
        category: 'migration',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: sourceName,
          displayName: str(source.displayName),
          description: str(source.description),
          hasVmware: str(!!source.vmware),
          hasAws: str(!!source.aws),
          createTime: str(source.createTime),
          updateTime: str(source.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Transfer Appliance (no API, physical device)
  // -----------------------------------------------------------------------
  {
    type: 'transfer-appliance',
    category: 'migration',
    sdkPackage: '@google-cloud/storage-transfer-service',
    clientClass: 'StorageTransferServiceClient',
    listMethod: 'listTransferJobs',
    importance: 3,
    mapResource: (_resource: any, projectId: string) => {
      return {
        id: `gcp-transfer-appliance-${projectId}`,
        label: `TransferAppliance: ${projectId}`,
        type: 'transfer-appliance',
        category: 'migration',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}`,
          projectId,
          service: 'Transfer Appliance (physical device)',
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // BigQuery Migration
  // -----------------------------------------------------------------------
  {
    type: 'bigquery-migration',
    category: 'migration',
    sdkPackage: '@google-cloud/bigquery-migration',
    clientClass: 'MigrationServiceClient',
    listMethod: 'listMigrationWorkflows',
    importance: 5,
    mapResource: (workflow: any, projectId: string) => {
      // name = projects/{project}/locations/{location}/workflows/{workflow}
      const fullName = workflow.name ?? ''
      const parts = fullName.split('/')
      const workflowName = parts[parts.length - 1] ?? 'unknown'
      const location = parts[3] ?? 'unknown'
      const state = workflow.state ?? ''
      return {
        id: `gcp-bqmigrate-${workflowName}`,
        label: `BQMigrate: ${str(workflow.displayName || workflowName)}`,
        type: 'bigquery-migration',
        category: 'migration',
        region: location,
        metadata: {
          resourcePath: fullName,
          name: workflowName,
          displayName: str(workflow.displayName),
          state: str(state),
          tasksCount: str(workflow.tasks ? Object.keys(workflow.tasks).length : 0),
          createTime: str(workflow.createTime),
          lastUpdateTime: str(workflow.lastUpdateTime),
        },
        status: gcpHealth(typeof state === 'number' ? (state === 2 ? 'RUNNING' : 'PENDING') : str(state)),
        importance: 5,
      }
    },
  },

  // =======================================================================
  // SERVERLESS (additional)
  // =======================================================================

  // -----------------------------------------------------------------------
  // App Engine
  // -----------------------------------------------------------------------
  {
    type: 'app-engine',
    category: 'serverless',
    sdkPackage: '@google-cloud/appengine-admin',
    clientClass: 'ServicesClient',
    listMethod: 'listServices',
    importance: 7,
    mapResource: (service: any, projectId: string) => {
      const serviceName = service.name?.split('/').pop() ?? service.id ?? 'unknown'
      return {
        id: `gcp-gae-${serviceName}`,
        label: `GAE: ${serviceName}`,
        type: 'app-engine',
        category: 'serverless',
        region: 'default',
        metadata: {
          resourcePath: `apps/${projectId}/services/${serviceName}`,
          name: serviceName,
          id: str(service.id),
          split: str(JSON.stringify(service.split?.allocations ?? {})),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Firebase Hosting Sites
  // -----------------------------------------------------------------------
  {
    type: 'firebase-hosting',
    category: 'serverless',
    sdkPackage: 'firebase-admin',
    clientClass: 'HostingClient',
    listMethod: 'listSites',
    importance: 5,
    mapResource: (site: any, projectId: string) => {
      const siteName = site.name?.split('/').pop() ?? site.siteId ?? 'unknown'
      return {
        id: `gcp-firebase-hosting-${siteName}`,
        label: `FBHost: ${siteName}`,
        type: 'firebase-hosting',
        category: 'serverless',
        region: 'global',
        metadata: {
          resourcePath: `projects/${projectId}/sites/${siteName}`,
          name: siteName,
          defaultUrl: str(site.defaultUrl),
          appId: str(site.appId),
          type: str(site.type),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Run Domain Mappings
  // -----------------------------------------------------------------------
  {
    type: 'cloud-run-domain',
    category: 'serverless',
    sdkPackage: '@google-cloud/run',
    clientClass: 'DomainMappingsClient',
    listMethod: 'listDomainMappings',
    importance: 4,
    mapResource: (mapping: any, projectId: string) => {
      const mappingName = mapping.metadata?.name ?? 'unknown'
      const namespace = mapping.metadata?.namespace ?? projectId
      return {
        id: `gcp-run-domain-${mappingName}`,
        label: `RunDomain: ${mappingName}`,
        type: 'cloud-run-domain',
        category: 'serverless',
        region: str(mapping.metadata?.labels?.['cloud.googleapis.com/location'] ?? 'unknown'),
        metadata: {
          resourcePath: `namespaces/${namespace}/domainmappings/${mappingName}`,
          name: mappingName,
          routeName: str(mapping.spec?.routeName ?? ''),
          certificateMode: str(mapping.spec?.certificateMode ?? ''),
          mappedRouteName: str(mapping.status?.mappedRouteName ?? ''),
          resourceRecords: str(mapping.status?.resourceRecords?.length ?? 0),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },
]
