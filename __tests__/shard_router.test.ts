import { Client } from '@elastic/elasticsearch';
import { ShardRouter } from '../src/shard_router';

describe('ShardRouter', () => {
  const esClient = {
    indices: {
      get: jest.fn(async () => ({
        'test-index': {
          settings: {
            index: {
              number_of_shards: '2',
            },
          },
        },
      })),
    },
    cluster: {
      state: jest.fn(async () => ({
        metadata: {
          indices: {
            'test-index': {
              routing_num_shards: 2,
            },
          },
        },
      })),
    },
  } as unknown as Client;

  it('should initialize and generate routing keys', async () => {
    const router = new ShardRouter(esClient, 'test-index');
    await router.initialize();
    const keys = router.getAllRoutingKeys();
    expect(keys.size).toBe(2);
    expect(typeof router.getRoutingKeyForShard(0)).toBe('string');
  });

  it('should calculate shard for a routing key', async () => {
    const router = new ShardRouter(esClient, 'test-index');
    await router.initialize();
    const key = router.getRoutingKeyForShard(0);
    if (key) {
      const shard = router.calculateShardForRoutingKey(key);
      expect(shard).toBe(0);
    }
  });
});
