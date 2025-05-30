import { ShardRouter } from '../src/shard_router';
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({ 
  node: 'http://localhost:9200',
  auth: { username: 'elastic', password: 'changeme' }
});
const indexName = 'multi-tenant-index';
const router = new ShardRouter(esClient, indexName, 'key-');

async function createIndex() {
  const exists = await esClient.indices.exists({ index: indexName });
  if (!exists) {
    await esClient.indices.create({
      index: indexName,
      settings: {
        number_of_shards: '5',
        number_of_replicas: '0'
      },
      mappings: {}
    });
    console.log(`Index "${indexName}" with 5 shards created.`);
  } else {
    console.log(`Index "${indexName}" already exists.`);
  }
}

async function run() {
  await createIndex();
  await router.initialize();

  // Allocate tenants and get routing keys
  const tenants = ['acmecorp', 'techstartup', 'enterprise', 'nonprofit', 'consulting'];
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
