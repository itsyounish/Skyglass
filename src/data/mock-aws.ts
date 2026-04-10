import type { InfraNode, InfraEdge } from '../types'

export const awsNodes: InfraNode[] = [
  // Network
  { id: 'aws-vpc-prod', label: 'vpc-prod-useast1', provider: 'aws', type: 'vpc', category: 'network', region: 'us-east-1',
    metadata: { arn: 'arn:aws:ec2:us-east-1:847291035412:vpc/vpc-0a3f7c8e91b2d4567', cidr: '10.0.0.0/16', state: 'available', 'dns-hostnames': 'enabled', tenancy: 'default' },
    status: 'healthy', importance: 9 },
  { id: 'aws-sub-pub-1a', label: 'subnet-pub-1a', provider: 'aws', type: 'subnet', category: 'network', region: 'us-east-1', parent: 'aws-vpc-prod',
    metadata: { arn: 'arn:aws:ec2:us-east-1:847291035412:subnet/subnet-0b4e72f3a1c89d012', az: 'us-east-1a', cidr: '10.0.1.0/24', 'available-ips': '251', type: 'public' },
    status: 'healthy', importance: 5 },
  { id: 'aws-sub-priv-1b', label: 'subnet-priv-1b', provider: 'aws', type: 'subnet', category: 'network', region: 'us-east-1', parent: 'aws-vpc-prod',
    metadata: { arn: 'arn:aws:ec2:us-east-1:847291035412:subnet/subnet-0c5f83g4b2d90e123', az: 'us-east-1b', cidr: '10.0.10.0/24', 'available-ips': '248', type: 'private' },
    status: 'healthy', importance: 5 },
  { id: 'aws-sub-priv-1c', label: 'subnet-priv-1c', provider: 'aws', type: 'subnet', category: 'network', region: 'us-east-1', parent: 'aws-vpc-prod',
    metadata: { arn: 'arn:aws:ec2:us-east-1:847291035412:subnet/subnet-0d6g94h5c3e01f234', az: 'us-east-1c', cidr: '10.0.20.0/24', 'available-ips': '250', type: 'private' },
    status: 'healthy', importance: 4 },

  // Compute
  { id: 'aws-ec2-api-1', label: 'api-prod-001', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', parent: 'aws-sub-pub-1a',
    metadata: { arn: 'arn:aws:ec2:us-east-1:847291035412:instance/i-0abc123def456789a', instanceType: 'c6i.xlarge', ami: 'ami-0c55b159cbfafe1f0', privateIp: '10.0.1.42', state: 'running', launched: '2025-11-14T08:23:17Z', cost: '$124.10/mo', 'env': 'production', 'team': 'platform' },
    status: 'healthy', importance: 8 },
  { id: 'aws-ec2-api-2', label: 'api-prod-002', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', parent: 'aws-sub-pub-1a',
    metadata: { arn: 'arn:aws:ec2:us-east-1:847291035412:instance/i-0bcd234efg567890b', instanceType: 'c6i.xlarge', ami: 'ami-0c55b159cbfafe1f0', privateIp: '10.0.1.87', state: 'running', launched: '2025-11-14T08:23:19Z', cost: '$124.10/mo', 'env': 'production', 'team': 'platform' },
    status: 'healthy', importance: 8 },
  { id: 'aws-ec2-worker', label: 'worker-batch-001', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', parent: 'aws-sub-priv-1b',
    metadata: { arn: 'arn:aws:ec2:us-east-1:847291035412:instance/i-0cde345fgh678901c', instanceType: 'c5.4xlarge', ami: 'ami-0a1b2c3d4e5f67890', privateIp: '10.0.10.15', state: 'running', launched: '2026-01-20T14:11:03Z', cost: '$489.60/mo', cpuUtilization: '87%', 'env': 'production' },
    status: 'warning', importance: 7 },

  // Database
  { id: 'aws-rds-primary', label: 'postgres-prod-primary', provider: 'aws', type: 'rds', category: 'database', region: 'us-east-1', parent: 'aws-sub-priv-1b',
    metadata: { arn: 'arn:aws:rds:us-east-1:847291035412:db:postgres-prod-primary', engine: 'PostgreSQL 16.2', class: 'db.r6g.2xlarge', storage: '500 GB gp3', multiAZ: 'true', encrypted: 'true', endpoint: 'postgres-prod-primary.cx4r7b2hs3nk.us-east-1.rds.amazonaws.com:5432', connections: '142/500', cost: '$782.40/mo' },
    status: 'healthy', importance: 10 },
  { id: 'aws-rds-replica', label: 'postgres-prod-read', provider: 'aws', type: 'rds', category: 'database', region: 'us-east-1', parent: 'aws-sub-priv-1c',
    metadata: { arn: 'arn:aws:rds:us-east-1:847291035412:db:postgres-prod-read', engine: 'PostgreSQL 16.2', class: 'db.r6g.xlarge', role: 'read-replica', replicationLag: '12ms', connections: '89/200', cost: '$391.20/mo' },
    status: 'healthy', importance: 7 },

  // Serverless
  { id: 'aws-lambda-auth', label: 'auth-token-validator', provider: 'aws', type: 'lambda', category: 'serverless', region: 'us-east-1',
    metadata: { arn: 'arn:aws:lambda:us-east-1:847291035412:function:auth-token-validator', runtime: 'nodejs20.x', memory: '512 MB', timeout: '10s', invocations: '2.3M/mo', avgDuration: '45ms', errors: '0.02%', cost: '$18.40/mo' },
    status: 'healthy', importance: 7 },
  { id: 'aws-lambda-etl', label: 'data-pipeline-etl', provider: 'aws', type: 'lambda', category: 'serverless', region: 'us-east-1',
    metadata: { arn: 'arn:aws:lambda:us-east-1:847291035412:function:data-pipeline-etl', runtime: 'python3.12', memory: '2048 MB', timeout: '300s', invocations: '890K/mo', avgDuration: '4.2s', errors: '3.1%', lastError: 'TimeoutError: Task exceeded 300s', cost: '$142.80/mo' },
    status: 'error', importance: 6 },
  { id: 'aws-lambda-notif', label: 'notification-dispatch', provider: 'aws', type: 'lambda', category: 'serverless', region: 'us-east-1',
    metadata: { arn: 'arn:aws:lambda:us-east-1:847291035412:function:notification-dispatch', runtime: 'nodejs20.x', memory: '256 MB', invocations: '450K/mo', avgDuration: '120ms', cost: '$6.20/mo' },
    status: 'healthy', importance: 4 },

  // Storage
  { id: 'aws-s3-datalake', label: 'acme-data-lake-prod', provider: 'aws', type: 's3', category: 'storage', region: 'us-east-1',
    metadata: { arn: 'arn:aws:s3:::acme-data-lake-prod', size: '4.2 TB', objects: '12.4M', versioning: 'enabled', encryption: 'AES-256', lifecycle: '90d → Glacier', cost: '$96.60/mo' },
    status: 'healthy', importance: 8 },
  { id: 'aws-s3-assets', label: 'acme-static-assets', provider: 'aws', type: 's3', category: 'storage', region: 'us-east-1',
    metadata: { arn: 'arn:aws:s3:::acme-static-assets', size: '28.3 GB', objects: '45K', publicAccess: 'CloudFront OAI only', cost: '$0.65/mo' },
    status: 'healthy', importance: 4 },

  // CDN
  { id: 'aws-cf-dist', label: 'CloudFront d3k1m2n3o4p5q6', provider: 'aws', type: 'cloudfront', category: 'cdn', region: 'us-east-1',
    metadata: { arn: 'arn:aws:cloudfront::847291035412:distribution/E3K1M2N3O4P5Q6', domain: 'd3k1m2n3o4p5q6.cloudfront.net', origins: 'acme-static-assets, api-prod ALB', priceClass: 'PriceClass_100', requests: '45M/mo', bandwidth: '8.2 TB/mo', cost: '$186.00/mo', waf: 'enabled' },
    status: 'healthy', importance: 7 },

  // Container
  { id: 'aws-ecs-cluster', label: 'ecs-microservices-prod', provider: 'aws', type: 'ecs', category: 'container', region: 'us-east-1', parent: 'aws-sub-priv-1b',
    metadata: { arn: 'arn:aws:ecs:us-east-1:847291035412:cluster/microservices-prod', status: 'ACTIVE', services: '6', runningTasks: '18', pendingTasks: '0', capacityProviders: 'FARGATE, FARGATE_SPOT', cost: '$890.00/mo' },
    status: 'healthy', importance: 8 },

  // Security — Secrets Manager
  { id: 'aws-secret-db-creds', label: 'Secret: prod/db/primary-credentials', provider: 'aws', type: 'secretsmanager', category: 'security', region: 'us-east-1',
    metadata: { secretName: 'prod/db/primary-credentials', arn: 'arn:aws:secretsmanager:us-east-1:847291035412:secret:prod/db/primary-credentials-Xk9f2A', rotationEnabled: 'true', lastAccessedDate: '2026-03-28T00:00:00Z', description: 'RDS primary credentials' },
    status: 'healthy', importance: 7 },

  // Security — KMS
  { id: 'aws-kms-rds-key', label: 'KMS: rds-encryption-key', provider: 'aws', type: 'kms', category: 'security', region: 'us-east-1',
    metadata: { keyId: 'a1b2c3d4-5678-90ef-ghij-klmnopqrstuv', arn: 'arn:aws:kms:us-east-1:847291035412:key/a1b2c3d4-5678-90ef-ghij-klmnopqrstuv', keyState: 'Enabled', description: 'RDS data-at-rest encryption' },
    status: 'healthy', importance: 6 },

  // Container — ECR
  { id: 'aws-ecr-api', label: 'ECR: api-service', provider: 'aws', type: 'ecr', category: 'container', region: 'us-east-1',
    metadata: { repositoryName: 'api-service', repositoryUri: '847291035412.dkr.ecr.us-east-1.amazonaws.com/api-service', arn: 'arn:aws:ecr:us-east-1:847291035412:repository/api-service', imageTagMutability: 'IMMUTABLE', scanOnPush: 'true' },
    status: 'healthy', importance: 5 },

  // Analytics — Redshift
  { id: 'aws-redshift-analytics', label: 'Redshift: analytics-prod', provider: 'aws', type: 'redshift', category: 'analytics', region: 'us-east-1',
    metadata: { clusterIdentifier: 'analytics-prod', nodeType: 'ra3.xlplus', numberOfNodes: '4', status: 'available', dbName: 'analytics', endpoint: 'analytics-prod.cx4r7b2hs3nk.us-east-1.redshift.amazonaws.com:5439', vpcId: 'vpc-0a3f7c8e91b2d4567', encrypted: 'true', automatedSnapshotRetention: '7' },
    status: 'healthy', importance: 8 },

  // Analytics — CloudWatch Log Group
  { id: 'aws-cwlog-api-prod', label: 'Logs: /ecs/api-service-prod', provider: 'aws', type: 'cloudwatch-logs', category: 'analytics', region: 'us-east-1',
    metadata: { logGroupName: '/ecs/api-service-prod', arn: 'arn:aws:logs:us-east-1:847291035412:log-group:/ecs/api-service-prod:*', storedBytes: '2147483648', retentionDays: '30', metricFilterCount: '3' },
    status: 'healthy', importance: 4 },

  // ML — SageMaker Endpoint
  { id: 'aws-sagemaker-fraud', label: 'SageMaker: fraud-detection-v3', provider: 'aws', type: 'sagemaker', category: 'ml', region: 'us-east-1',
    metadata: { arn: 'arn:aws:sagemaker:us-east-1:847291035412:endpoint/fraud-detection-v3', endpointName: 'fraud-detection-v3', instanceType: 'ml.g5.xlarge', instanceCount: '2', status: 'InService', modelName: 'xgb-fraud-v3.2', p99Latency: '45ms', cost: '$680.00/mo' },
    status: 'healthy', importance: 8 },

  // ML — Bedrock
  { id: 'aws-bedrock-chatbot', label: 'Bedrock: customer-chatbot', provider: 'aws', type: 'bedrock', category: 'ml', region: 'us-east-1',
    metadata: { modelId: 'anthropic.claude-3-sonnet-20240229-v1:0', provisionedModelArn: 'arn:aws:bedrock:us-east-1:847291035412:provisioned-model/customer-chatbot', invocations: '850K/mo', avgTokens: '2,400', cost: '$1,200.00/mo' },
    status: 'healthy', importance: 7 },

  // IoT — IoT Core
  { id: 'aws-iot-fleet', label: 'IoT: warehouse-sensors', provider: 'aws', type: 'iot-core', category: 'iot', region: 'us-east-1',
    metadata: { thingGroupName: 'warehouse-sensors', thingCount: '2,450', protocol: 'MQTT', messagesPerDay: '12M', ruleActions: '4', cost: '$85.00/mo' },
    status: 'healthy', importance: 7 },

  // DevOps — CodePipeline
  { id: 'aws-pipeline-main', label: 'Pipeline: api-service-deploy', provider: 'aws', type: 'codepipeline', category: 'devops', region: 'us-east-1',
    metadata: { arn: 'arn:aws:codepipeline:us-east-1:847291035412:api-service-deploy', pipelineName: 'api-service-deploy', stages: '4 (Source, Build, Test, Deploy)', lastExecution: '2026-03-28T14:30:00Z', status: 'Succeeded' },
    status: 'healthy', importance: 6 },

  // DevOps — CloudFormation
  { id: 'aws-cfn-infra', label: 'CFn: acme-infra-stack', provider: 'aws', type: 'cloudformation', category: 'devops', region: 'us-east-1',
    metadata: { arn: 'arn:aws:cloudformation:us-east-1:847291035412:stack/acme-infra-stack', stackName: 'acme-infra-stack', status: 'UPDATE_COMPLETE', driftStatus: 'IN_SYNC', resources: '47', lastUpdated: '2026-03-15T10:00:00Z' },
    status: 'healthy', importance: 7 },

  // Management — CloudWatch Alarm
  { id: 'aws-cw-alarm-cpu', label: 'Alarm: api-high-cpu', provider: 'aws', type: 'cloudwatch', category: 'management', region: 'us-east-1',
    metadata: { alarmName: 'api-high-cpu', arn: 'arn:aws:cloudwatch:us-east-1:847291035412:alarm:api-high-cpu', metricName: 'CPUUtilization', threshold: '80%', comparisonOperator: 'GreaterThanThreshold', state: 'OK', actionsEnabled: 'true' },
    status: 'healthy', importance: 5 },

  // Management — Organizations
  { id: 'aws-org-root', label: 'Org: acme-corp', provider: 'aws', type: 'organizations', category: 'management', region: 'global',
    metadata: { orgId: 'o-abc123def4', masterAccountId: '847291035412', featureSet: 'ALL', accounts: '8', ous: '3' },
    status: 'healthy', importance: 6 },

  // Integration — AppSync
  { id: 'aws-appsync-api', label: 'AppSync: acme-graphql', provider: 'aws', type: 'appsync', category: 'integration', region: 'us-east-1',
    metadata: { apiId: 'xyz123abc456', name: 'acme-graphql', arn: 'arn:aws:appsync:us-east-1:847291035412:apis/xyz123abc456', authenticationType: 'AMAZON_COGNITO_USER_POOLS', resolvers: '42', queries: '1.2M/mo', cost: '$28.00/mo' },
    status: 'healthy', importance: 6 },

  // Integration — MSK
  { id: 'aws-msk-events', label: 'MSK: acme-events-cluster', provider: 'aws', type: 'msk', category: 'messaging', region: 'us-east-1',
    metadata: { clusterArn: 'arn:aws:kafka:us-east-1:847291035412:cluster/acme-events-cluster', clusterName: 'acme-events-cluster', brokerNodes: '3', instanceType: 'kafka.m5.large', kafkaVersion: '3.6.1', storage: '500 GB', topics: '18', cost: '$520.00/mo' },
    status: 'healthy', importance: 8 },

  // Security — WAF
  { id: 'aws-waf-api', label: 'WAF: api-web-acl', provider: 'aws', type: 'waf', category: 'security', region: 'us-east-1',
    metadata: { webAclArn: 'arn:aws:wafv2:us-east-1:847291035412:regional/webacl/api-web-acl', name: 'api-web-acl', rules: '8', defaultAction: 'Allow', blockedRequests24h: '12,456', cost: '$15.00/mo' },
    status: 'healthy', importance: 7 },

  // Security — GuardDuty
  { id: 'aws-guardduty-det', label: 'GuardDuty: main-detector', provider: 'aws', type: 'guardduty', category: 'security', region: 'us-east-1',
    metadata: { detectorId: 'abc123def456', status: 'ENABLED', findingPublishingFrequency: 'FIFTEEN_MINUTES', s3LogsEnabled: 'true', dnsLogsEnabled: 'true', activeFindingsCount: '3' },
    status: 'healthy', importance: 6 },

  // Security — ACM Certificate
  { id: 'aws-acm-wildcard', label: 'ACM: *.acme.com', provider: 'aws', type: 'acm', category: 'security', region: 'us-east-1',
    metadata: { arn: 'arn:aws:acm:us-east-1:847291035412:certificate/abc-123-def', domainName: '*.acme.com', status: 'ISSUED', type: 'AMAZON_ISSUED', renewalEligibility: 'ELIGIBLE', notAfter: '2027-01-15T00:00:00Z' },
    status: 'healthy', importance: 5 },

  // Security — Cognito
  { id: 'aws-cognito-users', label: 'Cognito: acme-user-pool', provider: 'aws', type: 'cognito', category: 'security', region: 'us-east-1',
    metadata: { userPoolId: 'us-east-1_AbCdEfGhI', name: 'acme-user-pool', estimatedUsers: '125,000', mfaConfiguration: 'OPTIONAL', signInAliases: 'email', cost: '$6.25/mo' },
    status: 'healthy', importance: 7 },

  // Analytics — Glue
  { id: 'aws-glue-catalog', label: 'Glue: acme-data-catalog', provider: 'aws', type: 'glue', category: 'analytics', region: 'us-east-1',
    metadata: { databaseName: 'acme-data-catalog', tables: '85', crawlers: '6', etlJobs: '12', lastCrawl: '2026-03-28T02:00:00Z', cost: '$45.00/mo' },
    status: 'healthy', importance: 7 },

  // Analytics — Athena
  { id: 'aws-athena-prod', label: 'Athena: prod-workgroup', provider: 'aws', type: 'athena', category: 'analytics', region: 'us-east-1',
    metadata: { workGroupName: 'prod-workgroup', state: 'ENABLED', outputLocation: 's3://acme-athena-results/', bytesScannedLimit: '10 TB', queriesLast30d: '4,500', cost: '$52.00/mo' },
    status: 'healthy', importance: 6 },

  // Media — MediaConvert
  { id: 'aws-mc-queue', label: 'MediaConvert: default-queue', provider: 'aws', type: 'mediaconvert', category: 'media', region: 'us-east-1',
    metadata: { name: 'default-queue', arn: 'arn:aws:mediaconvert:us-east-1:847291035412:queues/Default', status: 'ACTIVE', pricingPlan: 'ON_DEMAND', jobsProcessed: '8,500/mo', cost: '$320.00/mo' },
    status: 'healthy', importance: 5 },

  // Migration — DMS
  { id: 'aws-dms-oracle', label: 'DMS: oracle-to-rds', provider: 'aws', type: 'dms', category: 'migration', region: 'us-east-1',
    metadata: { replicationInstanceArn: 'arn:aws:dms:us-east-1:847291035412:rep:oracle-to-rds', instanceClass: 'dms.r5.xlarge', engineVersion: '3.5.2', allocatedStorage: '100 GB', replicationStatus: 'running', migrationType: 'full-load-and-cdc', tablesLoaded: '142', cost: '$260.00/mo' },
    status: 'healthy', importance: 6 },

  // Database — Neptune
  { id: 'aws-neptune-social', label: 'Neptune: social-graph', provider: 'aws', type: 'neptune', category: 'database', region: 'us-east-1',
    metadata: { clusterId: 'social-graph', engine: 'neptune', engineVersion: '1.3.1.0', instanceClass: 'db.r6g.xlarge', status: 'available', storageSize: '45 GB', endpoint: 'social-graph.cluster-cx4r7b2hs3nk.us-east-1.neptune.amazonaws.com:8182', cost: '$420.00/mo' },
    status: 'healthy', importance: 7 },

  // Database — OpenSearch
  { id: 'aws-opensearch-logs', label: 'OpenSearch: app-logs', provider: 'aws', type: 'opensearch', category: 'database', region: 'us-east-1',
    metadata: { domainName: 'app-logs', arn: 'arn:aws:es:us-east-1:847291035412:domain/app-logs', engineVersion: 'OpenSearch_2.11', instanceType: 'r6g.large.search', instanceCount: '3', storageType: 'EBS gp3', storageSize: '500 GB', cost: '$485.00/mo' },
    status: 'healthy', importance: 7 },

  // Network — Direct Connect
  { id: 'aws-dx-onprem', label: 'DX: dc-acme-office', provider: 'aws', type: 'directconnect', category: 'network', region: 'us-east-1',
    metadata: { connectionId: 'dxcon-abc123', connectionName: 'dc-acme-office', bandwidth: '1 Gbps', location: 'Equinix DC6', state: 'available', vlanId: '101', cost: '$220.00/mo' },
    status: 'healthy', importance: 7 },

  // Network — Transit Gateway
  { id: 'aws-tgw-hub', label: 'TGW: central-hub', provider: 'aws', type: 'transitgateway', category: 'network', region: 'us-east-1',
    metadata: { transitGatewayId: 'tgw-abc123def456', ownerId: '847291035412', state: 'available', attachments: '4', routeTables: '2', cidrBlocks: '10.0.0.0/8', cost: '$36.00/mo' },
    status: 'healthy', importance: 7 },

  // Compute — Auto Scaling
  { id: 'aws-asg-api', label: 'ASG: api-fleet', provider: 'aws', type: 'autoscaling', category: 'compute', region: 'us-east-1',
    metadata: { autoScalingGroupName: 'api-fleet', minSize: '2', maxSize: '10', desiredCapacity: '4', instances: '4', healthCheckType: 'ELB', launchTemplate: 'lt-api-prod-v8' },
    status: 'healthy', importance: 6 },

  // Container — EKS
  { id: 'aws-eks-platform', label: 'EKS: platform-prod', provider: 'aws', type: 'eks', category: 'container', region: 'us-east-1',
    metadata: { clusterName: 'platform-prod', arn: 'arn:aws:eks:us-east-1:847291035412:cluster/platform-prod', k8sVersion: '1.30', status: 'ACTIVE', nodeGroups: '3', nodes: '12', endpoint: 'https://ABC.yl4.us-east-1.eks.amazonaws.com', cost: '$730.00/mo' },
    status: 'healthy', importance: 9 },

  // Messaging — SQS
  { id: 'aws-sqs-orders', label: 'SQS: order-processing', provider: 'aws', type: 'sqs', category: 'messaging', region: 'us-east-1',
    metadata: { queueUrl: 'https://sqs.us-east-1.amazonaws.com/847291035412/order-processing', queueName: 'order-processing', messagesVisible: '42', messagesInFlight: '8', retentionPeriod: '14 days', cost: '$2.40/mo' },
    status: 'healthy', importance: 6 },

  // Messaging — SNS
  { id: 'aws-sns-alerts', label: 'SNS: infra-alerts', provider: 'aws', type: 'sns', category: 'messaging', region: 'us-east-1',
    metadata: { arn: 'arn:aws:sns:us-east-1:847291035412:infra-alerts', topicName: 'infra-alerts', subscriptions: '5', messagesPublished: '45K/mo' },
    status: 'healthy', importance: 5 },

  // Storage — EFS
  { id: 'aws-efs-shared', label: 'EFS: shared-data', provider: 'aws', type: 'efs', category: 'storage', region: 'us-east-1',
    metadata: { fileSystemId: 'fs-abc123def', name: 'shared-data', sizeBytes: '512000000000', performanceMode: 'generalPurpose', throughputMode: 'elastic', encrypted: 'true', mountTargets: '3', cost: '$42.00/mo' },
    status: 'healthy', importance: 5 },
]

