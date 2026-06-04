// TanStack Query wrappers. Every key is scoped by `connectionId` (not raw
// credentials), and the client cache is cleared on connect/disconnect, so
// reconnecting with new credentials never serves a previous connection's data.

import { useQuery } from '@tanstack/react-query';
import type { S3Config } from '@sparcd/types';
import {
  listCollections,
  listUploads,
  listUploadImages,
  parseCollectionKey,
  type CollectionRef,
  type UploadRef,
  type UploadImage,
} from './s3';
import { fetchSpecies, type SpeciesResult } from './species';

export function useCollections(cfg: S3Config | null, connectionId: number) {
  return useQuery<CollectionRef[]>({
    queryKey: ['collections', connectionId, cfg?.endpoint],
    queryFn: () => listCollections(cfg!),
    enabled: !!cfg,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useUploads(cfg: S3Config | null, connectionId: number, collectionKey: string | null) {
  return useQuery<UploadRef[]>({
    queryKey: ['uploads', connectionId, collectionKey],
    queryFn: () => {
      const { bucket, uuid } = parseCollectionKey(collectionKey!);
      return listUploads(cfg!, bucket, uuid);
    },
    enabled: !!cfg && !!collectionKey,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useUploadImages(
  cfg: S3Config | null,
  connectionId: number,
  collectionKey: string | null,
  uploadPrefix: string | null,
) {
  return useQuery<UploadImage[]>({
    queryKey: ['uploadImages', connectionId, collectionKey, uploadPrefix],
    queryFn: () => {
      const { bucket } = parseCollectionKey(collectionKey!);
      return listUploadImages(cfg!, bucket, uploadPrefix!);
    },
    enabled: !!cfg && !!collectionKey && !!uploadPrefix,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/** The species vocabulary, loaded once per connection from the settings bucket. */
export function useSpecies(cfg: S3Config | null, connectionId: number) {
  return useQuery<SpeciesResult>({
    queryKey: ['species', connectionId, cfg?.endpoint],
    queryFn: () => fetchSpecies(cfg!),
    enabled: !!cfg,
    staleTime: Infinity, // vocabulary is stable for a session
    retry: 1,
  });
}
