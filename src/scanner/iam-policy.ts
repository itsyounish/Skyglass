/**
 * IAM Policy / Role generators for read-only scanning.
 *
 * These functions output the minimal permission sets required by the skyglass
 * scanner modules. They are used by the CLI `--generate-policy` flag to produce
 * ready-to-apply JSON that operators can review before granting access.
 */

// ---------------------------------------------------------------------------
// AWS IAM Policy
// ---------------------------------------------------------------------------

export function generateAWSPolicy(): object {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'SkyglassReadOnly',
        Effect: 'Allow',
        Action: [
          // EC2 (instances, VPCs, subnets, security groups)
          'ec2:DescribeInstances',
          'ec2:DescribeVpcs',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',

          // RDS
          'rds:DescribeDBInstances',

          // Lambda
          'lambda:ListFunctions',
          'lambda:GetFunction',

          // S3
          's3:ListBuckets',
          's3:GetBucketLocation',

          // CloudFront
          'cloudfront:ListDistributions',

          // ECS
          'ecs:ListClusters',
          'ecs:DescribeClusters',

          // EKS
          'eks:ListClusters',
          'eks:DescribeCluster',

          // SQS
          'sqs:ListQueues',
          'sqs:GetQueueAttributes',

          // SNS
          'sns:ListTopics',
          'sns:GetTopicAttributes',

          // DynamoDB
          'dynamodb:ListTables',
          'dynamodb:DescribeTable',

          // ElastiCache
          'elasticache:DescribeCacheClusters',

          // API Gateway
          'apigateway:GetRestApis',

          // Route 53
          'route53:ListHostedZones',

          // Elastic Load Balancing (v2)
          'elasticloadbalancing:DescribeLoadBalancers',
          'elasticloadbalancing:DescribeTargetGroups',

          // Step Functions
          'states:ListStateMachines',

          // EventBridge
          'events:ListEventBuses',

          // IAM (roles)
          'iam:ListRoles',

          // Secrets Manager
          'secretsmanager:ListSecrets',

          // KMS
          'kms:ListKeys',
          'kms:DescribeKey',

          // ECR
          'ecr:DescribeRepositories',

          // EFS
          'elasticfilesystem:DescribeFileSystems',

          // CloudWatch Logs
          'logs:DescribeLogGroups',

          // Kinesis
          'kinesis:ListStreams',
          'kinesis:DescribeStreamSummary',

          // Redshift
          'redshift:DescribeClusters',
        ],
        Resource: '*',
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Azure custom role definition
// ---------------------------------------------------------------------------

export function generateAzureRoles(): object {
  return {
    Name: 'Skyglass Read-Only Scanner',
    IsCustom: true,
    Description: 'Minimal read-only permissions for skyglass infrastructure scanning.',
    Actions: [
      // Virtual Networks
      'Microsoft.Network/virtualNetworks/read',
      'Microsoft.Network/virtualNetworks/subnets/read',
      'Microsoft.Network/networkSecurityGroups/read',
      'Microsoft.Network/publicIPAddresses/read',
      'Microsoft.Network/loadBalancers/read',

      // AKS
      'Microsoft.ContainerService/managedClusters/read',

      // CosmosDB
      'Microsoft.DocumentDB/databaseAccounts/read',

      // App Service / Functions
      'Microsoft.Web/sites/read',
      'Microsoft.Web/serverfarms/read',

      // Storage
      'Microsoft.Storage/storageAccounts/read',

      // CDN / Front Door
      'Microsoft.Cdn/profiles/read',
      'Microsoft.Cdn/profiles/endpoints/read',
      'Microsoft.Network/frontDoors/read',

      // SQL
      'Microsoft.Sql/servers/read',
      'Microsoft.Sql/servers/databases/read',

      // Redis Cache
      'Microsoft.Cache/redis/read',

      // Service Bus
      'Microsoft.ServiceBus/namespaces/read',

      // Event Hubs
      'Microsoft.EventHub/namespaces/read',
    ],
    NotActions: [],
    DataActions: [],
    NotDataActions: [],
    AssignableScopes: ['/subscriptions/{subscription-id}'],
  }
}

// ---------------------------------------------------------------------------
// GCP custom role permissions
// ---------------------------------------------------------------------------

export function generateGCPRoles(): object {
  return {
    title: 'Skyglass Read-Only Scanner',
    description: 'Minimal read-only permissions for skyglass infrastructure scanning.',
    stage: 'GA',
    includedPermissions: [
      // Compute Engine
      'compute.instances.list',
      'compute.instances.get',
      'compute.networks.list',
      'compute.networks.get',
      'compute.subnetworks.list',
      'compute.subnetworks.get',
      'compute.firewalls.list',
      'compute.forwardingRules.list',

      // Cloud Run
      'run.services.list',
      'run.services.get',
      'run.revisions.list',

      // GKE
      'container.clusters.list',
      'container.clusters.get',

      // Cloud Storage
      'storage.buckets.list',
      'storage.buckets.get',

      // BigQuery
      'bigquery.datasets.get',
      'bigquery.tables.list',
      'bigquery.tables.get',

      // Pub/Sub
      'pubsub.topics.list',
      'pubsub.topics.get',
      'pubsub.subscriptions.list',
      'pubsub.subscriptions.get',

      // Cloud Functions
      'cloudfunctions.functions.list',
      'cloudfunctions.functions.get',

      // Cloud SQL
      'cloudsql.instances.list',
      'cloudsql.instances.get',

      // Memorystore (Redis)
      'redis.instances.list',
      'redis.instances.get',

      // Cloud CDN (via LB config)
      'compute.backendServices.list',
      'compute.backendServices.get',
      'compute.urlMaps.list',
    ],
  }
}
