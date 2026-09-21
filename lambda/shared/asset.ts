// Mirrors what UpsertAssetV1 writes to AssetsTableV2 — extend both together if the schema grows.
export type AssetRecord = {
  asset_key: string;
  created_at: string;
};
