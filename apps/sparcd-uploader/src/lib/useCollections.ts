import { useQuery } from '@tanstack/react-query';
import type { S3Config } from '@sparcd/types';
import { listCollections, listCollectionDeploymentLocationIds, type CollectionRef } from './s3';

/**
 * List the collection buckets for the connected endpoint (cached per endpoint).
 * Each ref already carries its human-readable name, so no separate name fetch
 * is needed.
 */
export function useCollections(cfg: S3Config | null, connectionId: number) {
  return useQuery<CollectionRef[]>({
    queryKey: ['collections', connectionId, cfg?.endpoint],
    queryFn: () => listCollections(cfg!),
    enabled: !!cfg,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * The location ids the selected collection has already deployed — the set the
 * deployment picker is filtered to. Cached per collection so re-selecting a
 * collection is instant.
 */
export function useCollectionDeployments(
  cfg: S3Config | null,
  connectionId: number,
  collection: CollectionRef | null,
) {
  return useQuery<string[]>({
    queryKey: ['collectionDeployments', connectionId, collection?.key],
    queryFn: () => listCollectionDeploymentLocationIds(cfg!, collection!),
    enabled: !!cfg && !!collection,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
