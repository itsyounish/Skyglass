/**
 * Declarative AWS Service Descriptors
 *
 * Each descriptor defines how to scan a specific AWS service:
 * - Which SDK package and client to use
 * - Which command lists the resources
 * - How to paginate
 * - How to map each raw resource into an InfraNode
 *
 * This replaces imperative scanner code with a data-driven pattern.
 * New services can be added by creating a new descriptor — no scanner
 * boilerplate needed.
 */

import type { InfraNode, NodeCategory, HealthStatus } from '../types'

// ---------------------------------------------------------------------------
// Descriptor interface
// ---------------------------------------------------------------------------

export interface AWSServiceDescriptor {
  /** Internal resource type key (e.g. 'sqs', 'sns') */
  type: string
  /** Node category for the viewer */
  category: NodeCategory
  /** NPM package for the AWS SDK v3 client */
  sdkPackage: string
  /** Name of the client class to instantiate from the package */
  clientClass: string
  /** Name of the command class for listing resources */
  listCommand: string
  /** Dot-separated path to the resource array in the response */
  listResponsePath: string
  /** Name of the pagination token field in the response, or null if not paginated */
  paginationToken: string | null
  /** Name of the pagination token input field sent in the request, if different from response */
  paginationInputToken?: string
  /** Default importance score (1-10) for this resource type */
  importance: number
  /** Map a raw AWS SDK resource + region into an InfraNode (minus `provider` field).
   *  Return null to skip the resource (e.g. filtered out IAM service-linked roles). */
  mapResource: (resource: any, region: string) => Omit<InfraNode, 'provider'> | null
}

// ---------------------------------------------------------------------------
// Helper: convert AWS tags to a record
// ---------------------------------------------------------------------------

function tagsToRecord(tags: Array<{ Key?: string; Value?: string }> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!tags) return out
  for (const t of tags) {
    if (t.Key) out[t.Key] = t.Value ?? ''
  }
  return out
}

function str(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val)
}

// ---------------------------------------------------------------------------
// AWS Service Descriptors
// ---------------------------------------------------------------------------

