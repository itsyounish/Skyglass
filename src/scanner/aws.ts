/**
 * AWS Infrastructure Scanner
 *
 * Scans real AWS resources using AWS SDK v3 and maps them to InfraNode/InfraEdge.
 * Uses the default credential chain (env vars, ~/.aws/credentials, IAM role, etc.)
 */

import type { InfraNode, InfraEdge, InfraGraph, HealthStatus } from '../types'

// ---------------------------------------------------------------------------
// Cost estimation helpers (rough on-demand monthly estimates)
// ---------------------------------------------------------------------------
const EC2_COST_MAP: Record<string, string> = {
  't3.nano': '$3.80/mo', 't3.micro': '$7.60/mo', 't3.small': '$15.20/mo',
  't3.medium': '$30.40/mo', 't3.large': '$60.70/mo', 't3.xlarge': '$121.50/mo',
  't3.2xlarge': '$243.00/mo', 'm5.large': '$70.00/mo', 'm5.xlarge': '$140.00/mo',
  'm5.2xlarge': '$280.00/mo', 'c5.large': '$62.00/mo', 'c5.xlarge': '$124.00/mo',
  'c5.2xlarge': '$248.00/mo', 'r5.large': '$91.00/mo', 'r5.xlarge': '$182.00/mo',
  'r5.2xlarge': '$364.00/mo',
}

const RDS_COST_MAP: Record<string, string> = {
  'db.t3.micro': '$12.50/mo', 'db.t3.small': '$25.00/mo', 'db.t3.medium': '$50.00/mo',
  'db.r6g.large': '$188.00/mo', 'db.r6g.xlarge': '$376.00/mo', 'db.r6g.2xlarge': '$752.00/mo',
  'db.m5.large': '$125.00/mo', 'db.m5.xlarge': '$250.00/mo',
}

function ec2Health(state: string | undefined): HealthStatus {
  if (!state) return 'warning'
  const s = state.toLowerCase()
  if (s === 'running') return 'healthy'
  if (s === 'stopped' || s === 'stopping') return 'warning'
  return 'error'
}

function rdsHealth(status: string | undefined): HealthStatus {
  if (!status) return 'warning'
  const s = status.toLowerCase()
  if (s === 'available') return 'healthy'
  if (s === 'creating' || s === 'modifying' || s === 'backing-up') return 'warning'
  return 'error'
}

function lambdaHealth(state: string | undefined): HealthStatus {
  if (!state) return 'healthy' // Lambda is "Active" by default
  const s = state.toLowerCase()
  if (s === 'active') return 'healthy'
  if (s === 'pending') return 'warning'
  return 'error'
}

function tagsToRecord(tags: Array<{ Key?: string; Value?: string }> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!tags) return out
  for (const t of tags) {
    if (t.Key) out[t.Key] = t.Value ?? ''
  }
  return out
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

