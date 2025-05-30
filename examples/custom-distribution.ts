import { ShardRouter } from '../src/shard_router';
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({ 
  node: 'http://localhost:9200',
  auth: { username: 'elastic', password: 'changeme' }
});
const indexName = 'multi-tenant-index';

async function createIndex() {
  const exists = await esClient.indices.exists({ index: indexName });
  if (!exists) {
    await esClient.indices.create({
      index: indexName,
      settings: {
        number_of_shards: '3',
        number_of_replicas: '0'
      },
      mappings: {}
    });
    console.log(`Index "${indexName}" with 3 shards created.`);
  } else {
    console.log(`Index "${indexName}" already exists.`);
  }
}

// Custom distribution: assign tenants to the shard with the fewest tenants (greedy balance)
function leastLoadedShardAlgo(
  tenantId: string,
  tenantShardMap: Map<string, number>,
  shardTenantMap: Map<number, string[]>,
  numberOfShards: number
): number {
  let minCount = Infinity;
  let selectedShard = 0;
  for (let shard = 0; shard < numberOfShards; shard++) {
    const count = (shardTenantMap.get(shard) || []).length;
    if (count < minCount) {
      minCount = count;
      selectedShard = shard;
    }
  }
  return selectedShard;
}

const router = new ShardRouter(
  esClient,
  'multi-tenant-index',
  'key-',
  '',
  leastLoadedShardAlgo
);

async function run() {
  await createIndex();
  await router.initialize();

  // Allocate tenants and get routing keys
  const tenants = ['acmecorp', 'techstartup', 'enterprise', 'nonprofit', 'consulting', 'startupx', 'ngo', 'retail', 'finance', 'logistics'];
  for (const tenant of tenants) {
    const routingKey = router.getRoutingKeyForTenant(tenant);
    console.log(`Tenant ${tenant} assigned routing key: ${routingKey}`);
    // Example: index a document for each tenant
    await esClient.index({
      index: 'multi-tenant-index',
      routing: routingKey,
      body: { tenantId: tenant, data: `Data for ${tenant}` }
    });
  }

  // Show the shard-to-tenant mapping
  const mapping = router.getShardTenantMapping();
  for (const [shard, tenantList] of mapping) {
    console.log(`Shard ${shard}:`, tenantList);
  }
}

run().catch(console.error);
