import { createHash } from 'crypto';
import { EsShardRouterMurmur3Hash } from './murmur3';
import { ShardRouterIndexMetadata } from './metadata';
import type { Client as ElasticsearchClient } from '@elastic/elasticsearch';

/**
 * ShardRouter provides routing key calculation and lookup for Elasticsearch indices.
 * It loads index metadata, computes routing factors, and precomputes routing keys for each shard.
 */
export class ShardRouter {
  private readonly esClient: ElasticsearchClient;
  private readonly indexName: string;
  private prefix: string;
  private suffix: string;
  private metadata!: ShardRouterIndexMetadata;
  private routingKeys: Map<number, string> = new Map();
  private shardTenantMap: Map<number, string[]> = new Map();
  private tenantShardMap: Map<string, number> = new Map();
  private nextShard: number = 0;
  private tenantDistributionAlgo: (tenantId: string, tenantShardMap: Map<string, number>, shardTenantMap: Map<number, string[]>, numberOfShards: number) => number;

  /**
   * Creates a new ShardRouter instance.
   * @param esClient Elasticsearch client instance.
   * @param indexName Name of the Elasticsearch index.
   * @param prefix Optional prefix for routing keys.
   * @param suffix Optional suffix for routing keys.
   * @param tenantDistributionAlgo Optional distribution algorithm for tenant-to-shard assignment.
   */
  constructor(
    esClient: ElasticsearchClient,
    indexName: string,
    prefix: string = '',
    suffix: string = '',
    tenantDistributionAlgo?: (tenantId: string, tenantShardMap: Map<string, number>, shardTenantMap: Map<number, string[]>, numberOfShards: number) => number
  ) {
    if (!esClient) {
      throw new Error('esClient is required');
    }
    if (!indexName || typeof indexName !== 'string' || !indexName.trim()) {
      throw new Error('indexName must be a non-empty string');
    }
    this.esClient = esClient;
    this.indexName = indexName;
    this.prefix = prefix;
    this.suffix = suffix;
    this.tenantDistributionAlgo = tenantDistributionAlgo || this.defaultRoundRobinAlgo;
    // Initialization is now manual. Call initialize() before using routing methods.
  }

  /**
   * Default round robin distribution algorithm for tenant-to-shard assignment.
   */
  private defaultRoundRobinAlgo = (
    tenantId: string,
    tenantShardMap: Map<string, number>,
    shardTenantMap: Map<number, string[]>,
    numberOfShards: number
  ): number => {
    // Assign to next shard in round robin fashion
    const assignedShard = this.nextShard;
    this.nextShard = (this.nextShard + 1) % numberOfShards;
    return assignedShard;
  };

  /**
   * Initializes the router by loading index metadata and precomputing routing keys.
   */
  async initialize(): Promise<void> {
    await this.loadMetadata();
    this.precomputeRoutingKeys();
  }

  /**
   * Computes the routing factor between source and target shards.
   * @param sourceShards Number of source shards.
   * @param targetShards Number of target shards.
   * @returns Routing factor.
   */
  private getRoutingFactor(sourceShards: number, targetShards: number): number {
    if (targetShards < 1) throw new Error('must specify >= 1 target shards');
    if (sourceShards < 1) throw new Error('must specify >= 1 source shards');
    if (sourceShards === targetShards) return 1;
    if (sourceShards > targetShards) {
      if (sourceShards % targetShards !== 0)
        throw new Error('source shards must be a multiple of target shards');
      return sourceShards / targetShards;
    } else {
      if (targetShards % sourceShards !== 0)
        throw new Error('target shards must be a multiple of source shards');
      return targetShards / sourceShards;
    }
  }

  /**
   * Loads index metadata from Elasticsearch and sets internal metadata.
   */
  private async loadMetadata(): Promise<void> {
    try {
      const indexInfo = await this.esClient.indices.get({ index: this.indexName });
      let settings: Record<string, string>;
      const indexData =
        indexInfo && typeof indexInfo === 'object' && this.indexName in indexInfo
          ? indexInfo[this.indexName]
          : undefined;
      if (indexData && indexData.settings && typeof indexData.settings.index === 'object') {
        settings = indexData.settings.index as Record<string, string>;
      } else {
        throw new Error(`Could not find settings for index: ${this.indexName}`);
      }
      const number_of_shards: number = parseInt(settings.number_of_shards || '1', 10);
      const clusterState = await this.esClient.cluster.state({
        metric: 'metadata',
        index: this.indexName,
      });
      const routing_num_shards: number =
        clusterState.metadata.indices[this.indexName]?.routing_num_shards || number_of_shards;
      const routing_factor: number = this.getRoutingFactor(number_of_shards, routing_num_shards);
      const routing_partition_size: number | undefined = settings.routing_partition_size
        ? parseInt(settings.routing_partition_size, 10)
        : undefined;
      const is_partitioned: boolean = routing_partition_size !== undefined;
      this.metadata = {
        name: this.indexName,
        number_of_shards,
        routing_num_shards,
        routing_factor,
        routing_partition_size,
        is_partitioned,
      };
    } catch (err) {
      throw new Error(
        `Failed to load metadata for index '${this.indexName}': ${(err as Error).message}`,
      );
    }
  }

  /**
   * Generates a candidate routing key for a given attempt.
   * @param attempt Attempt number.
   * @returns Candidate routing key.
   */
  private generateCandidateKey(attempt: number): string {
    const baseKey: string = attempt.toString().padStart(8, '0');
    const entropy: string = createHash('md5').update(String(attempt)).digest('hex').slice(0, 8);
    return `${this.prefix}${baseKey}_${entropy}${this.suffix}`;
  }