export async function scanAWS(region: string): Promise<InfraGraph> {
  const nodes: InfraNode[] = []
  const edges: InfraEdge[] = []

  // We use dynamic imports so Vite never tries to bundle these server-only SDKs
  const [
    { EC2Client, DescribeInstancesCommand, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand },
    { RDSClient, DescribeDBInstancesCommand },
    { LambdaClient, ListFunctionsCommand },
    { S3Client, ListBucketsCommand },
    { CloudFrontClient, ListDistributionsCommand },
    { ECSClient, ListClustersCommand, DescribeClustersCommand },
    { EKSClient, ListClustersCommand: EKSListClustersCommand, DescribeClusterCommand },
  ] = await Promise.all([
    import('@aws-sdk/client-ec2'),
    import('@aws-sdk/client-rds'),
    import('@aws-sdk/client-lambda'),
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/client-cloudfront'),
    import('@aws-sdk/client-ecs'),
    import('@aws-sdk/client-eks'),
  ])

  const ec2 = new EC2Client({ region })
  const rds = new RDSClient({ region })
  const lambda = new LambdaClient({ region })
  const s3 = new S3Client({ region })
  const cloudfront = new CloudFrontClient({ region })
  const ecs = new ECSClient({ region })
  const eks = new EKSClient({ region })

  // Track security group -> instance mappings for edge detection
  const sgToInstances: Record<string, string[]> = {}
  const subnetIdToNodeId: Record<string, string> = {}
  const vpcIdToNodeId: Record<string, string> = {}
  // envVarValues is held only in memory for edge detection (S3/RDS references)
  // and is never written to node metadata or graph.json. See §5 + §S3/RDS edge pass.
  const lambdaFunctions: Array<{ nodeId: string; envVarValues: string[]; layers: string[] }> = []
  const s3BucketNames: string[] = []
  const s3NodeIds: Record<string, string> = {}
  const ec2NodeIds: string[] = []
  const rdsNodeIds: string[] = []
  const rdsEndpoints: Record<string, string> = {} // endpoint -> nodeId
  const cloudfrontDistributions: Array<{ nodeId: string; origins: string[] }> = []

  // -----------------------------------------------------------------------
  // 1. VPCs
  // -----------------------------------------------------------------------
  try {
    let nextToken: string | undefined
    do {
      const res = await ec2.send(new DescribeVpcsCommand({ NextToken: nextToken }))
      for (const vpc of res.Vpcs ?? []) {
        const vpcId = vpc.VpcId ?? 'unknown'
        const nodeId = `aws-vpc-${vpcId}`
        const tags = tagsToRecord(vpc.Tags)
        const label = tags['Name'] || vpcId

        vpcIdToNodeId[vpcId] = nodeId

        nodes.push({
          id: nodeId,
          label,
          provider: 'aws',
          type: 'vpc',
          category: 'network',
          region,
          metadata: {
            arn: `arn:aws:ec2:${region}:${vpc.OwnerId}:vpc/${vpcId}`,
            vpcId,
            cidr: vpc.CidrBlock ?? '',
            state: vpc.State ?? '',
            isDefault: String(vpc.IsDefault ?? false),
            ...tags,
          },
          status: vpc.State === 'available' ? 'healthy' : 'warning',
          importance: 8,
        })
      }
      nextToken = res.NextToken
    } while (nextToken)
  } catch (err: any) {
    console.warn(`[AWS Scanner] VPC scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 2. Subnets
  // -----------------------------------------------------------------------
  try {
    let nextToken: string | undefined
    do {
      const res = await ec2.send(new DescribeSubnetsCommand({ NextToken: nextToken }))
      for (const subnet of res.Subnets ?? []) {
        const subnetId = subnet.SubnetId ?? 'unknown'
        const nodeId = `aws-subnet-${subnetId}`
        const tags = tagsToRecord(subnet.Tags)
        const label = tags['Name'] || subnetId
        const parentVpc = subnet.VpcId ? vpcIdToNodeId[subnet.VpcId] : undefined

        subnetIdToNodeId[subnetId] = nodeId

        nodes.push({
          id: nodeId,
          label,
          provider: 'aws',
          type: 'subnet',
          category: 'network',
          region,
          parent: parentVpc,
          metadata: {
            arn: subnet.SubnetArn ?? '',
            subnetId,
            cidr: subnet.CidrBlock ?? '',
            az: subnet.AvailabilityZone ?? '',
            mapPublicIp: String(subnet.MapPublicIpOnLaunch ?? false),
            availableIps: String(subnet.AvailableIpAddressCount ?? 0),
            ...tags,
          },
          status: subnet.State === 'available' ? 'healthy' : 'warning',
          importance: 4,
        })
      }
      nextToken = res.NextToken
    } while (nextToken)
  } catch (err: any) {
    console.warn(`[AWS Scanner] Subnet scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 3. EC2 Instances
  // -----------------------------------------------------------------------
  try {
    let nextToken: string | undefined
    do {
      const res = await ec2.send(new DescribeInstancesCommand({ NextToken: nextToken }))
      for (const reservation of res.Reservations ?? []) {
        for (const inst of reservation.Instances ?? []) {
          const instanceId = inst.InstanceId ?? 'unknown'
          const nodeId = `aws-ec2-${instanceId}`
          const tags = tagsToRecord(inst.Tags)
          const label = tags['Name'] || instanceId
          const instanceType = inst.InstanceType ?? 'unknown'
          const parentSubnet = inst.SubnetId ? subnetIdToNodeId[inst.SubnetId] : undefined

          ec2NodeIds.push(nodeId)

          // Track security group memberships
          for (const sg of inst.SecurityGroups ?? []) {
            const sgId = sg.GroupId ?? ''
            if (!sgToInstances[sgId]) sgToInstances[sgId] = []
            sgToInstances[sgId].push(nodeId)
          }

          nodes.push({
            id: nodeId,
            label,
            provider: 'aws',
            type: 'ec2',
            category: 'compute',
            region,
            parent: parentSubnet,
            metadata: {
              arn: `arn:aws:ec2:${region}:${reservation.OwnerId}:instance/${instanceId}`,
              instanceId,
              instanceType,
              state: inst.State?.Name ?? '',
              privateIp: inst.PrivateIpAddress ?? '',
              publicIp: inst.PublicIpAddress ?? '',
              ami: inst.ImageId ?? '',
              launchTime: inst.LaunchTime?.toISOString() ?? '',
              cost: EC2_COST_MAP[instanceType] ?? 'N/A',
              platform: inst.PlatformDetails ?? 'Linux/UNIX',
              vpcId: inst.VpcId ?? '',
              subnetId: inst.SubnetId ?? '',
              ...tags,
            },
            status: ec2Health(inst.State?.Name),
            importance: 7,
          })
        }
      }
      nextToken = res.NextToken
    } while (nextToken)
  } catch (err: any) {
    console.warn(`[AWS Scanner] EC2 scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 4. RDS Instances
  // -----------------------------------------------------------------------
  try {
    let marker: string | undefined
    do {
      const res = await rds.send(new DescribeDBInstancesCommand({ Marker: marker }))
      for (const db of res.DBInstances ?? []) {
        const dbId = db.DBInstanceIdentifier ?? 'unknown'
        const nodeId = `aws-rds-${dbId}`
        const dbClass = db.DBInstanceClass ?? 'unknown'

        rdsNodeIds.push(nodeId)

        // Track endpoint for edge detection
        if (db.Endpoint?.Address) {
          rdsEndpoints[db.Endpoint.Address] = nodeId
        }

        // Find parent subnet group
        let parent: string | undefined
        if (db.DBSubnetGroup?.Subnets?.[0]?.SubnetIdentifier) {
          parent = subnetIdToNodeId[db.DBSubnetGroup.Subnets[0].SubnetIdentifier]
        }

        // Track security groups for edge detection with EC2
        for (const vpcSg of db.VpcSecurityGroups ?? []) {
          const sgId = vpcSg.VpcSecurityGroupId ?? ''
          if (sgToInstances[sgId]) {
            // EC2 instances in the same SG can reach this RDS
            for (const ec2NodeId of sgToInstances[sgId]) {
              edges.push({
                id: `edge-${ec2NodeId}-${nodeId}`,
                source: ec2NodeId,
                target: nodeId,
                type: 'data',
                label: 'DB connection (shared SG)',
              })
            }
          }
        }

        nodes.push({
          id: nodeId,
          label: dbId,
          provider: 'aws',
          type: 'rds',
          category: 'database',
          region,
          parent,
          metadata: {
            arn: db.DBInstanceArn ?? '',
            dbInstanceId: dbId,
            engine: `${db.Engine ?? ''} ${db.EngineVersion ?? ''}`.trim(),
            class: dbClass,
            storage: `${db.AllocatedStorage ?? 0} GB`,
            multiAz: String(db.MultiAZ ?? false),
            endpoint: db.Endpoint?.Address ?? '',
            port: String(db.Endpoint?.Port ?? ''),
            status: db.DBInstanceStatus ?? '',
            storageType: db.StorageType ?? '',
            encrypted: String(db.StorageEncrypted ?? false),
            cost: RDS_COST_MAP[dbClass] ?? 'N/A',
          },
          status: rdsHealth(db.DBInstanceStatus),
          importance: 9,
        })
      }
      marker = res.Marker
    } while (marker)
  } catch (err: any) {
    console.warn(`[AWS Scanner] RDS scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 5. Lambda Functions
  // -----------------------------------------------------------------------
  try {
    let marker: string | undefined
    do {
      const res = await lambda.send(new ListFunctionsCommand({ Marker: marker }))
      for (const fn of res.Functions ?? []) {
        const fnName = fn.FunctionName ?? 'unknown'
        const nodeId = `aws-lambda-${fnName}`
        const envVars = fn.Environment?.Variables ?? {}
        const layers = (fn.Layers ?? []).map((l: any) => l.Arn ?? '')

        // Values are held in memory ONLY to detect cross-resource references
        // (e.g. an env var containing an S3 bucket name or RDS endpoint). They
        // are never placed in node.metadata and never written to graph.json.
        lambdaFunctions.push({ nodeId, envVarValues: Object.values(envVars), layers })

        nodes.push({
          id: nodeId,
          label: fnName,
          provider: 'aws',
          type: 'lambda',
          category: 'serverless',
          region,
          metadata: {
            arn: fn.FunctionArn ?? '',
            functionName: fnName,
            runtime: fn.Runtime ?? '',
            handler: fn.Handler ?? '',
            memory: `${fn.MemorySize ?? 128} MB`,
            timeout: `${fn.Timeout ?? 3}s`,
            codeSize: `${Math.round((fn.CodeSize ?? 0) / 1024)} KB`,
            lastModified: fn.LastModified ?? '',
            state: fn.State ?? 'Active',
          },
          status: lambdaHealth(fn.State),
          importance: 6,
        })
      }
      marker = res.NextMarker
    } while (marker)
  } catch (err: any) {
    console.warn(`[AWS Scanner] Lambda scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 6. S3 Buckets
  // -----------------------------------------------------------------------
  try {
    const res = await s3.send(new ListBucketsCommand({}))
    for (const bucket of res.Buckets ?? []) {
      const bucketName = bucket.Name ?? 'unknown'
      const nodeId = `aws-s3-${bucketName}`
      s3BucketNames.push(bucketName)
      s3NodeIds[bucketName] = nodeId

      nodes.push({
        id: nodeId,
        label: bucketName,
        provider: 'aws',
        type: 's3',
        category: 'storage',
        region,
        metadata: {
          arn: `arn:aws:s3:::${bucketName}`,
          bucketName,
          creationDate: bucket.CreationDate?.toISOString() ?? '',
        },
        status: 'healthy',
        importance: 6,
      })
    }
  } catch (err: any) {
    console.warn(`[AWS Scanner] S3 scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 7. CloudFront Distributions
  // -----------------------------------------------------------------------
  try {
    let marker: string | undefined
    do {
      const res = await cloudfront.send(new ListDistributionsCommand({ Marker: marker }))
      const list = res.DistributionList
      for (const dist of list?.Items ?? []) {
        const distId = dist.Id ?? 'unknown'
        const nodeId = `aws-cf-${distId}`

        const origins: string[] = []
        for (const origin of dist.Origins?.Items ?? []) {
          origins.push(origin.DomainName ?? '')
        }

        cloudfrontDistributions.push({ nodeId, origins })

        nodes.push({
          id: nodeId,
          label: dist.DomainName ?? distId,
          provider: 'aws',
          type: 'cloudfront',
          category: 'cdn',
          region: 'global',
          metadata: {
            arn: dist.ARN ?? '',
            distributionId: distId,
            domainName: dist.DomainName ?? '',
            status: dist.Status ?? '',
            enabled: String(dist.Enabled ?? false),
            origins: origins.join(', '),
            priceClass: dist.PriceClass ?? '',
            httpVersion: dist.HttpVersion ?? '',
          },
          status: dist.Status === 'Deployed' ? 'healthy' : 'warning',
          importance: 7,
        })
      }
      marker = list?.NextMarker
      if (!list?.IsTruncated) break
    } while (marker)
  } catch (err: any) {
    console.warn(`[AWS Scanner] CloudFront scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 8. ECS Clusters
  // -----------------------------------------------------------------------
  try {
    let nextToken: string | undefined
    const allClusterArns: string[] = []
    do {
      const res = await ecs.send(new ListClustersCommand({ nextToken }))
      allClusterArns.push(...(res.clusterArns ?? []))
      nextToken = res.nextToken
    } while (nextToken)

    if (allClusterArns.length > 0) {
      // DescribeClusters accepts max 100 at a time
      for (let i = 0; i < allClusterArns.length; i += 100) {
        const batch = allClusterArns.slice(i, i + 100)
        const res = await ecs.send(new DescribeClustersCommand({ clusters: batch }))
        for (const cluster of res.clusters ?? []) {
          const clusterName = cluster.clusterName ?? 'unknown'
          const nodeId = `aws-ecs-${clusterName}`

          nodes.push({
            id: nodeId,
            label: `ECS: ${clusterName}`,
            provider: 'aws',
            type: 'ecs',
            category: 'container',
            region,
            metadata: {
              arn: cluster.clusterArn ?? '',
              clusterName,
              status: cluster.status ?? '',
              runningTasks: String(cluster.runningTasksCount ?? 0),
              pendingTasks: String(cluster.pendingTasksCount ?? 0),
              services: String(cluster.activeServicesCount ?? 0),
              registeredInstances: String(cluster.registeredContainerInstancesCount ?? 0),
            },
            status: cluster.status === 'ACTIVE' ? 'healthy' : 'warning',
            importance: 8,
          })
        }
      }
    }
  } catch (err: any) {
    console.warn(`[AWS Scanner] ECS scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 9. EKS Clusters
  // -----------------------------------------------------------------------
  try {
    let nextToken: string | undefined
    const allClusterNames: string[] = []
    do {
      const res = await eks.send(new EKSListClustersCommand({ nextToken }))
      allClusterNames.push(...(res.clusters ?? []))
      nextToken = res.nextToken
    } while (nextToken)

    for (const clusterName of allClusterNames) {
      try {
        const res = await eks.send(new DescribeClusterCommand({ name: clusterName }))
        const cluster = res.cluster
        if (!cluster) continue

        const nodeId = `aws-eks-${clusterName}`

        // Find parent VPC
        const vpcId = cluster.resourcesVpcConfig?.vpcId
        const parent = vpcId ? vpcIdToNodeId[vpcId] : undefined

        nodes.push({
          id: nodeId,
          label: `EKS: ${clusterName}`,
          provider: 'aws',
          type: 'eks',
          category: 'container',
          region,
          parent,
          metadata: {
            arn: cluster.arn ?? '',
            clusterName,
            version: cluster.version ?? '',
            status: cluster.status ?? '',
            endpoint: cluster.endpoint ?? '',
            platformVersion: cluster.platformVersion ?? '',
            createdAt: cluster.createdAt?.toISOString() ?? '',
          },
          status: cluster.status === 'ACTIVE' ? 'healthy' : 'warning',
          importance: 9,
        })
      } catch (descErr: any) {
        console.warn(`[AWS Scanner] EKS describe failed for ${clusterName}: ${descErr.message}`)
      }
    }
  } catch (err: any) {
    console.warn(`[AWS Scanner] EKS scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // Edge detection: Lambda -> S3 (via env vars referencing bucket names)
  // -----------------------------------------------------------------------
  for (const fn of lambdaFunctions) {
    // Check if Lambda env vars reference any S3 bucket
    const envValues = fn.envVarValues.join(' ')
    for (const bucketName of s3BucketNames) {
      if (envValues.includes(bucketName)) {
        const targetNodeId = s3NodeIds[bucketName]
        if (targetNodeId) {
          edges.push({
            id: `edge-${fn.nodeId}-${targetNodeId}`,
            source: fn.nodeId,
            target: targetNodeId,
            type: 'data',
            label: 'S3 access (env var)',
          })
        }
      }
    }
    // Check if Lambda env vars reference any RDS endpoint
    for (const [endpoint, rdsNodeId] of Object.entries(rdsEndpoints)) {
      if (envValues.includes(endpoint)) {
        edges.push({
          id: `edge-${fn.nodeId}-${rdsNodeId}`,
          source: fn.nodeId,
          target: rdsNodeId,
          type: 'data',
          label: 'DB connection (env var)',
        })
      }
    }
  }

  // -----------------------------------------------------------------------
  // Edge detection: CloudFront -> S3 / EC2 (via origin domain names)
  // -----------------------------------------------------------------------
  for (const dist of cloudfrontDistributions) {
    for (const origin of dist.origins) {
      // S3 origin: <bucket>.s3.amazonaws.com or <bucket>.s3.<region>.amazonaws.com
      const s3Match = origin.match(/^(.+)\.s3[.-]/)
      if (s3Match) {
        const bucketName = s3Match[1]
        const targetId = s3NodeIds[bucketName]
        if (targetId) {
          edges.push({
            id: `edge-${dist.nodeId}-${targetId}`,
            source: dist.nodeId,
            target: targetId,
            type: 'data',
            label: 'origin (S3)',
          })
        }
        continue
      }
      // EC2/ALB origin: try to match by IP or DNS
      // This is a heuristic -- real implementations would check ALB/ELB targets
      for (const ec2NodeId of ec2NodeIds) {
        const ec2Node = nodes.find(n => n.id === ec2NodeId)
        if (ec2Node && (ec2Node.metadata.publicIp === origin || ec2Node.metadata.privateIp === origin)) {
          edges.push({
            id: `edge-${dist.nodeId}-${ec2NodeId}`,
            source: dist.nodeId,
            target: ec2NodeId,
            type: 'network',
            label: 'origin (EC2)',
          })
        }
      }
    }
  }

  return { nodes, edges }
}
