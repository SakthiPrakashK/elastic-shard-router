import { ShardRouter } from '../src/shard_router';
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({ 
  node: 'http://localhost:9200',
  auth: { username: 'elastic', password: 'changeme' }
});
const indexName = 'my-index';

async function createIndex() {
  const exists = await esClient.indices.exists({ index: indexName });
  if (!exists) {
    await esClient.indices.create({
      index: indexName,
      settings: {
        number_of_shards: '2',
        number_of_replicas: '0'
      },
      mappings: {}
    });
    console.log(`Index "${indexName}" with 2 shards created.`);
  } else {
    console.log(`Index "${indexName}" already exists.`);
  }
}

const router = new ShardRouter(esClient, indexName, 'key-');

async function run() {
  await createIndex();
  await router.initialize();
  const allKeys = router.getAllRoutingKeys();
  const routingKey = allKeys.get(0);
  if (routingKey) {
    // Verify routing key
    const isValid = router.verifyRoutingKey(routingKey, 0);
    console.log(`Routing key ${routingKey} valid for shard 0:`, isValid);
    // Calculate shard for routing key
    const shardNum = router.calculateShardForRoutingKey(routingKey);
    console.log(`Routing key ${routingKey} maps to shard:`, shardNum);
  }
}

run().catch(console.error);