export const awsEdges: InfraEdge[] = [
  { id: 'ae-1', source: 'aws-cf-dist', target: 'aws-s3-assets', type: 'data', label: 'static content origin' },
  { id: 'ae-2', source: 'aws-cf-dist', target: 'aws-ec2-api-1', type: 'network', label: 'API origin' },
  { id: 'ae-3', source: 'aws-ec2-api-1', target: 'aws-rds-primary', type: 'data', label: 'SQL queries' },
  { id: 'ae-4', source: 'aws-ec2-api-2', target: 'aws-rds-primary', type: 'data', label: 'SQL queries' },
  { id: 'ae-5', source: 'aws-ec2-api-1', target: 'aws-rds-replica', type: 'data', label: 'read queries' },
  { id: 'ae-6', source: 'aws-rds-primary', target: 'aws-rds-replica', type: 'data', label: 'replication' },
  { id: 'ae-7', source: 'aws-ec2-worker', target: 'aws-s3-datalake', type: 'data', label: 'ETL writes' },
  { id: 'ae-8', source: 'aws-lambda-auth', target: 'aws-rds-primary', type: 'dependency', label: 'token validation' },
  { id: 'ae-9', source: 'aws-lambda-etl', target: 'aws-s3-datalake', type: 'data', label: 'transform & load' },
  { id: 'ae-10', source: 'aws-ec2-api-1', target: 'aws-lambda-auth', type: 'dependency', label: 'invoke auth' },
  { id: 'ae-11', source: 'aws-ec2-api-1', target: 'aws-ec2-api-2', type: 'network', label: 'ALB load balance' },
  { id: 'ae-12', source: 'aws-lambda-notif', target: 'aws-ec2-api-1', type: 'dependency', label: 'webhook callback' },
  { id: 'ae-13', source: 'aws-ecs-cluster', target: 'aws-rds-primary', type: 'data', label: 'microservice queries' },
  { id: 'ae-14', source: 'aws-ecs-cluster', target: 'aws-s3-datalake', type: 'data', label: 'artifact storage' },
  { id: 'ae-15', source: 'aws-ec2-api-1', target: 'aws-ecs-cluster', type: 'network', label: 'service mesh' },

  // New edges for added services
  { id: 'ae-16', source: 'aws-rds-primary', target: 'aws-secret-db-creds', type: 'dependency', label: 'credentials' },
  { id: 'ae-17', source: 'aws-rds-primary', target: 'aws-kms-rds-key', type: 'dependency', label: 'encryption key' },
  { id: 'ae-18', source: 'aws-ecs-cluster', target: 'aws-ecr-api', type: 'dependency', label: 'image pull' },
  { id: 'ae-19', source: 'aws-lambda-etl', target: 'aws-redshift-analytics', type: 'data', label: 'load analytics' },
  { id: 'ae-20', source: 'aws-redshift-analytics', target: 'aws-s3-datalake', type: 'data', label: 'COPY from S3' },
  { id: 'ae-21', source: 'aws-ecs-cluster', target: 'aws-cwlog-api-prod', type: 'data', label: 'log output' },

  // ML edges
  { id: 'ae-22', source: 'aws-ec2-api-1', target: 'aws-sagemaker-fraud', type: 'dependency', label: 'fraud scoring' },
  { id: 'ae-23', source: 'aws-bedrock-chatbot', target: 'aws-rds-primary', type: 'data', label: 'RAG context' },
  { id: 'ae-24', source: 'aws-ec2-api-1', target: 'aws-bedrock-chatbot', type: 'dependency', label: 'chat inference' },

  // IoT edges
  { id: 'ae-25', source: 'aws-iot-fleet', target: 'aws-lambda-etl', type: 'data', label: 'sensor data ingest' },
  { id: 'ae-26', source: 'aws-iot-fleet', target: 'aws-s3-datalake', type: 'data', label: 'raw telemetry' },

  // DevOps edges
  { id: 'ae-27', source: 'aws-pipeline-main', target: 'aws-ecs-cluster', type: 'dependency', label: 'deploy target' },
  { id: 'ae-28', source: 'aws-pipeline-main', target: 'aws-ecr-api', type: 'dependency', label: 'push image' },
  { id: 'ae-29', source: 'aws-cfn-infra', target: 'aws-vpc-prod', type: 'dependency', label: 'manages' },

  // Management edges
  { id: 'ae-30', source: 'aws-cw-alarm-cpu', target: 'aws-ec2-api-1', type: 'dependency', label: 'monitors' },
  { id: 'ae-31', source: 'aws-cw-alarm-cpu', target: 'aws-sns-alerts', type: 'dependency', label: 'alarm action' },

  // Integration edges
  { id: 'ae-32', source: 'aws-appsync-api', target: 'aws-rds-primary', type: 'data', label: 'GraphQL resolver' },
  { id: 'ae-33', source: 'aws-appsync-api', target: 'aws-cognito-users', type: 'dependency', label: 'auth' },
  { id: 'ae-34', source: 'aws-msk-events', target: 'aws-lambda-etl', type: 'data', label: 'stream consumer' },

  // Security edges
  { id: 'ae-35', source: 'aws-waf-api', target: 'aws-cf-dist', type: 'dependency', label: 'protects' },
  { id: 'ae-36', source: 'aws-acm-wildcard', target: 'aws-cf-dist', type: 'dependency', label: 'TLS cert' },

  // Analytics edges
  { id: 'ae-37', source: 'aws-glue-catalog', target: 'aws-s3-datalake', type: 'data', label: 'crawl source' },
  { id: 'ae-38', source: 'aws-athena-prod', target: 'aws-glue-catalog', type: 'dependency', label: 'query catalog' },
  { id: 'ae-39', source: 'aws-athena-prod', target: 'aws-s3-datalake', type: 'data', label: 'scan data' },

  // Database edges
  { id: 'ae-40', source: 'aws-ec2-api-1', target: 'aws-opensearch-logs', type: 'data', label: 'search queries' },
  { id: 'ae-41', source: 'aws-neptune-social', target: 'aws-ec2-api-1', type: 'data', label: 'graph queries' },

  // Network edges
  { id: 'ae-42', source: 'aws-dx-onprem', target: 'aws-tgw-hub', type: 'network', label: 'hybrid link' },
  { id: 'ae-43', source: 'aws-tgw-hub', target: 'aws-vpc-prod', type: 'network', label: 'attachment' },

  // Compute edges
  { id: 'ae-44', source: 'aws-asg-api', target: 'aws-ec2-api-1', type: 'dependency', label: 'manages' },
  { id: 'ae-45', source: 'aws-asg-api', target: 'aws-ec2-api-2', type: 'dependency', label: 'manages' },

  // Container edges
  { id: 'ae-46', source: 'aws-eks-platform', target: 'aws-rds-primary', type: 'data', label: 'k8s workloads' },
  { id: 'ae-47', source: 'aws-eks-platform', target: 'aws-ecr-api', type: 'dependency', label: 'image pull' },

  // Migration edges
  { id: 'ae-48', source: 'aws-dms-oracle', target: 'aws-rds-primary', type: 'data', label: 'migration target' },

  // Messaging edges
  { id: 'ae-49', source: 'aws-ec2-api-1', target: 'aws-sqs-orders', type: 'data', label: 'enqueue orders' },
  { id: 'ae-50', source: 'aws-sqs-orders', target: 'aws-ecs-cluster', type: 'data', label: 'process orders' },

  // Media edges
  { id: 'ae-51', source: 'aws-mc-queue', target: 'aws-s3-assets', type: 'data', label: 'output files' },
]
