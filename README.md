# elastic-shard-router

A TypeScript Node.js library for deterministic Elasticsearch routing key generation and verification.

## Installation

```sh
npm install elastic-shard-router
```

## Usage Guide

### 1. Import and Instantiate

```typescript
import { ShardRouter } from 'elastic-shard-router';
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({ node: 'http://localhost:9200' });
const router = new ShardRouter(esClient, 'your-index', 'optionalPrefix_', '_optionalSuffix');
await router.initialize(); // Initialization is manual
```

#### ShardRouter Constructor Options
- `esClient` (**required**): An Elasticsearch JS client instance.
- `indexName` (**required**): The name of the Elasticsearch index.
- `prefix` (optional): String to prepend to all generated routing keys.
- `suffix` (optional): String to append to all generated routing keys.

### 2. Generate a Routing Key for a Shard

```typescript
const routingKey = router.getRoutingKeyForShard(0); // Get routing key for shard 0
console.log('Routing Key:', routingKey);
```

### 3. Verify a Routing Key

```typescript
const isValid = router.verifyRoutingKey(routingKey, 0); // Check if key routes to shard 0
console.log('Is Valid:', isValid);
```

### 4. Get All Routing Keys

```typescript
const allKeys = router.getAllRoutingKeys();
console.log(allKeys);
```

### 5. Calculate Shard for a Routing Key

```typescript
const shardNum = router.calculateShardForRoutingKey(routingKey);
console.log('Shard Number:', shardNum);
```

## TypeScript Support

Type definitions are included. No need to install `@types/elastic-shard-router`.

## License

ISC

## Contributing

Contributions are welcome! To contribute:

1. Fork this repository and create your branch from `main`.
2. Make your changes with clear commit messages.
3. Ensure your code is TypeScript compatible and passes lint/build checks.
4. Add or update tests if applicable.
5. Submit a pull request describing your changes.

For questions or feature requests, please open an issue.
