# elastic-shard-router

A TypeScript Node.js library to generate, verify, and map deterministic Elasticsearch routing keys to specific shards, enabling precise document placement and retrieval.

## What is this library for?

`elastic-shard-router` is designed to help you control and understand how documents are routed to shards in an Elasticsearch index. It allows you to:

- Generate deterministic routing keys for each shard, so you know exactly which shard a document will be stored in.
- Implement strict multi-tenant isolation by assigning tenants to specific shards and always using the correct routing key for each tenant.
- Support custom tenant-to-shard allocation strategies (e.g., round-robin, least-loaded, or your own logic).
- Verify and calculate shard assignments for any routing key, making migrations and audits easy.

This is especially useful for:

- Multi-tenant SaaS platforms that want to guarantee tenant data isolation at the shard level.
- Performance optimization by controlling document distribution across shards.
- Data migration, rebalancing, or compliance scenarios where deterministic routing is required.

## API Reference

### ShardRouter Constructor

```typescript
new ShardRouter(
  esClient: ElasticsearchClient,
  indexName: string,
  prefix?: string,
  suffix?: string,
  tenantDistributionAlgo?: (
    tenantId: string,
    tenantShardMap: Map<string, number>,
    shardTenantMap: Map<number, string[]>,
    numberOfShards: number
  ) => number
)
```

**Parameters:**

- `esClient` (**required**): Elasticsearch client instance from `@elastic/elasticsearch`.
- `indexName` (**required**): Name of the Elasticsearch index.
- `prefix` (optional): String to prepend to all generated routing keys (default: '').
- `suffix` (optional): String to append to all generated routing keys (default: '').
- `tenantDistributionAlgo` (optional): Custom function to control tenant-to-shard assignment. Receives the tenant ID, current tenant-to-shard and shard-to-tenant mappings, and the number of shards. Should return the shard number to assign the tenant to. Defaults to round-robin allocation.

### getRoutingKeyForTenant(tenantId: string): string | undefined

> **Note:** This feature is currently in beta and is not ready for production use.

Returns the routing key for a given tenant, allocating the tenant to a shard if not already assigned. Supports custom allocation algorithms, defaults to round-robin allocation.

**Usage:**

```typescript
const router = new ShardRouter(esClient, 'your-index', 'key-');
await router.initialize();
const routingKey = router.getRoutingKeyForTenant('tenantA');
await esClient.index({
  index: 'your-index',
  routing: routingKey,
  body: { tenantId: 'tenantA', data: 'Tenant A data' },
});
```

### getAllRoutingKeys(): Map<number, string>

Returns all precomputed routing keys as a Map with shard numbers as keys. Useful for bulk operations or direct shard access.

**Usage:**

```typescript
const allKeys = router.getAllRoutingKeys();
for (const [shardNum, routingKey] of allKeys) {
  // Use routingKey for direct shard operations
}
```

---

### Other Methods (simple descriptions)

- **initialize(): Promise<void>**  
  Loads index metadata and precomputes routing keys. Must be called before using routing methods.

- **getRoutingKeyForShard(shardNumber: number): string | undefined**  
  Returns the precomputed routing key for a specific shard.

- **verifyRoutingKey(routingKey: string, expectedShard: number): boolean**  
  Checks if a routing key maps to the expected shard.

- **calculateShardForRoutingKey(routingKey: string): number**  
  Calculates which shard a routing key will route to.

- **getShardTenantMapping(): Map<number, string[]>**  
  Returns the current mapping of shard numbers to arrays of tenant IDs.

## Examples

See the `examples/` directory for detailed usage patterns, including multi-tenant allocation, bulk indexing, and migration scenarios.
