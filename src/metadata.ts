export interface ShardRouterIndexMetadata {
  name: string;
  number_of_shards: number;
  routing_num_shards: number;
  routing_factor: number;
  routing_partition_size?: number;
  is_partitioned: boolean;
}