  /**
   * Precomputes and stores routing keys for all shards.
   */
  private precomputeRoutingKeys(): void {
    for (let shardNum = 0; shardNum < this.metadata.number_of_shards; shardNum++) {
      const key = this.findRoutingKeyForShard(shardNum);
      if (key) this.routingKeys.set(shardNum, key);
    }
  }

  /**
   * Finds a routing key for a specific shard.
   * @param targetShard The shard number.
   * @param maxAttempts Maximum attempts to find a key.
   * @returns The routing key or undefined if not found.
   */
  private findRoutingKeyForShard(
    targetShard: number,
    maxAttempts: number = 10000,
  ): string | undefined {
    if (targetShard < 0 || targetShard >= this.metadata.number_of_shards) {
      throw new Error(
        `Invalid shard number ${targetShard}. Must be 0-${this.metadata.number_of_shards - 1}`,
      );
    }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateKey = this.generateCandidateKey(attempt);
      if (this.metadata.is_partitioned) {
        return undefined;
      }
      const hashVal: number = EsShardRouterMurmur3Hash.hash(candidateKey);
      const calculatedShard: number = Math.floor(
        (hashVal % this.metadata.routing_num_shards) / this.metadata.routing_factor,
      );
      if (calculatedShard === targetShard) {
        return candidateKey;
      }
    }
    return undefined;
  }

  /**
   * Gets the precomputed routing key for a given shard.
   * @param shardNumber Shard number.
   * @returns Routing key or undefined.
   */
  public getRoutingKeyForShard(shardNumber: number): string | undefined {
    if (!this.metadata) {
      throw new Error('ShardRouter is not initialized. Call initialize() first.');
    }
    return this.routingKeys.get(shardNumber);
  }

  /**
   * Gets all precomputed routing keys for the index.
   * @returns Map of shard numbers to routing keys.
   */
  public getAllRoutingKeys(): Map<number, string> {
    if (!this.metadata) {
      throw new Error('ShardRouter is not initialized. Call initialize() first.');
    }
    return new Map(this.routingKeys);
  }

  /**
   * Verifies that a routing key maps to the expected shard.
   * @param routingKey Routing key to verify.
   * @param expectedShard Expected shard number.
   * @returns True if the routing key maps to the expected shard, false otherwise.
   */
  public verifyRoutingKey(routingKey: string, expectedShard: number): boolean {
    if (!this.metadata) {
      throw new Error('ShardRouter is not initialized. Call initialize() first.');
    }
    if (typeof routingKey !== 'string' || routingKey.length === 0) {
      throw new Error('routingKey must be a non-empty string');
    }
    if (typeof expectedShard !== 'number' || expectedShard < 0 || expectedShard >= this.metadata.number_of_shards) {
      throw new Error(`expectedShard must be a valid shard number (0-${this.metadata.number_of_shards - 1})`);
    }
    const hashVal: number = EsShardRouterMurmur3Hash.hash(routingKey);
    const calculatedShard: number = Math.floor(
      (hashVal % this.metadata.routing_num_shards) / this.metadata.routing_factor,
    );
    return calculatedShard === expectedShard;
  }

  /**
   * Calculates the shard number for a given routing key.
   * @param routingKey Routing key to calculate shard for.
   * @returns Shard number.
   */
  public calculateShardForRoutingKey(routingKey: string): number {
    if (!this.metadata) {
      throw new Error('ShardRouter is not initialized. Call initialize() first.');
    }
    if (typeof routingKey !== 'string' || routingKey.length === 0) {
      throw new Error('routingKey must be a non-empty string');
    }
    const hashVal: number = EsShardRouterMurmur3Hash.hash(routingKey);
    return Math.floor((hashVal % this.metadata.routing_num_shards) / this.metadata.routing_factor);
  }

  /**
   * Returns the routing key for a given tenant, allocating the tenant to a shard if not already assigned.
   * @param tenantId The tenant identifier.
   * @returns The routing key for the tenant's assigned shard.
   */
  public getRoutingKeyForTenant(tenantId: string): string | undefined {
    if (!this.metadata) {
      throw new Error('ShardRouter is not initialized. Call initialize() first.');
    }
    if (!tenantId || typeof tenantId !== 'string') {
      throw new Error('tenantId must be a non-empty string');
    }
    if (this.tenantShardMap.has(tenantId)) {
      const shardNum = this.tenantShardMap.get(tenantId)!;
      return this.routingKeys.get(shardNum);
    }
    const numberOfShards = this.metadata.number_of_shards;
    const shardNum = this.tenantDistributionAlgo(
      tenantId,
      this.tenantShardMap,
      this.shardTenantMap,
      numberOfShards
    );
    if (shardNum < 0 || shardNum >= numberOfShards) {
      throw new Error(`Distribution algorithm returned invalid shard number: ${shardNum}`);
    }
    // Update internal maps
    this.tenantShardMap.set(tenantId, shardNum);
    if (!this.shardTenantMap.has(shardNum)) {
      this.shardTenantMap.set(shardNum, []);
    }
    this.shardTenantMap.get(shardNum)!.push(tenantId);
    return this.routingKeys.get(shardNum);
  }

  /**
   * Returns the current mapping of shard numbers to arrays of tenant IDs.
   */
  public getShardTenantMapping(): Map<number, string[]> {
    return new Map(this.shardTenantMap);
  }
}
