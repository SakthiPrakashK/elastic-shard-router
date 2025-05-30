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

  it('should allocate tenants to shards and return correct routing keys', async () => {
    const router = new ShardRouter(esClient, 'test-index');
    await router.initialize();
    const tenantAKey = router.getRoutingKeyForTenant('tenantA');
    const tenantBKey = router.getRoutingKeyForTenant('tenantB');
    const tenantCKey = router.getRoutingKeyForTenant('tenantC');
    // Should allocate in round robin: tenantA->0, tenantB->1, tenantC->0 (since 2 shards)
    expect(typeof tenantAKey).toBe('string');
    expect(typeof tenantBKey).toBe('string');
    expect(typeof tenantCKey).toBe('string');
    // Should return same key for same tenant
    expect(router.getRoutingKeyForTenant('tenantA')).toBe(tenantAKey);
    expect(router.getRoutingKeyForTenant('tenantB')).toBe(tenantBKey);
    // Should map tenants to correct shards
    const mapping = router.getShardTenantMapping();
    expect(Array.from(mapping.get(0) || [])).toContain('tenantA');
    expect(Array.from(mapping.get(1) || [])).toContain('tenantB');
    expect(Array.from(mapping.get(0) || [])).toContain('tenantC');
    // Should not allocate a new shard for existing tenant
    expect(router.getRoutingKeyForTenant('tenantA')).toBe(tenantAKey);
  });
});