export const AWS_SERVICE_DESCRIPTORS: AWSServiceDescriptor[] = [

  // =======================================================================
  //  COMPUTE
  // =======================================================================

  // -----------------------------------------------------------------------
  // Auto Scaling — Auto Scaling Groups
  // -----------------------------------------------------------------------
  {
    type: 'autoscaling',
    category: 'compute',
    sdkPackage: '@aws-sdk/client-auto-scaling',
    clientClass: 'AutoScalingClient',
    listCommand: 'DescribeAutoScalingGroupsCommand',
    listResponsePath: 'AutoScalingGroups',
    paginationToken: 'NextToken',
    importance: 7,
    mapResource: (asg: any, region: string) => {
      const asgName = asg.AutoScalingGroupName ?? 'unknown'
      const status = asg.Status ?? ''
      return {
        id: `aws-asg-${asgName}`,
        label: `ASG: ${asgName}`,
        type: 'autoscaling',
        category: 'compute' as NodeCategory,
        region,
        metadata: {
          autoScalingGroupName: asgName,
          arn: str(asg.AutoScalingGroupARN),
          launchConfigurationName: str(asg.LaunchConfigurationName),
          launchTemplateId: str(asg.LaunchTemplate?.LaunchTemplateId),
          minSize: str(asg.MinSize),
          maxSize: str(asg.MaxSize),
          desiredCapacity: str(asg.DesiredCapacity),
          availabilityZones: (asg.AvailabilityZones ?? []).join(', '),
          healthCheckType: str(asg.HealthCheckType),
          status,
          ...tagsToRecord(asg.Tags),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Lightsail — Instances
  // -----------------------------------------------------------------------
  {
    type: 'lightsail',
    category: 'compute',
    sdkPackage: '@aws-sdk/client-lightsail',
    clientClass: 'LightsailClient',
    listCommand: 'GetInstancesCommand',
    listResponsePath: 'instances',
    paginationToken: 'nextPageToken',
    paginationInputToken: 'pageToken',
    importance: 5,
    mapResource: (instance: any, region: string) => {
      const name = instance.name ?? 'unknown'
      const state = instance.state?.name ?? ''
      return {
        id: `aws-lightsail-${name}`,
        label: `Lightsail: ${name}`,
        type: 'lightsail',
        category: 'compute' as NodeCategory,
        region,
        metadata: {
          name,
          arn: str(instance.arn),
          blueprintId: str(instance.blueprintId),
          bundleId: str(instance.bundleId),
          publicIpAddress: str(instance.publicIpAddress),
          privateIpAddress: str(instance.privateIpAddress),
          state,
        },
        status: state === 'running' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Batch — Job Queues
  // -----------------------------------------------------------------------
  {
    type: 'batch',
    category: 'compute',
    sdkPackage: '@aws-sdk/client-batch',
    clientClass: 'BatchClient',
    listCommand: 'DescribeJobQueuesCommand',
    listResponsePath: 'jobQueues',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (queue: any, region: string) => {
      const queueName = queue.jobQueueName ?? 'unknown'
      const state = queue.state ?? ''
      const status = queue.status ?? ''
      return {
        id: `aws-batch-${queueName}`,
        label: `Batch: ${queueName}`,
        type: 'batch',
        category: 'compute' as NodeCategory,
        region,
        metadata: {
          jobQueueName: queueName,
          arn: str(queue.jobQueueArn),
          state,
          status,
          priority: str(queue.priority),
        },
        status: state === 'ENABLED' && status === 'VALID' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // App Runner — Services
  // -----------------------------------------------------------------------
  {
    type: 'apprunner',
    category: 'compute',
    sdkPackage: '@aws-sdk/client-apprunner',
    clientClass: 'AppRunnerClient',
    listCommand: 'ListServicesCommand',
    listResponsePath: 'ServiceSummaryList',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (svc: any, region: string) => {
      const serviceName = svc.ServiceName ?? 'unknown'
      const status = svc.Status ?? ''
      return {
        id: `aws-apprunner-${serviceName}`,
        label: `AppRunner: ${serviceName}`,
        type: 'apprunner',
        category: 'compute' as NodeCategory,
        region,
        metadata: {
          serviceName,
          serviceId: str(svc.ServiceId),
          arn: str(svc.ServiceArn),
          serviceUrl: str(svc.ServiceUrl),
          status,
          createdAt: svc.CreatedAt?.toISOString?.() ?? str(svc.CreatedAt),
          updatedAt: svc.UpdatedAt?.toISOString?.() ?? str(svc.UpdatedAt),
        },
        status: status === 'RUNNING' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Elastic Beanstalk — Environments
  // -----------------------------------------------------------------------
  {
    type: 'elasticbeanstalk',
    category: 'compute',
    sdkPackage: '@aws-sdk/client-elastic-beanstalk',
    clientClass: 'ElasticBeanstalkClient',
    listCommand: 'DescribeEnvironmentsCommand',
    listResponsePath: 'Environments',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (env: any, region: string) => {
      const envName = env.EnvironmentName ?? 'unknown'
      const status = env.Status ?? ''
      const health = env.Health ?? ''
      return {
        id: `aws-beanstalk-${envName}`,
        label: `Beanstalk: ${envName}`,
        type: 'elasticbeanstalk',
        category: 'compute' as NodeCategory,
        region,
        metadata: {
          environmentName: envName,
          environmentId: str(env.EnvironmentId),
          applicationName: str(env.ApplicationName),
          versionLabel: str(env.VersionLabel),
          solutionStackName: str(env.SolutionStackName),
          platformArn: str(env.PlatformArn),
          status,
          health,
          endpointUrl: str(env.EndpointURL),
          cname: str(env.CNAME),
        },
        status: health === 'Green' ? 'healthy' as HealthStatus
          : health === 'Yellow' ? 'warning' as HealthStatus
          : health === 'Red' ? 'error' as HealthStatus
          : 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // EC2 Image Builder — Image Pipelines
  // -----------------------------------------------------------------------
  {
    type: 'imagebuilder',
    category: 'compute',
    sdkPackage: '@aws-sdk/client-imagebuilder',
    clientClass: 'ImagebuilderClient',
    listCommand: 'ListImagePipelinesCommand',
    listResponsePath: 'imagePipelineList',
    paginationToken: 'nextToken',
    importance: 4,
    mapResource: (pipeline: any, region: string) => {
      const name = pipeline.name ?? 'unknown'
      const status = pipeline.status ?? ''
      return {
        id: `aws-imagebuilder-${name}`,
        label: `ImageBuilder: ${name}`,
        type: 'imagebuilder',
        category: 'compute' as NodeCategory,
        region,
        metadata: {
          name,
          arn: str(pipeline.arn),
          platform: str(pipeline.platform),
          status,
          imageRecipeArn: str(pipeline.imageRecipeArn),
          containerRecipeArn: str(pipeline.containerRecipeArn),
        },
        status: status === 'ENABLED' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Outposts — Outposts
  // -----------------------------------------------------------------------
  {
    type: 'outposts',
    category: 'compute',
    sdkPackage: '@aws-sdk/client-outposts',
    clientClass: 'OutpostsClient',
    listCommand: 'ListOutpostsCommand',
    listResponsePath: 'Outposts',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (outpost: any, region: string) => {
      const name = outpost.Name ?? 'unknown'
      const outpostId = outpost.OutpostId ?? 'unknown'
      const lifeCycleStatus = outpost.LifeCycleStatus ?? ''
      return {
        id: `aws-outpost-${outpostId}`,
        label: `Outpost: ${name}`,
        type: 'outposts',
        category: 'compute' as NodeCategory,
        region,
        metadata: {
          name,
          outpostId,
          arn: str(outpost.OutpostArn),
          ownerId: str(outpost.OwnerId),
          siteId: str(outpost.SiteId),
          lifeCycleStatus,
          availabilityZone: str(outpost.AvailabilityZone),
        },
        status: lifeCycleStatus === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // =======================================================================
  //  DATABASE
  // =======================================================================

  // -----------------------------------------------------------------------
  // DynamoDB — Tables
  // -----------------------------------------------------------------------
  {
    type: 'dynamodb',
    category: 'database',
    sdkPackage: '@aws-sdk/client-dynamodb',
    clientClass: 'DynamoDBClient',
    listCommand: 'ListTablesCommand',
    listResponsePath: 'TableNames',
    paginationToken: 'LastEvaluatedTableName',
    paginationInputToken: 'ExclusiveStartTableName',
    importance: 8,
    mapResource: (tableName: string, region: string) => {
      return {
        id: `aws-dynamodb-${tableName}`,
        label: `DynamoDB: ${tableName}`,
        type: 'dynamodb',
        category: 'database',
        region,
        metadata: {
          tableName,
          arn: `arn:aws:dynamodb:${region}:*:table/${tableName}`,
        },
        status: 'healthy' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // ElastiCache — Cache Clusters
  // -----------------------------------------------------------------------
  {
    type: 'elasticache',
    category: 'database',
    sdkPackage: '@aws-sdk/client-elasticache',
    clientClass: 'ElastiCacheClient',
    listCommand: 'DescribeCacheClustersCommand',
    listResponsePath: 'CacheClusters',
    paginationToken: 'Marker',
    paginationInputToken: 'Marker',
    importance: 7,
    mapResource: (cluster: any, region: string) => {
      const clusterId = cluster.CacheClusterId ?? 'unknown'
      const engine = cluster.Engine ?? ''
      const nodeType = cluster.CacheNodeType ?? ''
      const status = cluster.CacheClusterStatus ?? ''
      return {
        id: `aws-elasticache-${clusterId}`,
        label: `Cache: ${clusterId}`,
        type: 'elasticache',
        category: 'database',
        region,
        metadata: {
          clusterId,
          engine,
          engineVersion: str(cluster.EngineVersion),
          nodeType,
          numNodes: str(cluster.NumCacheNodes),
          status,
          arn: str(cluster.ARN),
        },
        status: status === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Neptune — Graph Database Clusters
  // -----------------------------------------------------------------------
  {
    type: 'neptune',
    category: 'database',
    sdkPackage: '@aws-sdk/client-neptune',
    clientClass: 'NeptuneClient',
    listCommand: 'DescribeDBClustersCommand',
    listResponsePath: 'DBClusters',
    paginationToken: 'Marker',
    paginationInputToken: 'Marker',
    importance: 7,
    mapResource: (cluster: any, region: string) => {
      const clusterId = cluster.DBClusterIdentifier ?? 'unknown'
      const status = cluster.Status ?? ''
      return {
        id: `aws-neptune-${clusterId}`,
        label: `Neptune: ${clusterId}`,
        type: 'neptune',
        category: 'database' as NodeCategory,
        region,
        metadata: {
          dbClusterIdentifier: clusterId,
          arn: str(cluster.DBClusterArn),
          engine: str(cluster.Engine),
          engineVersion: str(cluster.EngineVersion),
          status,
          endpoint: str(cluster.Endpoint),
          readerEndpoint: str(cluster.ReaderEndpoint),
          port: str(cluster.Port),
          multiAZ: str(cluster.MultiAZ),
          storageEncrypted: str(cluster.StorageEncrypted),
        },
        status: status === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // DocumentDB — Clusters
  // -----------------------------------------------------------------------
  {
    type: 'documentdb',
    category: 'database',
    sdkPackage: '@aws-sdk/client-docdb',
    clientClass: 'DocDBClient',
    listCommand: 'DescribeDBClustersCommand',
    listResponsePath: 'DBClusters',
    paginationToken: 'Marker',
    paginationInputToken: 'Marker',
    importance: 7,
    mapResource: (cluster: any, region: string) => {
      const clusterId = cluster.DBClusterIdentifier ?? 'unknown'
      const status = cluster.Status ?? ''
      return {
        id: `aws-docdb-${clusterId}`,
        label: `DocDB: ${clusterId}`,
        type: 'documentdb',
        category: 'database' as NodeCategory,
        region,
        metadata: {
          dbClusterIdentifier: clusterId,
          arn: str(cluster.DBClusterArn),
          engine: str(cluster.Engine),
          engineVersion: str(cluster.EngineVersion),
          status,
          endpoint: str(cluster.Endpoint),
          readerEndpoint: str(cluster.ReaderEndpoint),
          port: str(cluster.Port),
          storageEncrypted: str(cluster.StorageEncrypted),
        },
        status: status === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // QLDB — Quantum Ledger Database
  // -----------------------------------------------------------------------
  {
    type: 'qldb',
    category: 'database',
    sdkPackage: '@aws-sdk/client-qldb',
    clientClass: 'QLDBClient',
    listCommand: 'ListLedgersCommand',
    listResponsePath: 'Ledgers',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (ledger: any, region: string) => {
      const name = ledger.Name ?? 'unknown'
      const state = ledger.State ?? ''
      return {
        id: `aws-qldb-${name}`,
        label: `QLDB: ${name}`,
        type: 'qldb',
        category: 'database' as NodeCategory,
        region,
        metadata: {
          name,
          state,
          creationDateTime: ledger.CreationDateTime?.toISOString?.() ?? str(ledger.CreationDateTime),
        },
        status: state === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Keyspaces — Amazon Keyspaces (for Apache Cassandra)
  // -----------------------------------------------------------------------
  {
    type: 'keyspaces',
    category: 'database',
    sdkPackage: '@aws-sdk/client-keyspaces',
    clientClass: 'KeyspacesClient',
    listCommand: 'ListKeyspacesCommand',
    listResponsePath: 'keyspaces',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (ks: any, region: string) => {
      const keyspaceName = ks.keyspaceName ?? 'unknown'
      return {
        id: `aws-keyspaces-${keyspaceName}`,
        label: `Keyspaces: ${keyspaceName}`,
        type: 'keyspaces',
        category: 'database' as NodeCategory,
        region,
        metadata: {
          keyspaceName,
          resourceArn: str(ks.resourceArn),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Timestream — Time Series Database
  // -----------------------------------------------------------------------
  {
    type: 'timestream',
    category: 'database',
    sdkPackage: '@aws-sdk/client-timestream-write',
    clientClass: 'TimestreamWriteClient',
    listCommand: 'ListDatabasesCommand',
    listResponsePath: 'Databases',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (db: any, region: string) => {
      const dbName = db.DatabaseName ?? 'unknown'
      return {
        id: `aws-timestream-${dbName}`,
        label: `Timestream: ${dbName}`,
        type: 'timestream',
        category: 'database' as NodeCategory,
        region,
        metadata: {
          databaseName: dbName,
          arn: str(db.Arn),
          tableCount: str(db.TableCount),
          kmsKeyId: str(db.KmsKeyId),
          creationTime: db.CreationTime?.toISOString?.() ?? str(db.CreationTime),
          lastUpdatedTime: db.LastUpdatedTime?.toISOString?.() ?? str(db.LastUpdatedTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // MemoryDB — MemoryDB for Redis
  // -----------------------------------------------------------------------
  {
    type: 'memorydb',
    category: 'database',
    sdkPackage: '@aws-sdk/client-memorydb',
    clientClass: 'MemoryDBClient',
    listCommand: 'DescribeClustersCommand',
    listResponsePath: 'Clusters',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (cluster: any, region: string) => {
      const clusterName = cluster.Name ?? 'unknown'
      const status = cluster.Status ?? ''
      return {
        id: `aws-memorydb-${clusterName}`,
        label: `MemoryDB: ${clusterName}`,
        type: 'memorydb',
        category: 'database' as NodeCategory,
        region,
        metadata: {
          name: clusterName,
          arn: str(cluster.ARN),
          status,
          nodeType: str(cluster.NodeType),
          engineVersion: str(cluster.EngineVersion),
          numShards: str(cluster.NumberOfShards),
          tlsEnabled: str(cluster.TLSEnabled),
        },
        status: status === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // OpenSearch — Domains
  // -----------------------------------------------------------------------
  {
    type: 'opensearch',
    category: 'database',
    sdkPackage: '@aws-sdk/client-opensearch',
    clientClass: 'OpenSearchClient',
    listCommand: 'ListDomainNamesCommand',
    listResponsePath: 'DomainNames',
    paginationToken: null,
    importance: 7,
    mapResource: (domain: any, region: string) => {
      const domainName = domain.DomainName ?? 'unknown'
      const engineType = domain.EngineType ?? 'OpenSearch'
      return {
        id: `aws-opensearch-${domainName}`,
        label: `OpenSearch: ${domainName}`,
        type: 'opensearch',
        category: 'database' as NodeCategory,
        region,
        metadata: {
          domainName,
          engineType,
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // DAX — DynamoDB Accelerator
  // -----------------------------------------------------------------------
  {
    type: 'dax',
    category: 'database',
    sdkPackage: '@aws-sdk/client-dax',
    clientClass: 'DAXClient',
    listCommand: 'DescribeClustersCommand',
    listResponsePath: 'Clusters',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (cluster: any, region: string) => {
      const clusterName = cluster.ClusterName ?? 'unknown'
      const status = cluster.Status ?? ''
      return {
        id: `aws-dax-${clusterName}`,
        label: `DAX: ${clusterName}`,
        type: 'dax',
        category: 'database' as NodeCategory,
        region,
        metadata: {
          clusterName,
          arn: str(cluster.ClusterArn),
          status,
          nodeType: str(cluster.NodeType),
          totalNodes: str(cluster.TotalNodes),
          activeNodes: str(cluster.ActiveNodes),
          clusterDiscoveryEndpoint: str(cluster.ClusterDiscoveryEndpoint?.Address),
        },
        status: status === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  //  STORAGE
  // =======================================================================

  // -----------------------------------------------------------------------
  // EFS — Elastic File System
  // -----------------------------------------------------------------------
  {
    type: 'efs',
    category: 'storage',
    sdkPackage: '@aws-sdk/client-efs',
    clientClass: 'EFSClient',
    listCommand: 'DescribeFileSystemsCommand',
    listResponsePath: 'FileSystems',
    paginationToken: 'NextMarker',
    paginationInputToken: 'Marker',
    importance: 5,
    mapResource: (fs: any, region: string) => {
      const fsId = fs.FileSystemId ?? 'unknown'
      const fsName = fs.Name ?? fsId
      const lifecycleState = fs.LifeCycleState ?? ''
      return {
        id: `aws-efs-${fsId}`,
        label: `EFS: ${fsName}`,
        type: 'efs',
        category: 'storage' as NodeCategory,
        region,
        metadata: {
          fileSystemId: fsId,
          name: fsName,
          arn: str(fs.FileSystemArn),
          lifecycleState,
          sizeBytes: str(fs.SizeInBytes?.Value ?? 0),
          performanceMode: str(fs.PerformanceMode),
          throughputMode: str(fs.ThroughputMode),
          encrypted: str(fs.Encrypted ?? false),
          numberOfMountTargets: str(fs.NumberOfMountTargets ?? 0),
        },
        status: lifecycleState === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // FSx — File Systems
  // -----------------------------------------------------------------------
  {
    type: 'fsx',
    category: 'storage',
    sdkPackage: '@aws-sdk/client-fsx',
    clientClass: 'FSxClient',
    listCommand: 'DescribeFileSystemsCommand',
    listResponsePath: 'FileSystems',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (fs: any, region: string) => {
      const fsId = fs.FileSystemId ?? 'unknown'
      const fsType = fs.FileSystemType ?? ''
      const lifecycle = fs.Lifecycle ?? ''
      return {
        id: `aws-fsx-${fsId}`,
        label: `FSx: ${fsId} (${fsType})`,
        type: 'fsx',
        category: 'storage' as NodeCategory,
        region,
        metadata: {
          fileSystemId: fsId,
          fileSystemType: fsType,
          lifecycle,
          storageCapacity: str(fs.StorageCapacity),
          storageType: str(fs.StorageType),
          vpcId: str(fs.VpcId),
          arn: str(fs.ResourceARN),
          creationTime: fs.CreationTime?.toISOString?.() ?? str(fs.CreationTime),
          ...tagsToRecord(fs.Tags),
        },
        status: lifecycle === 'AVAILABLE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Storage Gateway — Gateways
  // -----------------------------------------------------------------------
  {
    type: 'storagegateway',
    category: 'storage',
    sdkPackage: '@aws-sdk/client-storage-gateway',
    clientClass: 'StorageGatewayClient',
    listCommand: 'ListGatewaysCommand',
    listResponsePath: 'Gateways',
    paginationToken: 'Marker',
    paginationInputToken: 'Marker',
    importance: 5,
    mapResource: (gw: any, region: string) => {
      const gwName = gw.GatewayName ?? 'unknown'
      const gwId = gw.GatewayId ?? 'unknown'
      const gwType = gw.GatewayType ?? ''
      const gwState = gw.GatewayOperationalState ?? ''
      return {
        id: `aws-sgw-${gwId}`,
        label: `StorageGW: ${gwName}`,
        type: 'storagegateway',
        category: 'storage' as NodeCategory,
        region,
        metadata: {
          gatewayName: gwName,
          gatewayId: gwId,
          arn: str(gw.GatewayARN),
          gatewayType: gwType,
          operationalState: gwState,
        },
        status: gwState === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // AWS Backup — Backup Vaults
  // -----------------------------------------------------------------------
  {
    type: 'backup',
    category: 'storage',
    sdkPackage: '@aws-sdk/client-backup',
    clientClass: 'BackupClient',
    listCommand: 'ListBackupVaultsCommand',
    listResponsePath: 'BackupVaultList',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (vault: any, region: string) => {
      const vaultName = vault.BackupVaultName ?? 'unknown'
      return {
        id: `aws-backup-${vaultName}`,
        label: `Backup: ${vaultName}`,
        type: 'backup',
        category: 'storage' as NodeCategory,
        region,
        metadata: {
          backupVaultName: vaultName,
          arn: str(vault.BackupVaultArn),
          encryptionKeyArn: str(vault.EncryptionKeyArn),
          numberOfRecoveryPoints: str(vault.NumberOfRecoveryPoints),
          creationDate: vault.CreationDate?.toISOString?.() ?? str(vault.CreationDate),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Glacier — Vaults
  // -----------------------------------------------------------------------
  {
    type: 's3-glacier',
    category: 'storage',
    sdkPackage: '@aws-sdk/client-glacier',
    clientClass: 'GlacierClient',
    listCommand: 'ListVaultsCommand',
    listResponsePath: 'VaultList',
    paginationToken: 'Marker',
    paginationInputToken: 'marker',
    importance: 4,
    mapResource: (vault: any, region: string) => {
      const vaultName = vault.VaultName ?? 'unknown'
      return {
        id: `aws-glacier-${vaultName}`,
        label: `Glacier: ${vaultName}`,
        type: 's3-glacier',
        category: 'storage' as NodeCategory,
        region,
        metadata: {
          vaultName,
          arn: str(vault.VaultARN),
          creationDate: str(vault.CreationDate),
          numberOfArchives: str(vault.NumberOfArchives),
          sizeInBytes: str(vault.SizeInBytes),
          lastInventoryDate: str(vault.LastInventoryDate),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // DataSync — Tasks
  // -----------------------------------------------------------------------
  {
    type: 'datasync',
    category: 'storage',
    sdkPackage: '@aws-sdk/client-datasync',
    clientClass: 'DataSyncClient',
    listCommand: 'ListTasksCommand',
    listResponsePath: 'Tasks',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (task: any, region: string) => {
      const taskArn = task.TaskArn ?? ''
      const name = task.Name ?? taskArn.split('/').pop() ?? 'unknown'
      const status = task.Status ?? ''
      return {
        id: `aws-datasync-${name}`,
        label: `DataSync: ${name}`,
        type: 'datasync',
        category: 'storage' as NodeCategory,
        region,
        metadata: {
          name,
          taskArn,
          status,
        },
        status: status === 'AVAILABLE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Transfer Family — SFTP/FTP Servers
  // -----------------------------------------------------------------------
  {
    type: 'transfer',
    category: 'storage',
    sdkPackage: '@aws-sdk/client-transfer',
    clientClass: 'TransferClient',
    listCommand: 'ListServersCommand',
    listResponsePath: 'Servers',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (server: any, region: string) => {
      const serverId = server.ServerId ?? 'unknown'
      const state = server.State ?? ''
      return {
        id: `aws-transfer-${serverId}`,
        label: `Transfer: ${serverId}`,
        type: 'transfer',
        category: 'storage' as NodeCategory,
        region,
        metadata: {
          serverId,
          arn: str(server.Arn),
          domain: str(server.Domain),
          endpointType: str(server.EndpointType),
          identityProviderType: str(server.IdentityProviderType),
          state,
          userCount: str(server.UserCount),
        },
        status: state === 'ONLINE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Snow Family — Snowball Jobs
  // -----------------------------------------------------------------------
  {
    type: 'snow',
    category: 'storage',
    sdkPackage: '@aws-sdk/client-snowball',
    clientClass: 'SnowballClient',
    listCommand: 'ListJobsCommand',
    listResponsePath: 'JobListEntries',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (job: any, region: string) => {
      const jobId = job.JobId ?? 'unknown'
      const jobState = job.JobState ?? ''
      return {
        id: `aws-snow-${jobId}`,
        label: `Snow: ${jobId.substring(0, 12)}...`,
        type: 'snow',
        category: 'storage' as NodeCategory,
        region,
        metadata: {
          jobId,
          jobState,
          jobType: str(job.JobType),
          snowballType: str(job.SnowballType),
          creationDate: job.CreationDate?.toISOString?.() ?? str(job.CreationDate),
          description: str(job.Description),
        },
        status: jobState === 'Complete' ? 'healthy' as HealthStatus
          : jobState === 'InProgress' ? 'warning' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // =======================================================================
  //  NETWORK
  // =======================================================================

  // -----------------------------------------------------------------------
  // Route53 — Hosted Zones
  // -----------------------------------------------------------------------
  {
    type: 'route53',
    category: 'network',
    sdkPackage: '@aws-sdk/client-route-53',
    clientClass: 'Route53Client',
    listCommand: 'ListHostedZonesCommand',
    listResponsePath: 'HostedZones',
    paginationToken: 'NextMarker',
    paginationInputToken: 'Marker',
    importance: 7,
    mapResource: (zone: any, _region: string) => {
      const zoneName = (zone.Name ?? 'unknown').replace(/\.$/, '')
      const zoneId = (zone.Id ?? '').replace('/hostedzone/', '')
      return {
        id: `aws-r53-${zoneId}`,
        label: `DNS: ${zoneName}`,
        type: 'route53',
        category: 'network',
        region: 'global',
        metadata: {
          zoneName,
          zoneId,
          comment: str(zone.Config?.Comment),
          privateZone: str(zone.Config?.PrivateZone),
          recordCount: str(zone.ResourceRecordSetCount),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // ELBv2 — Application and Network Load Balancers
  // -----------------------------------------------------------------------
  {
    type: 'elbv2',
    category: 'network',
    sdkPackage: '@aws-sdk/client-elastic-load-balancing-v2',
    clientClass: 'ElasticLoadBalancingV2Client',
    listCommand: 'DescribeLoadBalancersCommand',
    listResponsePath: 'LoadBalancers',
    paginationToken: 'NextMarker',
    paginationInputToken: 'Marker',
    importance: 7,
    mapResource: (lb: any, region: string) => {
      const lbName = lb.LoadBalancerName ?? 'unknown'
      const lbType = lb.Type ?? 'application'
      const scheme = lb.Scheme ?? 'internet-facing'
      const state = lb.State?.Code ?? ''
      return {
        id: `aws-lb-${lbName}`,
        label: `${lbType === 'network' ? 'NLB' : 'ALB'}: ${lbName}`,
        type: 'elbv2',
        category: 'network',
        region,
        metadata: {
          loadBalancerName: lbName,
          arn: str(lb.LoadBalancerArn),
          dnsName: str(lb.DNSName),
          type: lbType,
          scheme,
          state,
          vpcId: str(lb.VpcId),
          availabilityZones: (lb.AvailabilityZones ?? []).map((az: any) => az.ZoneName ?? '').join(', '),
          createdTime: lb.CreatedTime?.toISOString?.() ?? str(lb.CreatedTime),
        },
        status: state === 'active' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Direct Connect — Connections
  // -----------------------------------------------------------------------
  {
    type: 'directconnect',
    category: 'network',
    sdkPackage: '@aws-sdk/client-direct-connect',
    clientClass: 'DirectConnectClient',
    listCommand: 'DescribeConnectionsCommand',
    listResponsePath: 'connections',
    paginationToken: null,
    importance: 7,
    mapResource: (conn: any, region: string) => {
      const connName = conn.connectionName ?? 'unknown'
      const connId = conn.connectionId ?? 'unknown'
      const connState = conn.connectionState ?? ''
      return {
        id: `aws-dx-${connId}`,
        label: `DX: ${connName}`,
        type: 'directconnect',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          connectionName: connName,
          connectionId: connId,
          connectionState: connState,
          bandwidth: str(conn.bandwidth),
          location: str(conn.location),
          vlan: str(conn.vlan),
          partnerName: str(conn.partnerName),
        },
        status: connState === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Transit Gateway
  // -----------------------------------------------------------------------
  {
    type: 'transitgateway',
    category: 'network',
    sdkPackage: '@aws-sdk/client-ec2',
    clientClass: 'EC2Client',
    listCommand: 'DescribeTransitGatewaysCommand',
    listResponsePath: 'TransitGateways',
    paginationToken: 'NextToken',
    importance: 8,
    mapResource: (tgw: any, region: string) => {
      const tgwId = tgw.TransitGatewayId ?? 'unknown'
      const state = tgw.State ?? ''
      const tags = tagsToRecord(tgw.Tags)
      const name = tags['Name'] ?? tgwId
      return {
        id: `aws-tgw-${tgwId}`,
        label: `TGW: ${name}`,
        type: 'transitgateway',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          transitGatewayId: tgwId,
          arn: str(tgw.TransitGatewayArn),
          state,
          ownerId: str(tgw.OwnerId),
          description: str(tgw.Description),
          amazonSideAsn: str(tgw.Options?.AmazonSideAsn),
          ...tags,
        },
        status: state === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // VPN — VPN Connections
  // -----------------------------------------------------------------------
  {
    type: 'vpn',
    category: 'network',
    sdkPackage: '@aws-sdk/client-ec2',
    clientClass: 'EC2Client',
    listCommand: 'DescribeVpnConnectionsCommand',
    listResponsePath: 'VpnConnections',
    paginationToken: null,
    importance: 6,
    mapResource: (vpn: any, region: string) => {
      const vpnId = vpn.VpnConnectionId ?? 'unknown'
      const state = vpn.State ?? ''
      const tags = tagsToRecord(vpn.Tags)
      const name = tags['Name'] ?? vpnId
      return {
        id: `aws-vpn-${vpnId}`,
        label: `VPN: ${name}`,
        type: 'vpn',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          vpnConnectionId: vpnId,
          state,
          type: str(vpn.Type),
          customerGatewayId: str(vpn.CustomerGatewayId),
          vpnGatewayId: str(vpn.VpnGatewayId),
          transitGatewayId: str(vpn.TransitGatewayId),
          ...tags,
        },
        status: state === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // VPC Endpoints / PrivateLink
  // -----------------------------------------------------------------------
  {
    type: 'vpcendpoint',
    category: 'network',
    sdkPackage: '@aws-sdk/client-ec2',
    clientClass: 'EC2Client',
    listCommand: 'DescribeVpcEndpointsCommand',
    listResponsePath: 'VpcEndpoints',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (ep: any, region: string) => {
      const endpointId = ep.VpcEndpointId ?? 'unknown'
      const state = ep.State ?? ''
      const serviceName = ep.ServiceName ?? ''
      const tags = tagsToRecord(ep.Tags)
      const name = tags['Name'] ?? endpointId
      return {
        id: `aws-vpce-${endpointId}`,
        label: `VPCE: ${name}`,
        type: 'vpcendpoint',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          vpcEndpointId: endpointId,
          vpcId: str(ep.VpcId),
          serviceName,
          state,
          vpcEndpointType: str(ep.VpcEndpointType),
          ...tags,
        },
        status: state === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Global Accelerator
  // -----------------------------------------------------------------------
  {
    type: 'globalaccelerator',
    category: 'network',
    sdkPackage: '@aws-sdk/client-global-accelerator',
    clientClass: 'GlobalAcceleratorClient',
    listCommand: 'ListAcceleratorsCommand',
    listResponsePath: 'Accelerators',
    paginationToken: 'NextToken',
    importance: 7,
    mapResource: (acc: any, _region: string) => {
      const name = acc.Name ?? 'unknown'
      const status = acc.Status ?? ''
      return {
        id: `aws-ga-${name}`,
        label: `GA: ${name}`,
        type: 'globalaccelerator',
        category: 'network' as NodeCategory,
        region: 'global',
        metadata: {
          name,
          acceleratorArn: str(acc.AcceleratorArn),
          status,
          enabled: str(acc.Enabled),
          dnsName: str(acc.DnsName),
          ipAddressType: str(acc.IpAddressType),
          ipSets: (acc.IpSets ?? []).map((s: any) => (s.IpAddresses ?? []).join(', ')).join('; '),
          createdTime: acc.CreatedTime?.toISOString?.() ?? str(acc.CreatedTime),
        },
        status: status === 'DEPLOYED' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Network Firewall
  // -----------------------------------------------------------------------
  {
    type: 'networkfirewall',
    category: 'network',
    sdkPackage: '@aws-sdk/client-network-firewall',
    clientClass: 'NetworkFirewallClient',
    listCommand: 'ListFirewallsCommand',
    listResponsePath: 'Firewalls',
    paginationToken: 'NextToken',
    importance: 7,
    mapResource: (fw: any, region: string) => {
      const firewallName = fw.FirewallName ?? 'unknown'
      const firewallArn = fw.FirewallArn ?? ''
      return {
        id: `aws-nfw-${firewallName}`,
        label: `NFW: ${firewallName}`,
        type: 'networkfirewall',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          firewallName,
          firewallArn,
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud Map — Service Discovery Namespaces
  // -----------------------------------------------------------------------
  {
    type: 'cloudmap',
    category: 'network',
    sdkPackage: '@aws-sdk/client-servicediscovery',
    clientClass: 'ServiceDiscoveryClient',
    listCommand: 'ListNamespacesCommand',
    listResponsePath: 'Namespaces',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (ns: any, region: string) => {
      const name = ns.Name ?? 'unknown'
      const nsId = ns.Id ?? 'unknown'
      const nsType = ns.Type ?? ''
      return {
        id: `aws-cloudmap-${nsId}`,
        label: `CloudMap: ${name}`,
        type: 'cloudmap',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          name,
          namespaceId: nsId,
          arn: str(ns.Arn),
          type: nsType,
          description: str(ns.Description),
          serviceCount: str(ns.ServiceCount),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // App Mesh — Meshes
  // -----------------------------------------------------------------------
  {
    type: 'appmesh',
    category: 'network',
    sdkPackage: '@aws-sdk/client-app-mesh',
    clientClass: 'AppMeshClient',
    listCommand: 'ListMeshesCommand',
    listResponsePath: 'meshes',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (mesh: any, region: string) => {
      const meshName = mesh.meshName ?? 'unknown'
      const arn = mesh.arn ?? ''
      return {
        id: `aws-appmesh-${meshName}`,
        label: `Mesh: ${meshName}`,
        type: 'appmesh',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          meshName,
          arn,
          meshOwner: str(mesh.meshOwner),
          resourceOwner: str(mesh.resourceOwner),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // NAT Gateways
  // -----------------------------------------------------------------------
  {
    type: 'natgateway',
    category: 'network',
    sdkPackage: '@aws-sdk/client-ec2',
    clientClass: 'EC2Client',
    listCommand: 'DescribeNatGatewaysCommand',
    listResponsePath: 'NatGateways',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (ngw: any, region: string) => {
      const ngwId = ngw.NatGatewayId ?? 'unknown'
      const state = ngw.State ?? ''
      const tags = tagsToRecord(ngw.Tags)
      const name = tags['Name'] ?? ngwId
      return {
        id: `aws-natgw-${ngwId}`,
        label: `NAT: ${name}`,
        type: 'natgateway',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          natGatewayId: ngwId,
          state,
          vpcId: str(ngw.VpcId),
          subnetId: str(ngw.SubnetId),
          connectivityType: str(ngw.ConnectivityType),
          ...tags,
        },
        status: state === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Internet Gateways
  // -----------------------------------------------------------------------
  {
    type: 'internetgateway',
    category: 'network',
    sdkPackage: '@aws-sdk/client-ec2',
    clientClass: 'EC2Client',
    listCommand: 'DescribeInternetGatewaysCommand',
    listResponsePath: 'InternetGateways',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (igw: any, region: string) => {
      const igwId = igw.InternetGatewayId ?? 'unknown'
      const tags = tagsToRecord(igw.Tags)
      const name = tags['Name'] ?? igwId
      const attachments = igw.Attachments ?? []
      const vpcId = attachments.length > 0 ? str(attachments[0].VpcId) : ''
      const attachState = attachments.length > 0 ? str(attachments[0].State) : ''
      return {
        id: `aws-igw-${igwId}`,
        label: `IGW: ${name}`,
        type: 'internetgateway',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          internetGatewayId: igwId,
          vpcId,
          attachState,
          ...tags,
        },
        status: attachState === 'available' || attachState === 'attached' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Security Groups
  // -----------------------------------------------------------------------
  {
    type: 'securitygroup',
    category: 'network',
    sdkPackage: '@aws-sdk/client-ec2',
    clientClass: 'EC2Client',
    listCommand: 'DescribeSecurityGroupsCommand',
    listResponsePath: 'SecurityGroups',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (sg: any, region: string) => {
      const sgId = sg.GroupId ?? 'unknown'
      const sgName = sg.GroupName ?? 'unknown'
      const tags = tagsToRecord(sg.Tags)
      return {
        id: `aws-sg-${sgId}`,
        label: `SG: ${sgName}`,
        type: 'securitygroup',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          groupId: sgId,
          groupName: sgName,
          description: str(sg.Description),
          vpcId: str(sg.VpcId),
          inboundRuleCount: str((sg.IpPermissions ?? []).length),
          outboundRuleCount: str((sg.IpPermissionsEgress ?? []).length),
          ...tags,
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Elastic IPs
  // -----------------------------------------------------------------------
  {
    type: 'elasticip',
    category: 'network',
    sdkPackage: '@aws-sdk/client-ec2',
    clientClass: 'EC2Client',
    listCommand: 'DescribeAddressesCommand',
    listResponsePath: 'Addresses',
    paginationToken: null,
    importance: 3,
    mapResource: (eip: any, region: string) => {
      const allocationId = eip.AllocationId ?? 'unknown'
      const publicIp = eip.PublicIp ?? ''
      const tags = tagsToRecord(eip.Tags)
      const name = tags['Name'] ?? publicIp
      return {
        id: `aws-eip-${allocationId}`,
        label: `EIP: ${name}`,
        type: 'elasticip',
        category: 'network' as NodeCategory,
        region,
        metadata: {
          allocationId,
          publicIp,
          associationId: str(eip.AssociationId),
          instanceId: str(eip.InstanceId),
          networkInterfaceId: str(eip.NetworkInterfaceId),
          domain: str(eip.Domain),
          ...tags,
        },
        status: eip.AssociationId ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 3,
      }
    },
  },

  // =======================================================================
  //  SERVERLESS
  // =======================================================================

  // -----------------------------------------------------------------------
  // API Gateway — REST APIs
  // -----------------------------------------------------------------------
  {
    type: 'apigateway',
    category: 'serverless',
    sdkPackage: '@aws-sdk/client-api-gateway',
    clientClass: 'APIGatewayClient',
    listCommand: 'GetRestApisCommand',
    listResponsePath: 'items',
    paginationToken: 'position',
    paginationInputToken: 'position',
    importance: 7,
    mapResource: (api: any, region: string) => {
      const apiName = api.name ?? 'unknown'
      const apiId = api.id ?? 'unknown'
      return {
        id: `aws-apigw-${apiId}`,
        label: `API: ${apiName}`,
        type: 'apigateway',
        category: 'serverless',
        region,
        metadata: {
          apiId,
          apiName,
          description: str(api.description),
          createdDate: api.createdDate?.toISOString?.() ?? str(api.createdDate),
          endpointTypes: (api.endpointConfiguration?.types ?? []).join(', '),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // API Gateway v2 — HTTP/WebSocket APIs
  // -----------------------------------------------------------------------
  {
    type: 'apigw-v2',
    category: 'serverless',
    sdkPackage: '@aws-sdk/client-apigatewayv2',
    clientClass: 'ApiGatewayV2Client',
    listCommand: 'GetApisCommand',
    listResponsePath: 'Items',
    paginationToken: 'NextToken',
    importance: 7,
    mapResource: (api: any, region: string) => {
      const apiName = api.Name ?? 'unknown'
      const apiId = api.ApiId ?? 'unknown'
      const protocolType = api.ProtocolType ?? ''
      return {
        id: `aws-apigw2-${apiId}`,
        label: `API-v2: ${apiName}`,
        type: 'apigw-v2',
        category: 'serverless' as NodeCategory,
        region,
        metadata: {
          apiId,
          name: apiName,
          protocolType,
          apiEndpoint: str(api.ApiEndpoint),
          description: str(api.Description),
          createdDate: api.CreatedDate?.toISOString?.() ?? str(api.CreatedDate),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Step Functions — State Machines
  // -----------------------------------------------------------------------
  {
    type: 'stepfunctions',
    category: 'serverless',
    sdkPackage: '@aws-sdk/client-sfn',
    clientClass: 'SFNClient',
    listCommand: 'ListStateMachinesCommand',
    listResponsePath: 'stateMachines',
    paginationToken: 'nextToken',
    importance: 6,
    mapResource: (sm: any, region: string) => {
      const smName = sm.name ?? 'unknown'
      const smArn = sm.stateMachineArn ?? ''
      return {
        id: `aws-sfn-${smName}`,
        label: `StepFn: ${smName}`,
        type: 'stepfunctions',
        category: 'serverless',
        region,
        metadata: {
          name: smName,
          arn: smArn,
          type: str(sm.type),
          creationDate: sm.creationDate?.toISOString?.() ?? str(sm.creationDate),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // =======================================================================
  //  MESSAGING
  // =======================================================================

  // -----------------------------------------------------------------------
  // SQS — Simple Queue Service
  // -----------------------------------------------------------------------
  {
    type: 'sqs',
    category: 'messaging',
    sdkPackage: '@aws-sdk/client-sqs',
    clientClass: 'SQSClient',
    listCommand: 'ListQueuesCommand',
    listResponsePath: 'QueueUrls',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (queueUrl: string, region: string) => {
      // SQS ListQueues returns just URLs; the queue name is the last path segment
      const queueName = queueUrl.split('/').pop() ?? 'unknown'
      return {
        id: `aws-sqs-${queueName}`,
        label: `SQS: ${queueName}`,
        type: 'sqs',
        category: 'messaging',
        region,
        metadata: {
          queueUrl,
          queueName,
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SNS — Simple Notification Service
  // -----------------------------------------------------------------------
  {
    type: 'sns',
    category: 'messaging',
    sdkPackage: '@aws-sdk/client-sns',
    clientClass: 'SNSClient',
    listCommand: 'ListTopicsCommand',
    listResponsePath: 'Topics',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (topic: any, region: string) => {
      const arn = topic.TopicArn ?? ''
      const topicName = arn.split(':').pop() ?? 'unknown'
      return {
        id: `aws-sns-${topicName}`,
        label: `SNS: ${topicName}`,
        type: 'sns',
        category: 'messaging',
        region,
        metadata: {
          arn,
          topicName,
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // EventBridge — Event Buses
  // -----------------------------------------------------------------------
  {
    type: 'eventbridge',
    category: 'messaging',
    sdkPackage: '@aws-sdk/client-eventbridge',
    clientClass: 'EventBridgeClient',
    listCommand: 'ListEventBusesCommand',
    listResponsePath: 'EventBuses',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (bus: any, region: string) => {
      const busName = bus.Name ?? 'unknown'
      const busArn = bus.Arn ?? ''
      return {
        id: `aws-eb-${busName}`,
        label: `EventBus: ${busName}`,
        type: 'eventbridge',
        category: 'messaging',
        region,
        metadata: {
          name: busName,
          arn: busArn,
          policy: bus.Policy ? 'custom' : 'default',
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Kinesis — Data Streams
  // -----------------------------------------------------------------------
  {
    type: 'kinesis',
    category: 'messaging',
    sdkPackage: '@aws-sdk/client-kinesis',
    clientClass: 'KinesisClient',
    listCommand: 'ListStreamsCommand',
    listResponsePath: 'StreamNames',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (streamName: string, region: string) => {
      return {
        id: `aws-kinesis-${streamName}`,
        label: `Kinesis: ${streamName}`,
        type: 'kinesis',
        category: 'messaging' as NodeCategory,
        region,
        metadata: {
          streamName,
          arn: `arn:aws:kinesis:${region}:*:stream/${streamName}`,
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // MSK — Managed Streaming for Apache Kafka
  // -----------------------------------------------------------------------
  {
    type: 'msk',
    category: 'messaging',
    sdkPackage: '@aws-sdk/client-kafka',
    clientClass: 'KafkaClient',
    listCommand: 'ListClustersV2Command',
    listResponsePath: 'ClusterInfoList',
    paginationToken: 'NextToken',
    importance: 7,
    mapResource: (cluster: any, region: string) => {
      const clusterName = cluster.ClusterName ?? 'unknown'
      const state = cluster.State ?? ''
      const clusterType = cluster.ClusterType ?? ''
      return {
        id: `aws-msk-${clusterName}`,
        label: `MSK: ${clusterName}`,
        type: 'msk',
        category: 'messaging' as NodeCategory,
        region,
        metadata: {
          clusterName,
          clusterArn: str(cluster.ClusterArn),
          clusterType,
          state,
          creationTime: cluster.CreationTime?.toISOString?.() ?? str(cluster.CreationTime),
        },
        status: state === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Amazon MQ — Brokers
  // -----------------------------------------------------------------------
  {
    type: 'mq',
    category: 'messaging',
    sdkPackage: '@aws-sdk/client-mq',
    clientClass: 'MqClient',
    listCommand: 'ListBrokersCommand',
    listResponsePath: 'BrokerSummaries',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (broker: any, region: string) => {
      const brokerName = broker.BrokerName ?? 'unknown'
      const brokerId = broker.BrokerId ?? 'unknown'
      const brokerState = broker.BrokerState ?? ''
      return {
        id: `aws-mq-${brokerId}`,
        label: `MQ: ${brokerName}`,
        type: 'mq',
        category: 'messaging' as NodeCategory,
        region,
        metadata: {
          brokerName,
          brokerId,
          brokerArn: str(broker.BrokerArn),
          brokerState,
          deploymentMode: str(broker.DeploymentMode),
          engineType: str(broker.EngineType),
          hostInstanceType: str(broker.HostInstanceType),
          createdDate: broker.Created?.toISOString?.() ?? str(broker.Created),
        },
        status: brokerState === 'RUNNING' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Kinesis Data Firehose — Delivery Streams
  // -----------------------------------------------------------------------
  {
    type: 'firehose',
    category: 'messaging',
    sdkPackage: '@aws-sdk/client-firehose',
    clientClass: 'FirehoseClient',
    listCommand: 'ListDeliveryStreamsCommand',
    listResponsePath: 'DeliveryStreamNames',
    paginationToken: null,
    importance: 5,
    mapResource: (streamName: string, region: string) => {
      return {
        id: `aws-firehose-${streamName}`,
        label: `Firehose: ${streamName}`,
        type: 'firehose',
        category: 'messaging' as NodeCategory,
        region,
        metadata: {
          deliveryStreamName: streamName,
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Pinpoint — Applications
  // -----------------------------------------------------------------------
  {
    type: 'pinpoint',
    category: 'messaging',
    sdkPackage: '@aws-sdk/client-pinpoint',
    clientClass: 'PinpointClient',
    listCommand: 'GetAppsCommand',
    listResponsePath: 'ApplicationsResponse.Item',
    paginationToken: 'ApplicationsResponse.NextToken',
    importance: 5,
    mapResource: (app: any, region: string) => {
      const appName = app.Name ?? 'unknown'
      const appId = app.Id ?? 'unknown'
      return {
        id: `aws-pinpoint-${appId}`,
        label: `Pinpoint: ${appName}`,
        type: 'pinpoint',
        category: 'messaging' as NodeCategory,
        region,
        metadata: {
          name: appName,
          applicationId: appId,
          arn: str(app.Arn),
          creationDate: str(app.CreationDate),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SES — Simple Email Service v2
  // -----------------------------------------------------------------------
  {
    type: 'ses',
    category: 'messaging',
    sdkPackage: '@aws-sdk/client-sesv2',
    clientClass: 'SESv2Client',
    listCommand: 'ListEmailIdentitiesCommand',
    listResponsePath: 'EmailIdentities',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (identity: any, region: string) => {
      const identityName = identity.IdentityName ?? 'unknown'
      const identityType = identity.IdentityType ?? ''
      const sendingEnabled = identity.SendingEnabled ?? false
      return {
        id: `aws-ses-${identityName.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
        label: `SES: ${identityName}`,
        type: 'ses',
        category: 'messaging' as NodeCategory,
        region,
        metadata: {
          identityName,
          identityType,
          sendingEnabled: str(sendingEnabled),
        },
        status: sendingEnabled ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  //  ANALYTICS
  // =======================================================================

  // -----------------------------------------------------------------------
  // CloudWatch Logs — Log Groups
  // -----------------------------------------------------------------------
  {
    type: 'cloudwatch-logs',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-cloudwatch-logs',
    clientClass: 'CloudWatchLogsClient',
    listCommand: 'DescribeLogGroupsCommand',
    listResponsePath: 'logGroups',
    paginationToken: 'nextToken',
    importance: 4,
    mapResource: (logGroup: any, region: string) => {
      const logGroupName = logGroup.logGroupName ?? 'unknown'
      // Use a sanitized version for the id (log group names can contain slashes)
      const safeId = logGroupName.replace(/[^a-zA-Z0-9-_]/g, '-')
      return {
        id: `aws-cwlog-${safeId}`,
        label: `Logs: ${logGroupName}`,
        type: 'cloudwatch-logs',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          logGroupName,
          arn: str(logGroup.arn),
          storedBytes: str(logGroup.storedBytes ?? 0),
          retentionDays: str(logGroup.retentionInDays ?? 'never expires'),
          creationTime: logGroup.creationTime
            ? new Date(logGroup.creationTime).toISOString()
            : '',
          metricFilterCount: str(logGroup.metricFilterCount ?? 0),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Redshift — Data Warehouse Clusters
  // -----------------------------------------------------------------------
  {
    type: 'redshift',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-redshift',
    clientClass: 'RedshiftClient',
    listCommand: 'DescribeClustersCommand',
    listResponsePath: 'Clusters',
    paginationToken: 'Marker',
    paginationInputToken: 'Marker',
    importance: 8,
    mapResource: (cluster: any, region: string) => {
      const clusterId = cluster.ClusterIdentifier ?? 'unknown'
      const status = cluster.ClusterStatus ?? ''
      return {
        id: `aws-redshift-${clusterId}`,
        label: `Redshift: ${clusterId}`,
        type: 'redshift',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          clusterIdentifier: clusterId,
          nodeType: str(cluster.NodeType),
          numberOfNodes: str(cluster.NumberOfNodes ?? 1),
          status,
          dbName: str(cluster.DBName),
          endpoint: cluster.Endpoint?.Address
            ? `${cluster.Endpoint.Address}:${cluster.Endpoint.Port ?? 5439}`
            : '',
          vpcId: str(cluster.VpcId),
          encrypted: str(cluster.Encrypted ?? false),
          automatedSnapshotRetention: str(cluster.AutomatedSnapshotRetentionPeriod ?? 0),
        },
        status: status === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Athena — Workgroups
  // -----------------------------------------------------------------------
  {
    type: 'athena',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-athena',
    clientClass: 'AthenaClient',
    listCommand: 'ListWorkGroupsCommand',
    listResponsePath: 'WorkGroups',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (wg: any, region: string) => {
      const wgName = wg.Name ?? 'unknown'
      const state = wg.State ?? ''
      return {
        id: `aws-athena-${wgName}`,
        label: `Athena: ${wgName}`,
        type: 'athena',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          name: wgName,
          state,
          description: str(wg.Description),
          creationTime: wg.CreationTime?.toISOString?.() ?? str(wg.CreationTime),
          engineVersion: str(wg.EngineVersion?.SelectedEngineVersion),
        },
        status: state === 'ENABLED' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // EMR — Elastic MapReduce Clusters
  // -----------------------------------------------------------------------
  {
    type: 'emr',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-emr',
    clientClass: 'EMRClient',
    listCommand: 'ListClustersCommand',
    listResponsePath: 'Clusters',
    paginationToken: 'Marker',
    paginationInputToken: 'Marker',
    importance: 7,
    mapResource: (cluster: any, region: string) => {
      const clusterName = cluster.Name ?? 'unknown'
      const clusterId = cluster.Id ?? 'unknown'
      const stateCode = cluster.Status?.State ?? ''
      return {
        id: `aws-emr-${clusterId}`,
        label: `EMR: ${clusterName}`,
        type: 'emr',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          name: clusterName,
          clusterId,
          state: stateCode,
          normalizedInstanceHours: str(cluster.NormalizedInstanceHours),
          clusterArn: str(cluster.ClusterArn),
        },
        status: stateCode === 'RUNNING' || stateCode === 'WAITING' ? 'healthy' as HealthStatus
          : stateCode === 'TERMINATED' || stateCode === 'TERMINATED_WITH_ERRORS' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Glue — Databases
  // -----------------------------------------------------------------------
  {
    type: 'glue',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-glue',
    clientClass: 'GlueClient',
    listCommand: 'GetDatabasesCommand',
    listResponsePath: 'DatabaseList',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (db: any, region: string) => {
      const dbName = db.Name ?? 'unknown'
      return {
        id: `aws-glue-${dbName}`,
        label: `Glue: ${dbName}`,
        type: 'glue',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          name: dbName,
          description: str(db.Description),
          locationUri: str(db.LocationUri),
          catalogId: str(db.CatalogId),
          createTime: db.CreateTime?.toISOString?.() ?? str(db.CreateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Lake Formation — Resources
  // -----------------------------------------------------------------------
  {
    type: 'lakeformation',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-lakeformation',
    clientClass: 'LakeFormationClient',
    listCommand: 'ListResourcesCommand',
    listResponsePath: 'ResourceInfoList',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (resource: any, region: string) => {
      const resourceArn = resource.ResourceArn ?? 'unknown'
      const shortName = resourceArn.split(':').pop() ?? resourceArn
      return {
        id: `aws-lakeformation-${shortName.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
        label: `LakeForm: ${shortName}`,
        type: 'lakeformation',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          resourceArn,
          roleArn: str(resource.RoleArn),
          lastModified: resource.LastModified?.toISOString?.() ?? str(resource.LastModified),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // QuickSight — Dashboards
  // -----------------------------------------------------------------------
  {
    type: 'quicksight',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-quicksight',
    clientClass: 'QuickSightClient',
    listCommand: 'ListDashboardsCommand',
    listResponsePath: 'DashboardSummaryList',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (dashboard: any, region: string) => {
      const dashboardName = dashboard.Name ?? 'unknown'
      const dashboardId = dashboard.DashboardId ?? 'unknown'
      return {
        id: `aws-quicksight-${dashboardId}`,
        label: `QS: ${dashboardName}`,
        type: 'quicksight',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          name: dashboardName,
          dashboardId,
          arn: str(dashboard.Arn),
          createdTime: dashboard.CreatedTime?.toISOString?.() ?? str(dashboard.CreatedTime),
          lastUpdatedTime: dashboard.LastUpdatedTime?.toISOString?.() ?? str(dashboard.LastUpdatedTime),
          lastPublishedTime: dashboard.LastPublishedTime?.toISOString?.() ?? str(dashboard.LastPublishedTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Kinesis Analytics v2 — Applications
  // -----------------------------------------------------------------------
  {
    type: 'kinesis-analytics',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-kinesis-analytics-v2',
    clientClass: 'KinesisAnalyticsV2Client',
    listCommand: 'ListApplicationsCommand',
    listResponsePath: 'ApplicationSummaries',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (app: any, region: string) => {
      const appName = app.ApplicationName ?? 'unknown'
      const status = app.ApplicationStatus ?? ''
      return {
        id: `aws-kinesisanalytics-${appName}`,
        label: `KAnalytics: ${appName}`,
        type: 'kinesis-analytics',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          applicationName: appName,
          applicationArn: str(app.ApplicationARN),
          applicationStatus: status,
          runtimeEnvironment: str(app.RuntimeEnvironment),
          applicationVersionId: str(app.ApplicationVersionId),
        },
        status: status === 'RUNNING' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CloudSearch — Domains
  // -----------------------------------------------------------------------
  {
    type: 'cloudsearch',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-cloudsearch',
    clientClass: 'CloudSearchClient',
    listCommand: 'DescribeDomainsCommand',
    listResponsePath: 'DomainStatusList',
    paginationToken: null,
    importance: 5,
    mapResource: (domain: any, region: string) => {
      const domainName = domain.DomainName ?? 'unknown'
      const processing = domain.Processing ?? false
      return {
        id: `aws-cloudsearch-${domainName}`,
        label: `CloudSearch: ${domainName}`,
        type: 'cloudsearch',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          domainName,
          domainId: str(domain.DomainId),
          arn: str(domain.ARN),
          created: str(domain.Created),
          deleted: str(domain.Deleted),
          processing: str(processing),
          searchInstanceType: str(domain.SearchInstanceType),
          searchInstanceCount: str(domain.SearchInstanceCount),
          searchPartitionCount: str(domain.SearchPartitionCount),
          docEndpoint: str(domain.DocService?.Endpoint),
          searchEndpoint: str(domain.SearchService?.Endpoint),
        },
        status: processing ? 'warning' as HealthStatus : 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Glue DataBrew — Projects
  // -----------------------------------------------------------------------
  {
    type: 'databrew',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-databrew',
    clientClass: 'DataBrewClient',
    listCommand: 'ListProjectsCommand',
    listResponsePath: 'Projects',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (project: any, region: string) => {
      const projectName = project.Name ?? 'unknown'
      return {
        id: `aws-databrew-${projectName}`,
        label: `DataBrew: ${projectName}`,
        type: 'databrew',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          name: projectName,
          recipeName: str(project.RecipeName),
          datasetName: str(project.DatasetName),
          accountId: str(project.AccountId),
          createDate: project.CreateDate?.toISOString?.() ?? str(project.CreateDate),
          lastModifiedDate: project.LastModifiedDate?.toISOString?.() ?? str(project.LastModifiedDate),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // MWAA — Managed Workflows for Apache Airflow
  // -----------------------------------------------------------------------
  {
    type: 'mwaa',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-mwaa',
    clientClass: 'MWAAClient',
    listCommand: 'ListEnvironmentsCommand',
    listResponsePath: 'Environments',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (envName: string, region: string) => {
      return {
        id: `aws-mwaa-${envName}`,
        label: `MWAA: ${envName}`,
        type: 'mwaa',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          environmentName: envName,
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // DataZone — Domains
  // -----------------------------------------------------------------------
  {
    type: 'datazone',
    category: 'analytics',
    sdkPackage: '@aws-sdk/client-datazone',
    clientClass: 'DataZoneClient',
    listCommand: 'ListDomainsCommand',
    listResponsePath: 'items',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (domain: any, region: string) => {
      const domainName = domain.name ?? 'unknown'
      const domainId = domain.id ?? 'unknown'
      const status = domain.status ?? ''
      return {
        id: `aws-datazone-${domainId}`,
        label: `DataZone: ${domainName}`,
        type: 'datazone',
        category: 'analytics' as NodeCategory,
        region,
        metadata: {
          name: domainName,
          domainId,
          arn: str(domain.arn),
          status,
          description: str(domain.description),
          managedAccountId: str(domain.managedAccountId),
          createdAt: domain.createdAt?.toISOString?.() ?? str(domain.createdAt),
        },
        status: status === 'AVAILABLE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  //  SECURITY
  // =======================================================================

  // -----------------------------------------------------------------------
  // IAM — Roles (global service, skip service-linked roles)
  // -----------------------------------------------------------------------
  {
    type: 'iam-role',
    category: 'security',
    sdkPackage: '@aws-sdk/client-iam',
    clientClass: 'IAMClient',
    listCommand: 'ListRolesCommand',
    listResponsePath: 'Roles',
    paginationToken: 'Marker',
    paginationInputToken: 'Marker',
    importance: 5,
    mapResource: (role: any, _region: string) => {
      const roleName = role.RoleName ?? 'unknown'
      const rolePath = role.Path ?? '/'
      // Skip AWS service-linked roles (path starts with /aws-service-role/)
      if (rolePath.startsWith('/aws-service-role/')) {
        return null
      }
      return {
        id: `aws-iam-role-${roleName}`,
        label: `IAM: ${roleName}`,
        type: 'iam-role',
        category: 'security' as NodeCategory,
        region: 'global',
        metadata: {
          roleName,
          arn: str(role.Arn),
          path: rolePath,
          createDate: role.CreateDate?.toISOString?.() ?? str(role.CreateDate),
          maxSessionDuration: str(role.MaxSessionDuration),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Secrets Manager — Secrets
  // -----------------------------------------------------------------------
  {
    type: 'secretsmanager',
    category: 'security',
    sdkPackage: '@aws-sdk/client-secrets-manager',
    clientClass: 'SecretsManagerClient',
    listCommand: 'ListSecretsCommand',
    listResponsePath: 'SecretList',
    paginationToken: 'NextToken',
    importance: 7,
    mapResource: (secret: any, region: string) => {
      const secretName = secret.Name ?? 'unknown'
      return {
        id: `aws-secret-${secretName}`,
        label: `Secret: ${secretName}`,
        type: 'secretsmanager',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          secretName,
          arn: str(secret.ARN),
          lastAccessedDate: secret.LastAccessedDate?.toISOString?.() ?? str(secret.LastAccessedDate),
          lastChangedDate: secret.LastChangedDate?.toISOString?.() ?? str(secret.LastChangedDate),
          rotationEnabled: str(secret.RotationEnabled ?? false),
          description: str(secret.Description),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // KMS — Customer-managed keys
  // -----------------------------------------------------------------------
  {
    type: 'kms',
    category: 'security',
    sdkPackage: '@aws-sdk/client-kms',
    clientClass: 'KMSClient',
    listCommand: 'ListKeysCommand',
    listResponsePath: 'Keys',
    paginationToken: 'NextMarker',
    paginationInputToken: 'Marker',
    importance: 6,
    mapResource: (key: any, region: string) => {
      const keyId = key.KeyId ?? 'unknown'
      return {
        id: `aws-kms-${keyId}`,
        label: `KMS: ${keyId.substring(0, 8)}...`,
        type: 'kms',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          keyId,
          arn: str(key.KeyArn),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // WAFv2 — Web ACLs
  // -----------------------------------------------------------------------
  {
    type: 'waf',
    category: 'security',
    sdkPackage: '@aws-sdk/client-wafv2',
    clientClass: 'WAFV2Client',
    listCommand: 'ListWebACLsCommand',
    listResponsePath: 'WebACLs',
    paginationToken: 'NextMarker',
    importance: 7,
    mapResource: (acl: any, region: string) => {
      const aclName = acl.Name ?? 'unknown'
      const aclId = acl.Id ?? 'unknown'
      return {
        id: `aws-waf-${aclId}`,
        label: `WAF: ${aclName}`,
        type: 'waf',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          name: aclName,
          id: aclId,
          arn: str(acl.ARN),
          description: str(acl.Description),
          lockToken: str(acl.LockToken),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Shield Advanced — Protections
  // -----------------------------------------------------------------------
  {
    type: 'shield',
    category: 'security',
    sdkPackage: '@aws-sdk/client-shield',
    clientClass: 'ShieldClient',
    listCommand: 'ListProtectionsCommand',
    listResponsePath: 'Protections',
    paginationToken: 'NextToken',
    importance: 7,
    mapResource: (protection: any, _region: string) => {
      const protectionName = protection.Name ?? 'unknown'
      const protectionId = protection.Id ?? 'unknown'
      return {
        id: `aws-shield-${protectionId}`,
        label: `Shield: ${protectionName}`,
        type: 'shield',
        category: 'security' as NodeCategory,
        region: 'global',
        metadata: {
          name: protectionName,
          protectionId,
          protectionArn: str(protection.ProtectionArn),
          resourceArn: str(protection.ResourceArn),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // GuardDuty — Detectors
  // -----------------------------------------------------------------------
  {
    type: 'guardduty',
    category: 'security',
    sdkPackage: '@aws-sdk/client-guardduty',
    clientClass: 'GuardDutyClient',
    listCommand: 'ListDetectorsCommand',
    listResponsePath: 'DetectorIds',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (detectorId: string, region: string) => {
      return {
        id: `aws-guardduty-${detectorId}`,
        label: `GuardDuty: ${detectorId.substring(0, 12)}...`,
        type: 'guardduty',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          detectorId,
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Inspector v2 — Findings (presence check)
  // -----------------------------------------------------------------------
  {
    type: 'inspector',
    category: 'security',
    sdkPackage: '@aws-sdk/client-inspector2',
    clientClass: 'Inspector2Client',
    listCommand: 'ListFindingsCommand',
    listResponsePath: 'findings',
    paginationToken: 'nextToken',
    importance: 6,
    mapResource: (finding: any, region: string) => {
      const findingArn = finding.findingArn ?? 'unknown'
      const severity = finding.severity ?? ''
      const title = finding.title ?? 'unknown'
      const shortArn = findingArn.split('/').pop() ?? findingArn
      return {
        id: `aws-inspector-${shortArn.substring(0, 32)}`,
        label: `Inspector: ${title.substring(0, 40)}`,
        type: 'inspector',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          findingArn,
          severity,
          title,
          status: str(finding.status),
          type: str(finding.type),
        },
        status: severity === 'CRITICAL' || severity === 'HIGH' ? 'error' as HealthStatus
          : severity === 'MEDIUM' ? 'warning' as HealthStatus
          : 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Macie — Classification Jobs
  // -----------------------------------------------------------------------
  {
    type: 'macie',
    category: 'security',
    sdkPackage: '@aws-sdk/client-macie2',
    clientClass: 'Macie2Client',
    listCommand: 'ListClassificationJobsCommand',
    listResponsePath: 'items',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (job: any, region: string) => {
      const jobName = job.name ?? 'unknown'
      const jobId = job.jobId ?? 'unknown'
      const jobStatus = job.jobStatus ?? ''
      return {
        id: `aws-macie-${jobId}`,
        label: `Macie: ${jobName}`,
        type: 'macie',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          name: jobName,
          jobId,
          jobStatus,
          jobType: str(job.jobType),
          createdAt: job.createdAt?.toISOString?.() ?? str(job.createdAt),
        },
        status: jobStatus === 'RUNNING' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Security Hub
  // -----------------------------------------------------------------------
  {
    type: 'securityhub',
    category: 'security',
    sdkPackage: '@aws-sdk/client-securityhub',
    clientClass: 'SecurityHubClient',
    listCommand: 'DescribeHubCommand',
    listResponsePath: '_single',
    paginationToken: null,
    importance: 7,
    mapResource: (hub: any, region: string) => {
      const hubArn = hub.HubArn ?? 'unknown'
      return {
        id: `aws-securityhub-${region}`,
        label: `SecurityHub: ${region}`,
        type: 'securityhub',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          hubArn,
          subscribedAt: str(hub.SubscribedAt),
          autoEnableControls: str(hub.AutoEnableControls),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // ACM — Certificate Manager
  // -----------------------------------------------------------------------
  {
    type: 'acm',
    category: 'security',
    sdkPackage: '@aws-sdk/client-acm',
    clientClass: 'ACMClient',
    listCommand: 'ListCertificatesCommand',
    listResponsePath: 'CertificateSummaryList',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (cert: any, region: string) => {
      const domainName = cert.DomainName ?? 'unknown'
      const certArn = cert.CertificateArn ?? ''
      const status = cert.Status ?? ''
      return {
        id: `aws-acm-${domainName.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
        label: `ACM: ${domainName}`,
        type: 'acm',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          domainName,
          certificateArn: certArn,
          status,
          type: str(cert.Type),
          keyAlgorithm: str(cert.KeyAlgorithm),
          inUse: str(cert.InUse),
          renewalEligibility: str(cert.RenewalEligibility),
          notBefore: str(cert.NotBefore),
          notAfter: str(cert.NotAfter),
        },
        status: status === 'ISSUED' ? 'healthy' as HealthStatus
          : status === 'EXPIRED' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cognito — User Pools
  // -----------------------------------------------------------------------
  {
    type: 'cognito',
    category: 'security',
    sdkPackage: '@aws-sdk/client-cognito-identity-provider',
    clientClass: 'CognitoIdentityProviderClient',
    listCommand: 'ListUserPoolsCommand',
    listResponsePath: 'UserPools',
    paginationToken: 'NextToken',
    importance: 7,
    mapResource: (pool: any, region: string) => {
      const poolName = pool.Name ?? 'unknown'
      const poolId = pool.Id ?? 'unknown'
      const status = pool.Status ?? ''
      return {
        id: `aws-cognito-${poolId}`,
        label: `Cognito: ${poolName}`,
        type: 'cognito',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          name: poolName,
          userPoolId: poolId,
          status,
          creationDate: pool.CreationDate?.toISOString?.() ?? str(pool.CreationDate),
          lastModifiedDate: pool.LastModifiedDate?.toISOString?.() ?? str(pool.LastModifiedDate),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SSO — IAM Identity Center Instances
  // -----------------------------------------------------------------------
  {
    type: 'sso',
    category: 'security',
    sdkPackage: '@aws-sdk/client-sso-admin',
    clientClass: 'SSOAdminClient',
    listCommand: 'ListInstancesCommand',
    listResponsePath: 'Instances',
    paginationToken: 'NextToken',
    importance: 7,
    mapResource: (instance: any, _region: string) => {
      const instanceArn = instance.InstanceArn ?? 'unknown'
      const identityStoreId = instance.IdentityStoreId ?? ''
      return {
        id: `aws-sso-${identityStoreId}`,
        label: `SSO: ${identityStoreId}`,
        type: 'sso',
        category: 'security' as NodeCategory,
        region: 'global',
        metadata: {
          instanceArn,
          identityStoreId,
          ownerAccountId: str(instance.OwnerAccountId),
          status: str(instance.Status),
          name: str(instance.Name),
          createdDate: instance.CreatedDate?.toISOString?.() ?? str(instance.CreatedDate),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Amazon Detective — Graphs
  // -----------------------------------------------------------------------
  {
    type: 'detective',
    category: 'security',
    sdkPackage: '@aws-sdk/client-detective',
    clientClass: 'DetectiveClient',
    listCommand: 'ListGraphsCommand',
    listResponsePath: 'GraphList',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (graph: any, region: string) => {
      const graphArn = graph.Arn ?? 'unknown'
      const shortArn = graphArn.split('/').pop() ?? graphArn
      return {
        id: `aws-detective-${shortArn}`,
        label: `Detective: ${shortArn.substring(0, 12)}...`,
        type: 'detective',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          graphArn,
          createdTime: graph.CreatedTime?.toISOString?.() ?? str(graph.CreatedTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Firewall Manager — Policies
  // -----------------------------------------------------------------------
  {
    type: 'firewallmanager',
    category: 'security',
    sdkPackage: '@aws-sdk/client-fms',
    clientClass: 'FMSClient',
    listCommand: 'ListPoliciesCommand',
    listResponsePath: 'PolicyList',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (policy: any, _region: string) => {
      const policyName = policy.PolicyName ?? 'unknown'
      const policyId = policy.PolicyId ?? 'unknown'
      return {
        id: `aws-fms-${policyId}`,
        label: `FMS: ${policyName}`,
        type: 'firewallmanager',
        category: 'security' as NodeCategory,
        region: 'global',
        metadata: {
          policyName,
          policyId,
          arn: str(policy.PolicyArn),
          resourceType: str(policy.ResourceType),
          securityServiceType: str(policy.SecurityServiceType),
          remediationEnabled: str(policy.RemediationEnabled),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CloudTrail — Trails
  // -----------------------------------------------------------------------
  {
    type: 'cloudtrail',
    category: 'security',
    sdkPackage: '@aws-sdk/client-cloudtrail',
    clientClass: 'CloudTrailClient',
    listCommand: 'DescribeTrailsCommand',
    listResponsePath: 'trailList',
    paginationToken: null,
    importance: 7,
    mapResource: (trail: any, region: string) => {
      const trailName = trail.Name ?? 'unknown'
      const isMultiRegion = trail.IsMultiRegionTrail ?? false
      return {
        id: `aws-cloudtrail-${trailName}`,
        label: `Trail: ${trailName}`,
        type: 'cloudtrail',
        category: 'security' as NodeCategory,
        region: isMultiRegion ? 'global' : region,
        metadata: {
          name: trailName,
          trailArn: str(trail.TrailARN),
          s3BucketName: str(trail.S3BucketName),
          s3KeyPrefix: str(trail.S3KeyPrefix),
          isMultiRegionTrail: str(isMultiRegion),
          isOrganizationTrail: str(trail.IsOrganizationTrail),
          logFileValidationEnabled: str(trail.LogFileValidationEnabled),
          includeGlobalServiceEvents: str(trail.IncludeGlobalServiceEvents),
          homeRegion: str(trail.HomeRegion),
          hasCustomEventSelectors: str(trail.HasCustomEventSelectors),
          hasInsightSelectors: str(trail.HasInsightSelectors),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // AWS Config — Config Rules
  // -----------------------------------------------------------------------
  {
    type: 'config',
    category: 'security',
    sdkPackage: '@aws-sdk/client-config-service',
    clientClass: 'ConfigServiceClient',
    listCommand: 'DescribeConfigRulesCommand',
    listResponsePath: 'ConfigRules',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (rule: any, region: string) => {
      const ruleName = rule.ConfigRuleName ?? 'unknown'
      const state = rule.ConfigRuleState ?? ''
      return {
        id: `aws-config-${ruleName}`,
        label: `Config: ${ruleName}`,
        type: 'config',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          configRuleName: ruleName,
          configRuleArn: str(rule.ConfigRuleArn),
          configRuleId: str(rule.ConfigRuleId),
          state,
          description: str(rule.Description),
          source: str(rule.Source?.Owner),
          sourceIdentifier: str(rule.Source?.SourceIdentifier),
        },
        status: state === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IAM Access Analyzer — Analyzers
  // -----------------------------------------------------------------------
  {
    type: 'accessanalyzer',
    category: 'security',
    sdkPackage: '@aws-sdk/client-accessanalyzer',
    clientClass: 'AccessAnalyzerClient',
    listCommand: 'ListAnalyzersCommand',
    listResponsePath: 'analyzers',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (analyzer: any, region: string) => {
      const analyzerName = analyzer.name ?? 'unknown'
      const status = analyzer.status ?? ''
      const analyzerType = analyzer.type ?? ''
      return {
        id: `aws-accessanalyzer-${analyzerName}`,
        label: `Analyzer: ${analyzerName}`,
        type: 'accessanalyzer',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          name: analyzerName,
          arn: str(analyzer.arn),
          type: analyzerType,
          status,
          createdAt: analyzer.createdAt?.toISOString?.() ?? str(analyzer.createdAt),
          lastResourceAnalyzed: str(analyzer.lastResourceAnalyzed),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Directory Service — Directories
  // -----------------------------------------------------------------------
  {
    type: 'directory-service',
    category: 'security',
    sdkPackage: '@aws-sdk/client-directory-service',
    clientClass: 'DirectoryServiceClient',
    listCommand: 'DescribeDirectoriesCommand',
    listResponsePath: 'DirectoryDescriptions',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (dir: any, region: string) => {
      const dirName = dir.Name ?? 'unknown'
      const dirId = dir.DirectoryId ?? 'unknown'
      const stage = dir.Stage ?? ''
      return {
        id: `aws-ds-${dirId}`,
        label: `DS: ${dirName}`,
        type: 'directory-service',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          name: dirName,
          directoryId: dirId,
          type: str(dir.Type),
          edition: str(dir.Edition),
          size: str(dir.Size),
          stage,
          shortName: str(dir.ShortName),
          dnsIpAddrs: (dir.DnsIpAddrs ?? []).join(', '),
          vpcId: str(dir.VpcSettings?.VpcId),
        },
        status: stage === 'Active' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // RAM — Resource Access Manager
  // -----------------------------------------------------------------------
  {
    type: 'ram',
    category: 'security',
    sdkPackage: '@aws-sdk/client-ram',
    clientClass: 'RAMClient',
    listCommand: 'GetResourceSharesCommand',
    listResponsePath: 'resourceShares',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (share: any, region: string) => {
      const shareName = share.name ?? 'unknown'
      const shareArn = share.resourceShareArn ?? ''
      const status = share.status ?? ''
      return {
        id: `aws-ram-${shareName.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
        label: `RAM: ${shareName}`,
        type: 'ram',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          name: shareName,
          resourceShareArn: shareArn,
          status,
          owningAccountId: str(share.owningAccountId),
          allowExternalPrincipals: str(share.allowExternalPrincipals),
          creationTime: share.creationTime?.toISOString?.() ?? str(share.creationTime),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Audit Manager — Assessments
  // -----------------------------------------------------------------------
  {
    type: 'audit-manager',
    category: 'security',
    sdkPackage: '@aws-sdk/client-auditmanager',
    clientClass: 'AuditManagerClient',
    listCommand: 'ListAssessmentsCommand',
    listResponsePath: 'assessmentMetadata',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (assessment: any, region: string) => {
      const assessmentName = assessment.name ?? 'unknown'
      const assessmentId = assessment.id ?? 'unknown'
      const status = assessment.status ?? ''
      return {
        id: `aws-auditmanager-${assessmentId}`,
        label: `Audit: ${assessmentName}`,
        type: 'audit-manager',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          name: assessmentName,
          assessmentId,
          status,
          creationTime: assessment.creationTime?.toISOString?.() ?? str(assessment.creationTime),
          complianceType: str(assessment.complianceType),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Verified Permissions — Policy Stores
  // -----------------------------------------------------------------------
  {
    type: 'verified-permissions',
    category: 'security',
    sdkPackage: '@aws-sdk/client-verifiedpermissions',
    clientClass: 'VerifiedPermissionsClient',
    listCommand: 'ListPolicyStoresCommand',
    listResponsePath: 'policyStores',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (store: any, region: string) => {
      const policyStoreId = store.policyStoreId ?? 'unknown'
      return {
        id: `aws-avp-${policyStoreId}`,
        label: `AVP: ${policyStoreId}`,
        type: 'verified-permissions',
        category: 'security' as NodeCategory,
        region,
        metadata: {
          policyStoreId,
          arn: str(store.arn),
          createdDate: store.createdDate?.toISOString?.() ?? str(store.createdDate),
          lastUpdatedDate: store.lastUpdatedDate?.toISOString?.() ?? str(store.lastUpdatedDate),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  //  CONTAINER
  // =======================================================================

  // -----------------------------------------------------------------------
  // ECR — Elastic Container Registry repositories
  // -----------------------------------------------------------------------
  {
    type: 'ecr',
    category: 'container',
    sdkPackage: '@aws-sdk/client-ecr',
    clientClass: 'ECRClient',
    listCommand: 'DescribeRepositoriesCommand',
    listResponsePath: 'repositories',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (repo: any, region: string) => {
      const repoName = repo.repositoryName ?? 'unknown'
      return {
        id: `aws-ecr-${repoName}`,
        label: `ECR: ${repoName}`,
        type: 'ecr',
        category: 'container' as NodeCategory,
        region,
        metadata: {
          repositoryName: repoName,
          repositoryUri: str(repo.repositoryUri),
          arn: str(repo.repositoryArn),
          createdAt: repo.createdAt?.toISOString?.() ?? str(repo.createdAt),
          imageTagMutability: str(repo.imageTagMutability),
          scanOnPush: str(repo.imageScanningConfiguration?.scanOnPush ?? false),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // EKS — Elastic Kubernetes Service Clusters
  // -----------------------------------------------------------------------
  {
    type: 'eks',
    category: 'container',
    sdkPackage: '@aws-sdk/client-eks',
    clientClass: 'EKSClient',
    listCommand: 'ListClustersCommand',
    listResponsePath: 'clusters',
    paginationToken: 'nextToken',
    importance: 9,
    mapResource: (clusterName: string, region: string) => {
      return {
        id: `aws-eks-${clusterName}`,
        label: `EKS: ${clusterName}`,
        type: 'eks',
        category: 'container' as NodeCategory,
        region,
        metadata: {
          clusterName,
        },
        status: 'healthy' as HealthStatus,
        importance: 9,
      }
    },
  },

  // =======================================================================
  //  ML — Machine Learning
  // =======================================================================

  // -----------------------------------------------------------------------
  // SageMaker — Endpoints
  // -----------------------------------------------------------------------
  {
    type: 'sagemaker',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-sagemaker',
    clientClass: 'SageMakerClient',
    listCommand: 'ListEndpointsCommand',
    listResponsePath: 'Endpoints',
    paginationToken: 'NextToken',
    importance: 8,
    mapResource: (endpoint: any, region: string) => {
      const endpointName = endpoint.EndpointName ?? 'unknown'
      const status = endpoint.EndpointStatus ?? ''
      return {
        id: `aws-sagemaker-${endpointName}`,
        label: `SM: ${endpointName}`,
        type: 'sagemaker',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          endpointName,
          endpointArn: str(endpoint.EndpointArn),
          endpointStatus: status,
          creationTime: endpoint.CreationTime?.toISOString?.() ?? str(endpoint.CreationTime),
          lastModifiedTime: endpoint.LastModifiedTime?.toISOString?.() ?? str(endpoint.LastModifiedTime),
        },
        status: status === 'InService' ? 'healthy' as HealthStatus
          : status === 'Failed' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SageMaker — Notebook Instances
  // -----------------------------------------------------------------------
  {
    type: 'sagemaker-notebook',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-sagemaker',
    clientClass: 'SageMakerClient',
    listCommand: 'ListNotebookInstancesCommand',
    listResponsePath: 'NotebookInstances',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (nb: any, region: string) => {
      const nbName = nb.NotebookInstanceName ?? 'unknown'
      const status = nb.NotebookInstanceStatus ?? ''
      return {
        id: `aws-sagemaker-nb-${nbName}`,
        label: `SM-NB: ${nbName}`,
        type: 'sagemaker-notebook',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          notebookInstanceName: nbName,
          notebookInstanceArn: str(nb.NotebookInstanceArn),
          notebookInstanceStatus: status,
          instanceType: str(nb.InstanceType),
          creationTime: nb.CreationTime?.toISOString?.() ?? str(nb.CreationTime),
          lastModifiedTime: nb.LastModifiedTime?.toISOString?.() ?? str(nb.LastModifiedTime),
          url: str(nb.Url),
        },
        status: status === 'InService' ? 'healthy' as HealthStatus
          : status === 'Stopped' ? 'warning' as HealthStatus
          : status === 'Failed' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Bedrock — Custom Models
  // -----------------------------------------------------------------------
  {
    type: 'bedrock',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-bedrock',
    clientClass: 'BedrockClient',
    listCommand: 'ListCustomModelsCommand',
    listResponsePath: 'modelSummaries',
    paginationToken: 'nextToken',
    importance: 7,
    mapResource: (model: any, region: string) => {
      const modelName = model.modelName ?? 'unknown'
      const modelArn = model.modelArn ?? ''
      return {
        id: `aws-bedrock-${modelName}`,
        label: `Bedrock: ${modelName}`,
        type: 'bedrock',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          modelName,
          modelArn,
          baseModelIdentifier: str(model.baseModelIdentifier),
          creationTime: model.creationTime?.toISOString?.() ?? str(model.creationTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 7,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Bedrock — Agents
  // -----------------------------------------------------------------------
  {
    type: 'bedrock-agent',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-bedrock-agent',
    clientClass: 'BedrockAgentClient',
    listCommand: 'ListAgentsCommand',
    listResponsePath: 'agentSummaries',
    paginationToken: 'nextToken',
    importance: 6,
    mapResource: (agent: any, region: string) => {
      const agentName = agent.agentName ?? 'unknown'
      const agentId = agent.agentId ?? 'unknown'
      const agentStatus = agent.agentStatus ?? ''
      return {
        id: `aws-bedrock-agent-${agentId}`,
        label: `BR-Agent: ${agentName}`,
        type: 'bedrock-agent',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          agentName,
          agentId,
          agentStatus,
          description: str(agent.description),
          updatedAt: agent.updatedAt?.toISOString?.() ?? str(agent.updatedAt),
        },
        status: agentStatus === 'PREPARED' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Comprehend — Endpoints
  // -----------------------------------------------------------------------
  {
    type: 'comprehend',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-comprehend',
    clientClass: 'ComprehendClient',
    listCommand: 'ListEndpointsCommand',
    listResponsePath: 'EndpointPropertiesList',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (endpoint: any, region: string) => {
      const endpointArn = endpoint.EndpointArn ?? 'unknown'
      const shortName = endpointArn.split('/').pop() ?? 'unknown'
      const status = endpoint.Status ?? ''
      return {
        id: `aws-comprehend-${shortName}`,
        label: `Comprehend: ${shortName}`,
        type: 'comprehend',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          endpointArn,
          status,
          modelArn: str(endpoint.ModelArn),
          desiredModelArn: str(endpoint.DesiredModelArn),
          desiredInferenceUnits: str(endpoint.DesiredInferenceUnits),
          currentInferenceUnits: str(endpoint.CurrentInferenceUnits),
          creationTime: endpoint.CreationTime?.toISOString?.() ?? str(endpoint.CreationTime),
        },
        status: status === 'IN_SERVICE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Rekognition — Projects
  // -----------------------------------------------------------------------
  {
    type: 'rekognition',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-rekognition',
    clientClass: 'RekognitionClient',
    listCommand: 'DescribeProjectsCommand',
    listResponsePath: 'ProjectDescriptions',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (project: any, region: string) => {
      const projectArn = project.ProjectArn ?? 'unknown'
      const projectName = projectArn.split('/').pop() ?? 'unknown'
      const status = project.Status ?? ''
      return {
        id: `aws-rekognition-${projectName}`,
        label: `Rekog: ${projectName}`,
        type: 'rekognition',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          projectArn,
          projectName,
          status,
          creationTimestamp: project.CreationTimestamp?.toISOString?.() ?? str(project.CreationTimestamp),
        },
        status: status === 'CREATED' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Polly — Lexicons
  // -----------------------------------------------------------------------
  {
    type: 'polly',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-polly',
    clientClass: 'PollyClient',
    listCommand: 'ListLexiconsCommand',
    listResponsePath: 'Lexicons',
    paginationToken: 'NextToken',
    importance: 3,
    mapResource: (lexicon: any, region: string) => {
      const lexiconName = lexicon.Name ?? 'unknown'
      return {
        id: `aws-polly-${lexiconName}`,
        label: `Polly: ${lexiconName}`,
        type: 'polly',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          name: lexiconName,
          languageCode: str(lexicon.Attributes?.LanguageCode),
          alphabet: str(lexicon.Attributes?.Alphabet),
          lexemesCount: str(lexicon.Attributes?.LexemesCount),
          size: str(lexicon.Attributes?.Size),
          lastModified: lexicon.Attributes?.LastModified?.toISOString?.() ?? str(lexicon.Attributes?.LastModified),
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Transcribe — Transcription Jobs
  // -----------------------------------------------------------------------
  {
    type: 'transcribe',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-transcribe',
    clientClass: 'TranscribeClient',
    listCommand: 'ListTranscriptionJobsCommand',
    listResponsePath: 'TranscriptionJobSummaries',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (job: any, region: string) => {
      const jobName = job.TranscriptionJobName ?? 'unknown'
      const status = job.TranscriptionJobStatus ?? ''
      return {
        id: `aws-transcribe-${jobName}`,
        label: `Transcribe: ${jobName}`,
        type: 'transcribe',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          transcriptionJobName: jobName,
          transcriptionJobStatus: status,
          languageCode: str(job.LanguageCode),
          creationTime: job.CreationTime?.toISOString?.() ?? str(job.CreationTime),
          completionTime: job.CompletionTime?.toISOString?.() ?? str(job.CompletionTime),
          outputLocationType: str(job.OutputLocationType),
        },
        status: status === 'COMPLETED' ? 'healthy' as HealthStatus
          : status === 'FAILED' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Translate — Terminologies
  // -----------------------------------------------------------------------
  {
    type: 'translate',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-translate',
    clientClass: 'TranslateClient',
    listCommand: 'ListTerminologiesCommand',
    listResponsePath: 'TerminologyPropertiesList',
    paginationToken: 'NextToken',
    importance: 3,
    mapResource: (term: any, region: string) => {
      const termName = term.Name ?? 'unknown'
      return {
        id: `aws-translate-${termName}`,
        label: `Translate: ${termName}`,
        type: 'translate',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          name: termName,
          arn: str(term.Arn),
          description: str(term.Description),
          sourceLanguageCode: str(term.SourceLanguageCode),
          targetLanguageCodes: (term.TargetLanguageCodes ?? []).join(', '),
          sizeBytes: str(term.SizeBytes),
          termCount: str(term.TermCount),
          createdAt: term.CreatedAt?.toISOString?.() ?? str(term.CreatedAt),
          lastUpdatedAt: term.LastUpdatedAt?.toISOString?.() ?? str(term.LastUpdatedAt),
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Lex v2 — Bots
  // -----------------------------------------------------------------------
  {
    type: 'lex',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-lex-models-v2',
    clientClass: 'LexModelsV2Client',
    listCommand: 'ListBotsCommand',
    listResponsePath: 'botSummaries',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (bot: any, region: string) => {
      const botName = bot.botName ?? 'unknown'
      const botId = bot.botId ?? 'unknown'
      const botStatus = bot.botStatus ?? ''
      return {
        id: `aws-lex-${botId}`,
        label: `Lex: ${botName}`,
        type: 'lex',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          botName,
          botId,
          botStatus,
          description: str(bot.description),
          latestBotVersion: str(bot.latestBotVersion),
          lastUpdatedDateTime: bot.lastUpdatedDateTime?.toISOString?.() ?? str(bot.lastUpdatedDateTime),
        },
        status: botStatus === 'Available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Personalize — Datasets
  // -----------------------------------------------------------------------
  {
    type: 'personalize',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-personalize',
    clientClass: 'PersonalizeClient',
    listCommand: 'ListDatasetsCommand',
    listResponsePath: 'datasets',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (dataset: any, region: string) => {
      const datasetName = dataset.name ?? 'unknown'
      const datasetArn = dataset.datasetArn ?? ''
      const status = dataset.status ?? ''
      return {
        id: `aws-personalize-${datasetName}`,
        label: `Personalize: ${datasetName}`,
        type: 'personalize',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          name: datasetName,
          datasetArn,
          datasetType: str(dataset.datasetType),
          status,
          creationDateTime: dataset.creationDateTime?.toISOString?.() ?? str(dataset.creationDateTime),
          lastUpdatedDateTime: dataset.lastUpdatedDateTime?.toISOString?.() ?? str(dataset.lastUpdatedDateTime),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Forecast — Datasets
  // -----------------------------------------------------------------------
  {
    type: 'forecast',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-forecast',
    clientClass: 'ForecastClient',
    listCommand: 'ListDatasetsCommand',
    listResponsePath: 'Datasets',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (dataset: any, region: string) => {
      const datasetName = dataset.DatasetName ?? 'unknown'
      const datasetArn = dataset.DatasetArn ?? ''
      return {
        id: `aws-forecast-${datasetName}`,
        label: `Forecast: ${datasetName}`,
        type: 'forecast',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          datasetName,
          datasetArn,
          datasetType: str(dataset.DatasetType),
          domain: str(dataset.Domain),
          creationTime: dataset.CreationTime?.toISOString?.() ?? str(dataset.CreationTime),
          lastModificationTime: dataset.LastModificationTime?.toISOString?.() ?? str(dataset.LastModificationTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Kendra — Indexes
  // -----------------------------------------------------------------------
  {
    type: 'kendra',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-kendra',
    clientClass: 'KendraClient',
    listCommand: 'ListIndicesCommand',
    listResponsePath: 'IndexConfigurationSummaryItems',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (index: any, region: string) => {
      const indexName = index.Name ?? 'unknown'
      const indexId = index.Id ?? 'unknown'
      const status = index.Status ?? ''
      return {
        id: `aws-kendra-${indexId}`,
        label: `Kendra: ${indexName}`,
        type: 'kendra',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          name: indexName,
          indexId,
          status,
          edition: str(index.Edition),
          createdAt: index.CreatedAt?.toISOString?.() ?? str(index.CreatedAt),
          updatedAt: index.UpdatedAt?.toISOString?.() ?? str(index.UpdatedAt),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // HealthLake — FHIR Datastores
  // -----------------------------------------------------------------------
  {
    type: 'healthlake',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-healthlake',
    clientClass: 'HealthLakeClient',
    listCommand: 'ListFHIRDatastoresCommand',
    listResponsePath: 'DatastorePropertiesList',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (store: any, region: string) => {
      const datastoreName = store.DatastoreName ?? 'unknown'
      const datastoreId = store.DatastoreId ?? 'unknown'
      const status = store.DatastoreStatus ?? ''
      return {
        id: `aws-healthlake-${datastoreId}`,
        label: `HealthLake: ${datastoreName}`,
        type: 'healthlake',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          datastoreName,
          datastoreId,
          datastoreArn: str(store.DatastoreArn),
          datastoreStatus: status,
          datastoreTypeVersion: str(store.DatastoreTypeVersion),
          datastoreEndpoint: str(store.DatastoreEndpoint),
          createdAt: store.CreatedAt?.toISOString?.() ?? str(store.CreatedAt),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Lookout for Metrics — Anomaly Detectors
  // -----------------------------------------------------------------------
  {
    type: 'lookout-metrics',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-lookoutmetrics',
    clientClass: 'LookoutMetricsClient',
    listCommand: 'ListAnomalyDetectorsCommand',
    listResponsePath: 'AnomalyDetectorSummaryList',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (detector: any, region: string) => {
      const detectorName = detector.AnomalyDetectorName ?? 'unknown'
      const detectorArn = detector.AnomalyDetectorArn ?? ''
      const status = detector.Status ?? ''
      return {
        id: `aws-lookoutmetrics-${detectorName}`,
        label: `LookoutM: ${detectorName}`,
        type: 'lookout-metrics',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          anomalyDetectorName: detectorName,
          anomalyDetectorArn: detectorArn,
          status,
          description: str(detector.AnomalyDetectorDescription),
          creationTime: detector.CreationTime?.toISOString?.() ?? str(detector.CreationTime),
          lastModificationTime: detector.LastModificationTime?.toISOString?.() ?? str(detector.LastModificationTime),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Lookout for Vision — Projects
  // -----------------------------------------------------------------------
  {
    type: 'lookout-vision',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-lookoutvision',
    clientClass: 'LookoutVisionClient',
    listCommand: 'ListProjectsCommand',
    listResponsePath: 'Projects',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (project: any, region: string) => {
      const projectName = project.ProjectName ?? 'unknown'
      const projectArn = project.ProjectArn ?? ''
      return {
        id: `aws-lookoutvision-${projectName}`,
        label: `LookoutV: ${projectName}`,
        type: 'lookout-vision',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          projectName,
          projectArn,
          creationTimestamp: project.CreationTimestamp?.toISOString?.() ?? str(project.CreationTimestamp),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Lookout for Equipment — Models
  // -----------------------------------------------------------------------
  {
    type: 'lookout-equipment',
    category: 'ml',
    sdkPackage: '@aws-sdk/client-lookoutequipment',
    clientClass: 'LookoutEquipmentClient',
    listCommand: 'ListModelsCommand',
    listResponsePath: 'ModelSummaries',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (model: any, region: string) => {
      const modelName = model.ModelName ?? 'unknown'
      const modelArn = model.ModelArn ?? ''
      const status = model.Status ?? ''
      return {
        id: `aws-lookoutequipment-${modelName}`,
        label: `LookoutE: ${modelName}`,
        type: 'lookout-equipment',
        category: 'ml' as NodeCategory,
        region,
        metadata: {
          modelName,
          modelArn,
          datasetName: str(model.DatasetName),
          datasetArn: str(model.DatasetArn),
          status,
          createdAt: model.CreatedAt?.toISOString?.() ?? str(model.CreatedAt),
        },
        status: status === 'SUCCESS' ? 'healthy' as HealthStatus
          : status === 'FAILED' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // =======================================================================
  //  IOT — Internet of Things
  // =======================================================================

  // -----------------------------------------------------------------------
  // IoT Core — Things
  // -----------------------------------------------------------------------
  {
    type: 'iot-core',
    category: 'iot',
    sdkPackage: '@aws-sdk/client-iot',
    clientClass: 'IoTClient',
    listCommand: 'ListThingsCommand',
    listResponsePath: 'things',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (thing: any, region: string) => {
      const thingName = thing.thingName ?? 'unknown'
      return {
        id: `aws-iot-${thingName}`,
        label: `IoT: ${thingName}`,
        type: 'iot-core',
        category: 'iot' as NodeCategory,
        region,
        metadata: {
          thingName,
          thingArn: str(thing.thingArn),
          thingTypeName: str(thing.thingTypeName),
          version: str(thing.version),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IoT Analytics — Channels
  // -----------------------------------------------------------------------
  {
    type: 'iot-analytics',
    category: 'iot',
    sdkPackage: '@aws-sdk/client-iotanalytics',
    clientClass: 'IoTAnalyticsClient',
    listCommand: 'ListChannelsCommand',
    listResponsePath: 'channelSummaries',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (channel: any, region: string) => {
      const channelName = channel.channelName ?? 'unknown'
      const status = channel.status ?? ''
      return {
        id: `aws-iotanalytics-${channelName}`,
        label: `IoTAnalytics: ${channelName}`,
        type: 'iot-analytics',
        category: 'iot' as NodeCategory,
        region,
        metadata: {
          channelName,
          status,
          creationTime: channel.creationTime?.toISOString?.() ?? str(channel.creationTime),
          lastUpdateTime: channel.lastUpdateTime?.toISOString?.() ?? str(channel.lastUpdateTime),
          lastMessageArrivalTime: channel.lastMessageArrivalTime?.toISOString?.() ?? str(channel.lastMessageArrivalTime),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IoT Greengrass v2 — Core Devices
  // -----------------------------------------------------------------------
  {
    type: 'iot-greengrass',
    category: 'iot',
    sdkPackage: '@aws-sdk/client-greengrassv2',
    clientClass: 'GreengrassV2Client',
    listCommand: 'ListCoreDevicesCommand',
    listResponsePath: 'coreDevices',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (device: any, region: string) => {
      const thingName = device.coreDeviceThingName ?? 'unknown'
      const status = device.status ?? ''
      return {
        id: `aws-greengrass-${thingName}`,
        label: `GG: ${thingName}`,
        type: 'iot-greengrass',
        category: 'iot' as NodeCategory,
        region,
        metadata: {
          coreDeviceThingName: thingName,
          status,
          lastStatusUpdateTimestamp: device.lastStatusUpdateTimestamp?.toISOString?.() ?? str(device.lastStatusUpdateTimestamp),
        },
        status: status === 'HEALTHY' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IoT Events — Detector Models
  // -----------------------------------------------------------------------
  {
    type: 'iot-events',
    category: 'iot',
    sdkPackage: '@aws-sdk/client-iot-events',
    clientClass: 'IoTEventsClient',
    listCommand: 'ListDetectorModelsCommand',
    listResponsePath: 'detectorModelSummaries',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (model: any, region: string) => {
      const modelName = model.detectorModelName ?? 'unknown'
      return {
        id: `aws-iotevents-${modelName}`,
        label: `IoTEvents: ${modelName}`,
        type: 'iot-events',
        category: 'iot' as NodeCategory,
        region,
        metadata: {
          detectorModelName: modelName,
          detectorModelDescription: str(model.detectorModelDescription),
          creationTime: model.creationTime?.toISOString?.() ?? str(model.creationTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IoT SiteWise — Portals
  // -----------------------------------------------------------------------
  {
    type: 'iot-sitewise',
    category: 'iot',
    sdkPackage: '@aws-sdk/client-iotsitewise',
    clientClass: 'IoTSiteWiseClient',
    listCommand: 'ListPortalsCommand',
    listResponsePath: 'portalSummaries',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (portal: any, region: string) => {
      const portalName = portal.name ?? 'unknown'
      const portalId = portal.id ?? 'unknown'
      const status = portal.status?.state ?? ''
      return {
        id: `aws-iotsitewise-${portalId}`,
        label: `SiteWise: ${portalName}`,
        type: 'iot-sitewise',
        category: 'iot' as NodeCategory,
        region,
        metadata: {
          name: portalName,
          portalId,
          status,
          startUrl: str(portal.startUrl),
          creationDate: portal.creationDate?.toISOString?.() ?? str(portal.creationDate),
          lastUpdateDate: portal.lastUpdateDate?.toISOString?.() ?? str(portal.lastUpdateDate),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IoT TwinMaker — Workspaces
  // -----------------------------------------------------------------------
  {
    type: 'iot-twinmaker',
    category: 'iot',
    sdkPackage: '@aws-sdk/client-iottwinmaker',
    clientClass: 'IoTTwinMakerClient',
    listCommand: 'ListWorkspacesCommand',
    listResponsePath: 'workspaceSummaries',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (ws: any, region: string) => {
      const workspaceId = ws.workspaceId ?? 'unknown'
      const arn = ws.arn ?? ''
      return {
        id: `aws-twinmaker-${workspaceId}`,
        label: `TwinMaker: ${workspaceId}`,
        type: 'iot-twinmaker',
        category: 'iot' as NodeCategory,
        region,
        metadata: {
          workspaceId,
          arn,
          description: str(ws.description),
          creationDateTime: ws.creationDateTime?.toISOString?.() ?? str(ws.creationDateTime),
          updateDateTime: ws.updateDateTime?.toISOString?.() ?? str(ws.updateDateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IoT FleetWise — Fleets
  // -----------------------------------------------------------------------
  {
    type: 'iot-fleetwise',
    category: 'iot',
    sdkPackage: '@aws-sdk/client-iotfleetwise',
    clientClass: 'IoTFleetWiseClient',
    listCommand: 'ListFleetsCommand',
    listResponsePath: 'fleetSummaries',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (fleet: any, region: string) => {
      const fleetId = fleet.id ?? 'unknown'
      const arn = fleet.arn ?? ''
      return {
        id: `aws-fleetwise-${fleetId}`,
        label: `FleetWise: ${fleetId}`,
        type: 'iot-fleetwise',
        category: 'iot' as NodeCategory,
        region,
        metadata: {
          fleetId,
          arn,
          description: str(fleet.description),
          signalCatalogArn: str(fleet.signalCatalogArn),
          creationTime: fleet.creationTime?.toISOString?.() ?? str(fleet.creationTime),
          lastModificationTime: fleet.lastModificationTime?.toISOString?.() ?? str(fleet.lastModificationTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  //  DEVOPS
  // =======================================================================

  // -----------------------------------------------------------------------
  // CodePipeline — Pipelines
  // -----------------------------------------------------------------------
  {
    type: 'codepipeline',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-codepipeline',
    clientClass: 'CodePipelineClient',
    listCommand: 'ListPipelinesCommand',
    listResponsePath: 'pipelines',
    paginationToken: 'nextToken',
    importance: 6,
    mapResource: (pipeline: any, region: string) => {
      const pipelineName = pipeline.name ?? 'unknown'
      return {
        id: `aws-codepipeline-${pipelineName}`,
        label: `Pipeline: ${pipelineName}`,
        type: 'codepipeline',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          name: pipelineName,
          version: str(pipeline.version),
          pipelineType: str(pipeline.pipelineType),
          created: pipeline.created?.toISOString?.() ?? str(pipeline.created),
          updated: pipeline.updated?.toISOString?.() ?? str(pipeline.updated),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CodeBuild — Projects
  // -----------------------------------------------------------------------
  {
    type: 'codebuild',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-codebuild',
    clientClass: 'CodeBuildClient',
    listCommand: 'ListProjectsCommand',
    listResponsePath: 'projects',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (projectName: string, region: string) => {
      return {
        id: `aws-codebuild-${projectName}`,
        label: `Build: ${projectName}`,
        type: 'codebuild',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          projectName,
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CodeCommit — Repositories
  // -----------------------------------------------------------------------
  {
    type: 'codecommit',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-codecommit',
    clientClass: 'CodeCommitClient',
    listCommand: 'ListRepositoriesCommand',
    listResponsePath: 'repositories',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (repo: any, region: string) => {
      const repoName = repo.repositoryName ?? 'unknown'
      const repoId = repo.repositoryId ?? 'unknown'
      return {
        id: `aws-codecommit-${repoId}`,
        label: `Repo: ${repoName}`,
        type: 'codecommit',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          repositoryName: repoName,
          repositoryId: repoId,
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CodeDeploy — Applications
  // -----------------------------------------------------------------------
  {
    type: 'codedeploy',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-codedeploy',
    clientClass: 'CodeDeployClient',
    listCommand: 'ListApplicationsCommand',
    listResponsePath: 'applications',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (appName: string, region: string) => {
      return {
        id: `aws-codedeploy-${appName}`,
        label: `Deploy: ${appName}`,
        type: 'codedeploy',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          applicationName: appName,
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CodeArtifact — Repositories
  // -----------------------------------------------------------------------
  {
    type: 'codeartifact',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-codeartifact',
    clientClass: 'CodeartifactClient',
    listCommand: 'ListRepositoriesCommand',
    listResponsePath: 'repositories',
    paginationToken: 'nextToken',
    importance: 4,
    mapResource: (repo: any, region: string) => {
      const repoName = repo.name ?? 'unknown'
      const domainName = repo.domainName ?? ''
      return {
        id: `aws-codeartifact-${domainName}-${repoName}`,
        label: `Artifact: ${repoName}`,
        type: 'codeartifact',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          name: repoName,
          domainName,
          arn: str(repo.arn),
          domainOwner: str(repo.domainOwner),
          description: str(repo.description),
          administratorAccount: str(repo.administratorAccount),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CodeStar Connections
  // -----------------------------------------------------------------------
  {
    type: 'codestar',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-codestar-connections',
    clientClass: 'CodeStarConnectionsClient',
    listCommand: 'ListConnectionsCommand',
    listResponsePath: 'Connections',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (conn: any, region: string) => {
      const connName = conn.ConnectionName ?? 'unknown'
      const connArn = conn.ConnectionArn ?? ''
      const status = conn.ConnectionStatus ?? ''
      return {
        id: `aws-codestar-${connName}`,
        label: `CSConn: ${connName}`,
        type: 'codestar',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          connectionName: connName,
          connectionArn: connArn,
          connectionStatus: status,
          providerType: str(conn.ProviderType),
          ownerAccountId: str(conn.OwnerAccountId),
        },
        status: status === 'AVAILABLE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // X-Ray — Groups
  // -----------------------------------------------------------------------
  {
    type: 'xray',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-xray',
    clientClass: 'XRayClient',
    listCommand: 'GetGroupsCommand',
    listResponsePath: 'Groups',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (group: any, region: string) => {
      const groupName = group.GroupName ?? 'unknown'
      const groupArn = group.GroupARN ?? ''
      return {
        id: `aws-xray-${groupName}`,
        label: `X-Ray: ${groupName}`,
        type: 'xray',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          groupName,
          groupArn,
          filterExpression: str(group.FilterExpression),
          insightsEnabled: str(group.InsightsConfiguration?.InsightsEnabled),
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CloudFormation — Stacks
  // -----------------------------------------------------------------------
  {
    type: 'cloudformation',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-cloudformation',
    clientClass: 'CloudFormationClient',
    listCommand: 'ListStacksCommand',
    listResponsePath: 'StackSummaries',
    paginationToken: 'NextToken',
    importance: 6,
    mapResource: (stack: any, region: string) => {
      const stackName = stack.StackName ?? 'unknown'
      const status = stack.StackStatus ?? ''
      // Skip deleted stacks
      if (status === 'DELETE_COMPLETE') return null
      return {
        id: `aws-cfn-${stackName}`,
        label: `CFN: ${stackName}`,
        type: 'cloudformation',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          stackName,
          stackId: str(stack.StackId),
          stackStatus: status,
          statusReason: str(stack.StackStatusReason),
          creationTime: stack.CreationTime?.toISOString?.() ?? str(stack.CreationTime),
          lastUpdatedTime: stack.LastUpdatedTime?.toISOString?.() ?? str(stack.LastUpdatedTime),
          deletionTime: stack.DeletionTime?.toISOString?.() ?? str(stack.DeletionTime),
          templateDescription: str(stack.TemplateDescription),
          driftStatus: str(stack.DriftInformation?.StackDriftStatus),
        },
        status: status.includes('COMPLETE') && !status.includes('ROLLBACK') ? 'healthy' as HealthStatus
          : status.includes('ROLLBACK') || status.includes('FAILED') ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cloud9 — Environments
  // -----------------------------------------------------------------------
  {
    type: 'cloud9',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-cloud9',
    clientClass: 'Cloud9Client',
    listCommand: 'ListEnvironmentsCommand',
    listResponsePath: 'environmentIds',
    paginationToken: 'nextToken',
    importance: 3,
    mapResource: (envId: string, region: string) => {
      return {
        id: `aws-cloud9-${envId}`,
        label: `Cloud9: ${envId.substring(0, 12)}...`,
        type: 'cloud9',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          environmentId: envId,
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SSM — Systems Manager (Managed Instances)
  // -----------------------------------------------------------------------
  {
    type: 'ssm',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-ssm',
    clientClass: 'SSMClient',
    listCommand: 'DescribeInstanceInformationCommand',
    listResponsePath: 'InstanceInformationList',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (instance: any, region: string) => {
      const instanceId = instance.InstanceId ?? 'unknown'
      const pingStatus = instance.PingStatus ?? ''
      return {
        id: `aws-ssm-${instanceId}`,
        label: `SSM: ${instanceId}`,
        type: 'ssm',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          instanceId,
          pingStatus,
          platformType: str(instance.PlatformType),
          platformName: str(instance.PlatformName),
          platformVersion: str(instance.PlatformVersion),
          agentVersion: str(instance.AgentVersion),
          computerName: str(instance.ComputerName),
          ipAddress: str(instance.IPAddress),
          lastPingDateTime: instance.LastPingDateTime?.toISOString?.() ?? str(instance.LastPingDateTime),
        },
        status: pingStatus === 'Online' ? 'healthy' as HealthStatus
          : pingStatus === 'ConnectionLost' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Proton — Services
  // -----------------------------------------------------------------------
  {
    type: 'proton',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-proton',
    clientClass: 'ProtonClient',
    listCommand: 'ListServicesCommand',
    listResponsePath: 'services',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (svc: any, region: string) => {
      const serviceName = svc.name ?? 'unknown'
      const status = svc.status ?? ''
      return {
        id: `aws-proton-${serviceName}`,
        label: `Proton: ${serviceName}`,
        type: 'proton',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          name: serviceName,
          arn: str(svc.arn),
          status,
          templateName: str(svc.templateName),
          description: str(svc.description),
          createdAt: svc.createdAt?.toISOString?.() ?? str(svc.createdAt),
          lastModifiedAt: svc.lastModifiedAt?.toISOString?.() ?? str(svc.lastModifiedAt),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Amplify — Apps
  // -----------------------------------------------------------------------
  {
    type: 'amplify',
    category: 'devops',
    sdkPackage: '@aws-sdk/client-amplify',
    clientClass: 'AmplifyClient',
    listCommand: 'ListAppsCommand',
    listResponsePath: 'apps',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (app: any, region: string) => {
      const appName = app.name ?? 'unknown'
      const appId = app.appId ?? 'unknown'
      return {
        id: `aws-amplify-${appId}`,
        label: `Amplify: ${appName}`,
        type: 'amplify',
        category: 'devops' as NodeCategory,
        region,
        metadata: {
          name: appName,
          appId,
          appArn: str(app.appArn),
          defaultDomain: str(app.defaultDomain),
          repository: str(app.repository),
          platform: str(app.platform),
          createTime: app.createTime?.toISOString?.() ?? str(app.createTime),
          updateTime: app.updateTime?.toISOString?.() ?? str(app.updateTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  //  MANAGEMENT
  // =======================================================================

  // -----------------------------------------------------------------------
  // Organizations — Accounts
  // -----------------------------------------------------------------------
  {
    type: 'organizations',
    category: 'management',
    sdkPackage: '@aws-sdk/client-organizations',
    clientClass: 'OrganizationsClient',
    listCommand: 'ListAccountsCommand',
    listResponsePath: 'Accounts',
    paginationToken: 'NextToken',
    importance: 8,
    mapResource: (account: any, _region: string) => {
      const accountName = account.Name ?? 'unknown'
      const accountId = account.Id ?? 'unknown'
      const status = account.Status ?? ''
      return {
        id: `aws-org-${accountId}`,
        label: `Account: ${accountName}`,
        type: 'organizations',
        category: 'management' as NodeCategory,
        region: 'global',
        metadata: {
          name: accountName,
          accountId,
          arn: str(account.Arn),
          email: str(account.Email),
          status,
          joinedMethod: str(account.JoinedMethod),
          joinedTimestamp: account.JoinedTimestamp?.toISOString?.() ?? str(account.JoinedTimestamp),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 8,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Control Tower — Enabled Controls
  // -----------------------------------------------------------------------
  {
    type: 'controltower',
    category: 'management',
    sdkPackage: '@aws-sdk/client-controltower',
    clientClass: 'ControlTowerClient',
    listCommand: 'ListEnabledControlsCommand',
    listResponsePath: 'enabledControls',
    paginationToken: 'nextToken',
    importance: 6,
    mapResource: (control: any, region: string) => {
      const controlIdentifier = control.controlIdentifier ?? 'unknown'
      const shortId = controlIdentifier.split('/').pop() ?? controlIdentifier
      return {
        id: `aws-controltower-${shortId.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
        label: `CT: ${shortId}`,
        type: 'controltower',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          controlIdentifier,
          arn: str(control.arn),
          statusSummary: str(control.statusSummary?.status),
          targetIdentifier: str(control.targetIdentifier),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Service Catalog — Portfolios
  // -----------------------------------------------------------------------
  {
    type: 'servicecatalog',
    category: 'management',
    sdkPackage: '@aws-sdk/client-service-catalog',
    clientClass: 'ServiceCatalogClient',
    listCommand: 'ListPortfoliosCommand',
    listResponsePath: 'PortfolioDetails',
    paginationToken: 'NextPageToken',
    paginationInputToken: 'PageToken',
    importance: 5,
    mapResource: (portfolio: any, region: string) => {
      const portfolioName = portfolio.DisplayName ?? 'unknown'
      const portfolioId = portfolio.Id ?? 'unknown'
      return {
        id: `aws-sc-${portfolioId}`,
        label: `SC: ${portfolioName}`,
        type: 'servicecatalog',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          displayName: portfolioName,
          portfolioId,
          arn: str(portfolio.ARN),
          description: str(portfolio.Description),
          providerName: str(portfolio.ProviderName),
          createdTime: portfolio.CreatedTime?.toISOString?.() ?? str(portfolio.CreatedTime),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // License Manager — License Configurations
  // -----------------------------------------------------------------------
  {
    type: 'licensemanager',
    category: 'management',
    sdkPackage: '@aws-sdk/client-license-manager',
    clientClass: 'LicenseManagerClient',
    listCommand: 'ListLicenseConfigurationsCommand',
    listResponsePath: 'LicenseConfigurations',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (config: any, region: string) => {
      const configName = config.Name ?? 'unknown'
      const configArn = config.LicenseConfigurationArn ?? ''
      const status = config.Status ?? ''
      return {
        id: `aws-licensemanager-${configName.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
        label: `License: ${configName}`,
        type: 'licensemanager',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          name: configName,
          licenseConfigurationArn: configArn,
          status,
          licenseCountingType: str(config.LicenseCountingType),
          licenseCount: str(config.LicenseCount),
          consumedLicenses: str(config.ConsumedLicenses),
        },
        status: status === 'AVAILABLE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Health Dashboard — Events
  // -----------------------------------------------------------------------
  {
    type: 'health',
    category: 'management',
    sdkPackage: '@aws-sdk/client-health',
    clientClass: 'HealthClient',
    listCommand: 'DescribeEventsCommand',
    listResponsePath: 'events',
    paginationToken: 'nextToken',
    importance: 6,
    mapResource: (event: any, _region: string) => {
      const eventArn = event.arn ?? 'unknown'
      const service = event.service ?? ''
      const statusCode = event.statusCode ?? ''
      const eventTypeCode = event.eventTypeCode ?? ''
      const eventRegion = event.region ?? 'global'
      const shortArn = eventArn.split('/').pop() ?? eventArn
      return {
        id: `aws-health-${shortArn.substring(0, 32)}`,
        label: `Health: ${service} - ${eventTypeCode}`,
        type: 'health',
        category: 'management' as NodeCategory,
        region: eventRegion,
        metadata: {
          arn: eventArn,
          service,
          eventTypeCode,
          eventTypeCategory: str(event.eventTypeCategory),
          statusCode,
          startTime: event.startTime?.toISOString?.() ?? str(event.startTime),
          endTime: event.endTime?.toISOString?.() ?? str(event.endTime),
          lastUpdatedTime: event.lastUpdatedTime?.toISOString?.() ?? str(event.lastUpdatedTime),
        },
        status: statusCode === 'closed' ? 'healthy' as HealthStatus
          : statusCode === 'open' ? 'warning' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Resource Groups
  // -----------------------------------------------------------------------
  {
    type: 'resourcegroups',
    category: 'management',
    sdkPackage: '@aws-sdk/client-resource-groups',
    clientClass: 'ResourceGroupsClient',
    listCommand: 'ListGroupsCommand',
    listResponsePath: 'Groups',
    paginationToken: 'NextToken',
    importance: 3,
    mapResource: (group: any, region: string) => {
      const groupName = group.Name ?? 'unknown'
      const groupArn = group.GroupArn ?? ''
      return {
        id: `aws-rg-${groupName}`,
        label: `RG: ${groupName}`,
        type: 'resourcegroups',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          name: groupName,
          groupArn,
          description: str(group.Description),
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CloudWatch — Alarms
  // -----------------------------------------------------------------------
  {
    type: 'cloudwatch',
    category: 'management',
    sdkPackage: '@aws-sdk/client-cloudwatch',
    clientClass: 'CloudWatchClient',
    listCommand: 'DescribeAlarmsCommand',
    listResponsePath: 'MetricAlarms',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (alarm: any, region: string) => {
      const alarmName = alarm.AlarmName ?? 'unknown'
      const stateValue = alarm.StateValue ?? ''
      return {
        id: `aws-cwalarm-${alarmName.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
        label: `Alarm: ${alarmName}`,
        type: 'cloudwatch',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          alarmName,
          alarmArn: str(alarm.AlarmArn),
          stateValue,
          stateReason: str(alarm.StateReason),
          metricName: str(alarm.MetricName),
          namespace: str(alarm.Namespace),
          statistic: str(alarm.Statistic),
          period: str(alarm.Period),
          threshold: str(alarm.Threshold),
          comparisonOperator: str(alarm.ComparisonOperator),
          actionsEnabled: str(alarm.ActionsEnabled),
        },
        status: stateValue === 'OK' ? 'healthy' as HealthStatus
          : stateValue === 'ALARM' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // CloudWatch — Dashboards
  // -----------------------------------------------------------------------
  {
    type: 'cloudwatch-dashboard',
    category: 'management',
    sdkPackage: '@aws-sdk/client-cloudwatch',
    clientClass: 'CloudWatchClient',
    listCommand: 'ListDashboardsCommand',
    listResponsePath: 'DashboardEntries',
    paginationToken: 'NextToken',
    importance: 3,
    mapResource: (dashboard: any, region: string) => {
      const dashboardName = dashboard.DashboardName ?? 'unknown'
      return {
        id: `aws-cwdash-${dashboardName}`,
        label: `CWDash: ${dashboardName}`,
        type: 'cloudwatch-dashboard',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          dashboardName,
          dashboardArn: str(dashboard.DashboardArn),
          lastModified: dashboard.LastModified?.toISOString?.() ?? str(dashboard.LastModified),
          size: str(dashboard.Size),
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Service Quotas
  // -----------------------------------------------------------------------
  {
    type: 'servicequotas',
    category: 'management',
    sdkPackage: '@aws-sdk/client-service-quotas',
    clientClass: 'ServiceQuotasClient',
    listCommand: 'ListServicesCommand',
    listResponsePath: 'Services',
    paginationToken: 'NextToken',
    importance: 3,
    mapResource: (svc: any, region: string) => {
      const serviceName = svc.ServiceName ?? 'unknown'
      const serviceCode = svc.ServiceCode ?? 'unknown'
      return {
        id: `aws-quota-${serviceCode}`,
        label: `Quota: ${serviceName}`,
        type: 'servicequotas',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          serviceName,
          serviceCode,
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // AWS Budgets
  // -----------------------------------------------------------------------
  {
    type: 'budgets',
    category: 'management',
    sdkPackage: '@aws-sdk/client-budgets',
    clientClass: 'BudgetsClient',
    listCommand: 'DescribeBudgetsCommand',
    listResponsePath: 'Budgets',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (budget: any, _region: string) => {
      const budgetName = budget.BudgetName ?? 'unknown'
      const budgetType = budget.BudgetType ?? ''
      return {
        id: `aws-budget-${budgetName.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
        label: `Budget: ${budgetName}`,
        type: 'budgets',
        category: 'management' as NodeCategory,
        region: 'global',
        metadata: {
          budgetName,
          budgetType,
          budgetLimit: str(budget.BudgetLimit?.Amount),
          budgetLimitUnit: str(budget.BudgetLimit?.Unit),
          timeUnit: str(budget.TimeUnit),
          calculatedSpendActualSpend: str(budget.CalculatedSpend?.ActualSpend?.Amount),
          calculatedSpendForecastedSpend: str(budget.CalculatedSpend?.ForecastedSpend?.Amount),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Cost Explorer (static singleton per account)
  // -----------------------------------------------------------------------
  {
    type: 'costexplorer',
    category: 'management',
    sdkPackage: '@aws-sdk/client-cost-explorer',
    clientClass: 'CostExplorerClient',
    listCommand: 'GetCostAndUsageCommand',
    listResponsePath: 'ResultsByTime',
    paginationToken: 'NextPageToken',
    paginationInputToken: 'NextPageToken',
    importance: 5,
    mapResource: (result: any, _region: string) => {
      const start = result.TimePeriod?.Start ?? 'unknown'
      const end = result.TimePeriod?.End ?? 'unknown'
      const totalAmount = result.Total?.UnblendedCost?.Amount ?? '0'
      const unit = result.Total?.UnblendedCost?.Unit ?? 'USD'
      return {
        id: `aws-cost-${start}`,
        label: `Cost: ${start} to ${end}`,
        type: 'costexplorer',
        category: 'management' as NodeCategory,
        region: 'global',
        metadata: {
          timePeriodStart: start,
          timePeriodEnd: end,
          totalAmount,
          unit,
          estimated: str(result.Estimated),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Trusted Advisor — Checks
  // -----------------------------------------------------------------------
  {
    type: 'trustedadvisor',
    category: 'management',
    sdkPackage: '@aws-sdk/client-trustedadvisor',
    clientClass: 'TrustedAdvisorClient',
    listCommand: 'ListChecksCommand',
    listResponsePath: 'checkSummaries',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (check: any, _region: string) => {
      const checkName = check.name ?? 'unknown'
      const checkId = check.id ?? 'unknown'
      return {
        id: `aws-ta-${checkId}`,
        label: `TA: ${checkName}`,
        type: 'trustedadvisor',
        category: 'management' as NodeCategory,
        region: 'global',
        metadata: {
          name: checkName,
          checkId,
          description: str(check.description),
          pillars: (check.pillars ?? []).join(', '),
          source: str(check.source),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Well-Architected — Workloads
  // -----------------------------------------------------------------------
  {
    type: 'wellarchitected',
    category: 'management',
    sdkPackage: '@aws-sdk/client-wellarchitected',
    clientClass: 'WellArchitectedClient',
    listCommand: 'ListWorkloadsCommand',
    listResponsePath: 'WorkloadSummaries',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (workload: any, region: string) => {
      const workloadName = workload.WorkloadName ?? 'unknown'
      const workloadId = workload.WorkloadId ?? 'unknown'
      const riskCounts = workload.RiskCounts ?? {}
      return {
        id: `aws-wa-${workloadId}`,
        label: `WA: ${workloadName}`,
        type: 'wellarchitected',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          workloadName,
          workloadId,
          workloadArn: str(workload.WorkloadArn),
          owner: str(workload.Owner),
          updatedAt: workload.UpdatedAt?.toISOString?.() ?? str(workload.UpdatedAt),
          highRisks: str(riskCounts.HIGH ?? 0),
          mediumRisks: str(riskCounts.MEDIUM ?? 0),
          improvementStatus: str(workload.ImprovementStatus),
        },
        status: (riskCounts.HIGH ?? 0) > 0 ? 'error' as HealthStatus
          : (riskCounts.MEDIUM ?? 0) > 0 ? 'warning' as HealthStatus
          : 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // AWS Chatbot — Teams Channel Configurations
  // -----------------------------------------------------------------------
  {
    type: 'chatbot',
    category: 'management',
    sdkPackage: '@aws-sdk/client-chatbot',
    clientClass: 'ChatbotClient',
    listCommand: 'ListMicrosoftTeamsChannelConfigurationsCommand',
    listResponsePath: 'TeamChannelConfigurations',
    paginationToken: 'NextToken',
    importance: 3,
    mapResource: (config: any, region: string) => {
      const configName = config.ConfigurationName ?? 'unknown'
      return {
        id: `aws-chatbot-${configName}`,
        label: `Chatbot: ${configName}`,
        type: 'chatbot',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          configurationName: configName,
          chatConfigurationArn: str(config.ChatConfigurationArn),
          teamId: str(config.TeamId),
          teamName: str(config.TeamName),
          channelId: str(config.ChannelId),
          channelName: str(config.ChannelName),
          iamRoleArn: str(config.IamRoleArn),
        },
        status: 'healthy' as HealthStatus,
        importance: 3,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SSM Incident Manager — Response Plans
  // -----------------------------------------------------------------------
  {
    type: 'ssm-incident-manager',
    category: 'management',
    sdkPackage: '@aws-sdk/client-ssm-incidents',
    clientClass: 'SSMIncidentsClient',
    listCommand: 'ListResponsePlansCommand',
    listResponsePath: 'responsePlanSummaries',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (plan: any, region: string) => {
      const planName = plan.name ?? 'unknown'
      const planArn = plan.arn ?? ''
      return {
        id: `aws-incident-${planName}`,
        label: `Incident: ${planName}`,
        type: 'ssm-incident-manager',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          name: planName,
          arn: planArn,
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Launch Wizard — Deployments
  // -----------------------------------------------------------------------
  {
    type: 'launch-wizard',
    category: 'management',
    sdkPackage: '@aws-sdk/client-launch-wizard',
    clientClass: 'LaunchWizardClient',
    listCommand: 'ListDeploymentsCommand',
    listResponsePath: 'deployments',
    paginationToken: 'nextToken',
    importance: 4,
    mapResource: (deployment: any, region: string) => {
      const deploymentName = deployment.name ?? 'unknown'
      const deploymentId = deployment.id ?? 'unknown'
      const status = deployment.status ?? ''
      return {
        id: `aws-launchwizard-${deploymentId}`,
        label: `LW: ${deploymentName}`,
        type: 'launch-wizard',
        category: 'management' as NodeCategory,
        region,
        metadata: {
          name: deploymentName,
          deploymentId,
          status,
          workloadName: str(deployment.workloadName),
          patternName: str(deployment.patternName),
          createdAt: deployment.createdAt?.toISOString?.() ?? str(deployment.createdAt),
        },
        status: status === 'COMPLETED' ? 'healthy' as HealthStatus
          : status === 'FAILED' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // =======================================================================
  //  INTEGRATION
  // =======================================================================

  // -----------------------------------------------------------------------
  // AppSync — GraphQL APIs
  // -----------------------------------------------------------------------
  {
    type: 'appsync',
    category: 'integration',
    sdkPackage: '@aws-sdk/client-appsync',
    clientClass: 'AppSyncClient',
    listCommand: 'ListGraphqlApisCommand',
    listResponsePath: 'graphqlApis',
    paginationToken: 'nextToken',
    importance: 6,
    mapResource: (api: any, region: string) => {
      const apiName = api.name ?? 'unknown'
      const apiId = api.apiId ?? 'unknown'
      return {
        id: `aws-appsync-${apiId}`,
        label: `AppSync: ${apiName}`,
        type: 'appsync',
        category: 'integration' as NodeCategory,
        region,
        metadata: {
          name: apiName,
          apiId,
          apiType: str(api.apiType),
          authenticationType: str(api.authenticationType),
          arn: str(api.arn),
          uris: JSON.stringify(api.uris ?? {}),
          visibility: str(api.visibility),
        },
        status: 'healthy' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // SWF — Simple Workflow Service Domains
  // -----------------------------------------------------------------------
  {
    type: 'swf',
    category: 'integration',
    sdkPackage: '@aws-sdk/client-swf',
    clientClass: 'SWFClient',
    listCommand: 'ListDomainsCommand',
    listResponsePath: 'domainInfos',
    paginationToken: 'nextPageToken',
    importance: 4,
    mapResource: (domain: any, region: string) => {
      const domainName = domain.name ?? 'unknown'
      const status = domain.status ?? ''
      return {
        id: `aws-swf-${domainName}`,
        label: `SWF: ${domainName}`,
        type: 'swf',
        category: 'integration' as NodeCategory,
        region,
        metadata: {
          name: domainName,
          status,
          description: str(domain.description),
          arn: str(domain.arn),
        },
        status: status === 'REGISTERED' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // =======================================================================
  //  MEDIA
  // =======================================================================

  // -----------------------------------------------------------------------
  // MediaConvert — Queues
  // -----------------------------------------------------------------------
  {
    type: 'mediaconvert',
    category: 'media',
    sdkPackage: '@aws-sdk/client-mediaconvert',
    clientClass: 'MediaConvertClient',
    listCommand: 'ListQueuesCommand',
    listResponsePath: 'Queues',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (queue: any, region: string) => {
      const queueName = queue.Name ?? 'unknown'
      const status = queue.Status ?? ''
      return {
        id: `aws-mediaconvert-${queueName}`,
        label: `MediaConvert: ${queueName}`,
        type: 'mediaconvert',
        category: 'media' as NodeCategory,
        region,
        metadata: {
          name: queueName,
          arn: str(queue.Arn),
          status,
          type: str(queue.Type),
          pricingPlan: str(queue.PricingPlan),
          createdAt: queue.CreatedAt?.toISOString?.() ?? str(queue.CreatedAt),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // MediaLive — Channels
  // -----------------------------------------------------------------------
  {
    type: 'medialive',
    category: 'media',
    sdkPackage: '@aws-sdk/client-medialive',
    clientClass: 'MediaLiveClient',
    listCommand: 'ListChannelsCommand',
    listResponsePath: 'Channels',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (channel: any, region: string) => {
      const channelName = channel.Name ?? 'unknown'
      const channelId = channel.Id ?? 'unknown'
      const state = channel.State ?? ''
      return {
        id: `aws-medialive-${channelId}`,
        label: `MediaLive: ${channelName}`,
        type: 'medialive',
        category: 'media' as NodeCategory,
        region,
        metadata: {
          name: channelName,
          channelId,
          arn: str(channel.Arn),
          channelClass: str(channel.ChannelClass),
          state,
          pipelinesRunningCount: str(channel.PipelinesRunningCount),
        },
        status: state === 'RUNNING' ? 'healthy' as HealthStatus
          : state === 'IDLE' ? 'warning' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // MediaPackage — Channels
  // -----------------------------------------------------------------------
  {
    type: 'mediapackage',
    category: 'media',
    sdkPackage: '@aws-sdk/client-mediapackage',
    clientClass: 'MediaPackageClient',
    listCommand: 'ListChannelsCommand',
    listResponsePath: 'Channels',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (channel: any, region: string) => {
      const channelId = channel.Id ?? 'unknown'
      const description = channel.Description ?? ''
      return {
        id: `aws-mediapackage-${channelId}`,
        label: `MediaPkg: ${channelId}`,
        type: 'mediapackage',
        category: 'media' as NodeCategory,
        region,
        metadata: {
          channelId,
          arn: str(channel.Arn),
          description,
        },
        status: 'healthy' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // MediaStore — Containers
  // -----------------------------------------------------------------------
  {
    type: 'mediastore',
    category: 'media',
    sdkPackage: '@aws-sdk/client-mediastore',
    clientClass: 'MediaStoreClient',
    listCommand: 'ListContainersCommand',
    listResponsePath: 'Containers',
    paginationToken: 'NextToken',
    importance: 4,
    mapResource: (container: any, region: string) => {
      const containerName = container.Name ?? 'unknown'
      const status = container.Status ?? ''
      return {
        id: `aws-mediastore-${containerName}`,
        label: `MediaStore: ${containerName}`,
        type: 'mediastore',
        category: 'media' as NodeCategory,
        region,
        metadata: {
          name: containerName,
          arn: str(container.ARN),
          status,
          endpoint: str(container.Endpoint),
          creationTime: container.CreationTime?.toISOString?.() ?? str(container.CreationTime),
          accessLoggingEnabled: str(container.AccessLoggingEnabled),
        },
        status: status === 'ACTIVE' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // IVS — Interactive Video Service Channels
  // -----------------------------------------------------------------------
  {
    type: 'ivs',
    category: 'media',
    sdkPackage: '@aws-sdk/client-ivs',
    clientClass: 'IvsClient',
    listCommand: 'ListChannelsCommand',
    listResponsePath: 'channels',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (channel: any, region: string) => {
      const channelName = channel.name ?? 'unknown'
      const channelArn = channel.arn ?? ''
      return {
        id: `aws-ivs-${channelName}`,
        label: `IVS: ${channelName}`,
        type: 'ivs',
        category: 'media' as NodeCategory,
        region,
        metadata: {
          name: channelName,
          arn: channelArn,
          latencyMode: str(channel.latencyMode),
          authorized: str(channel.authorized),
          recordingConfigurationArn: str(channel.recordingConfigurationArn),
          insecureIngest: str(channel.insecureIngest),
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Elastic Transcoder — Pipelines
  // -----------------------------------------------------------------------
  {
    type: 'elastic-transcoder',
    category: 'media',
    sdkPackage: '@aws-sdk/client-elastic-transcoder',
    clientClass: 'ElasticTranscoderClient',
    listCommand: 'ListPipelinesCommand',
    listResponsePath: 'Pipelines',
    paginationToken: 'NextPageToken',
    paginationInputToken: 'PageToken',
    importance: 4,
    mapResource: (pipeline: any, region: string) => {
      const pipelineName = pipeline.Name ?? 'unknown'
      const pipelineId = pipeline.Id ?? 'unknown'
      const status = pipeline.Status ?? ''
      return {
        id: `aws-et-${pipelineId}`,
        label: `ET: ${pipelineName}`,
        type: 'elastic-transcoder',
        category: 'media' as NodeCategory,
        region,
        metadata: {
          name: pipelineName,
          pipelineId,
          arn: str(pipeline.Arn),
          status,
          inputBucket: str(pipeline.InputBucket),
          outputBucket: str(pipeline.OutputBucket),
          role: str(pipeline.Role),
        },
        status: status === 'Active' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // WorkSpaces
  // -----------------------------------------------------------------------
  {
    type: 'workspaces',
    category: 'media',
    sdkPackage: '@aws-sdk/client-workspaces',
    clientClass: 'WorkSpacesClient',
    listCommand: 'DescribeWorkspacesCommand',
    listResponsePath: 'Workspaces',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (ws: any, region: string) => {
      const wsId = ws.WorkspaceId ?? 'unknown'
      const userName = ws.UserName ?? ''
      const state = ws.State ?? ''
      return {
        id: `aws-workspace-${wsId}`,
        label: `WS: ${userName || wsId}`,
        type: 'workspaces',
        category: 'media' as NodeCategory,
        region,
        metadata: {
          workspaceId: wsId,
          userName,
          directoryId: str(ws.DirectoryId),
          bundleId: str(ws.BundleId),
          state,
          computerName: str(ws.ComputerName),
          ipAddress: str(ws.IpAddress),
          subnetId: str(ws.SubnetId),
          runningMode: str(ws.WorkspaceProperties?.RunningMode),
          computeTypeName: str(ws.WorkspaceProperties?.ComputeTypeName),
        },
        status: state === 'AVAILABLE' ? 'healthy' as HealthStatus
          : state === 'ERROR' || state === 'UNHEALTHY' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // AppStream — Fleets
  // -----------------------------------------------------------------------
  {
    type: 'appstream',
    category: 'media',
    sdkPackage: '@aws-sdk/client-appstream',
    clientClass: 'AppStreamClient',
    listCommand: 'DescribeFleetsCommand',
    listResponsePath: 'Fleets',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (fleet: any, region: string) => {
      const fleetName = fleet.Name ?? 'unknown'
      const state = fleet.State ?? ''
      return {
        id: `aws-appstream-${fleetName}`,
        label: `AppStream: ${fleetName}`,
        type: 'appstream',
        category: 'media' as NodeCategory,
        region,
        metadata: {
          name: fleetName,
          arn: str(fleet.Arn),
          displayName: str(fleet.DisplayName),
          state,
          instanceType: str(fleet.InstanceType),
          fleetType: str(fleet.FleetType),
          maxUserDurationInSeconds: str(fleet.MaxUserDurationInSeconds),
          disconnectTimeoutInSeconds: str(fleet.DisconnectTimeoutInSeconds),
          imageArn: str(fleet.ImageArn),
          imageName: str(fleet.ImageName),
        },
        status: state === 'RUNNING' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // GameLift — Fleets
  // -----------------------------------------------------------------------
  {
    type: 'gamelift',
    category: 'media',
    sdkPackage: '@aws-sdk/client-gamelift',
    clientClass: 'GameLiftClient',
    listCommand: 'ListFleetsCommand',
    listResponsePath: 'FleetIds',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (fleetId: string, region: string) => {
      return {
        id: `aws-gamelift-${fleetId}`,
        label: `GameLift: ${fleetId}`,
        type: 'gamelift',
        category: 'media' as NodeCategory,
        region,
        metadata: {
          fleetId,
        },
        status: 'healthy' as HealthStatus,
        importance: 5,
      }
    },
  },

  // =======================================================================
  //  MIGRATION
  // =======================================================================

  // -----------------------------------------------------------------------
  // DMS — Database Migration Service
  // -----------------------------------------------------------------------
  {
    type: 'dms',
    category: 'migration',
    sdkPackage: '@aws-sdk/client-database-migration-service',
    clientClass: 'DatabaseMigrationServiceClient',
    listCommand: 'DescribeReplicationInstancesCommand',
    listResponsePath: 'ReplicationInstances',
    paginationToken: 'Marker',
    paginationInputToken: 'Marker',
    importance: 6,
    mapResource: (instance: any, region: string) => {
      const instanceId = instance.ReplicationInstanceIdentifier ?? 'unknown'
      const status = instance.ReplicationInstanceStatus ?? ''
      return {
        id: `aws-dms-${instanceId}`,
        label: `DMS: ${instanceId}`,
        type: 'dms',
        category: 'migration' as NodeCategory,
        region,
        metadata: {
          replicationInstanceIdentifier: instanceId,
          replicationInstanceArn: str(instance.ReplicationInstanceArn),
          replicationInstanceClass: str(instance.ReplicationInstanceClass),
          replicationInstanceStatus: status,
          engineVersion: str(instance.EngineVersion),
          allocatedStorage: str(instance.AllocatedStorage),
          multiAZ: str(instance.MultiAZ),
          vpcId: str(instance.ReplicationSubnetGroup?.VpcId),
          availabilityZone: str(instance.AvailabilityZone),
        },
        status: status === 'available' ? 'healthy' as HealthStatus : 'warning' as HealthStatus,
        importance: 6,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Migration Hub — Migration Tasks
  // -----------------------------------------------------------------------
  {
    type: 'migration-hub',
    category: 'migration',
    sdkPackage: '@aws-sdk/client-migration-hub',
    clientClass: 'MigrationHubClient',
    listCommand: 'ListMigrationTasksCommand',
    listResponsePath: 'MigrationTaskSummaryList',
    paginationToken: 'NextToken',
    importance: 5,
    mapResource: (task: any, region: string) => {
      const taskName = task.MigrationTaskName ?? 'unknown'
      const status = task.Status ?? ''
      return {
        id: `aws-migrationhub-${taskName.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
        label: `MigHub: ${taskName}`,
        type: 'migration-hub',
        category: 'migration' as NodeCategory,
        region,
        metadata: {
          migrationTaskName: taskName,
          status,
          progressUpdateStream: str(task.ProgressUpdateStream),
          progressPercent: str(task.ProgressPercent),
          statusDetail: str(task.StatusDetail),
          updateDateTime: task.UpdateDateTime?.toISOString?.() ?? str(task.UpdateDateTime),
        },
        status: status === 'COMPLETED' ? 'healthy' as HealthStatus
          : status === 'FAILED' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },

  // -----------------------------------------------------------------------
  // Application Discovery Service — Agents
  // -----------------------------------------------------------------------
  {
    type: 'application-discovery',
    category: 'migration',
    sdkPackage: '@aws-sdk/client-application-discovery-service',
    clientClass: 'ApplicationDiscoveryServiceClient',
    listCommand: 'DescribeAgentsCommand',
    listResponsePath: 'agentsInfo',
    paginationToken: 'nextToken',
    importance: 4,
    mapResource: (agent: any, region: string) => {
      const agentId = agent.agentId ?? 'unknown'
      const hostName = agent.hostName ?? ''
      const health = agent.health ?? ''
      return {
        id: `aws-discovery-${agentId}`,
        label: `Discovery: ${hostName || agentId}`,
        type: 'application-discovery',
        category: 'migration' as NodeCategory,
        region,
        metadata: {
          agentId,
          hostName,
          health,
          agentType: str(agent.agentType),
          version: str(agent.version),
          connectorId: str(agent.connectorId),
          collectionStatus: str(agent.collectionStatus),
          lastHealthPingTime: str(agent.lastHealthPingTime),
          registeredTime: str(agent.registeredTime),
        },
        status: health === 'HEALTHY' ? 'healthy' as HealthStatus
          : health === 'UNHEALTHY' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 4,
      }
    },
  },

  // -----------------------------------------------------------------------
  // MGN — Application Migration Service
  // -----------------------------------------------------------------------
  {
    type: 'mgn',
    category: 'migration',
    sdkPackage: '@aws-sdk/client-mgn',
    clientClass: 'MgnClient',
    listCommand: 'DescribeSourceServersCommand',
    listResponsePath: 'items',
    paginationToken: 'nextToken',
    importance: 5,
    mapResource: (server: any, region: string) => {
      const sourceServerId = server.sourceServerID ?? 'unknown'
      const hostname = server.sourceProperties?.identificationHints?.hostname ?? ''
      const lifeCycleState = server.lifeCycle?.state ?? ''
      return {
        id: `aws-mgn-${sourceServerId}`,
        label: `MGN: ${hostname || sourceServerId}`,
        type: 'mgn',
        category: 'migration' as NodeCategory,
        region,
        metadata: {
          sourceServerID: sourceServerId,
          hostname,
          lifeCycleState,
          isArchived: str(server.isArchived),
          replicationType: str(server.replicationType),
          launchedInstanceId: str(server.launchedInstance?.ec2InstanceID),
          os: str(server.sourceProperties?.os?.fullString),
        },
        status: lifeCycleState === 'CUTOVER' ? 'healthy' as HealthStatus
          : lifeCycleState === 'DISCONNECTED' ? 'error' as HealthStatus
          : 'warning' as HealthStatus,
        importance: 5,
      }
    },
  },
]
