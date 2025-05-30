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
  for (const [shardNum, routingKey] of allKeys) {
    // Index a document directly to each shard
    await esClient.index({
      index: 'my-index',
      routing: routingKey,
      body: { shard: shardNum, data: `Direct to shard ${shardNum}` }
    });
    console.log(`Indexed to shard ${shardNum} with routing key ${routingKey}`);
  }
}

run().catch(console.error);
