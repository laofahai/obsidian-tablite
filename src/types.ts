export interface ColumnConfig {
  order: number[];
  hidden: number[];
  sizing: Record<string, number>;
  frozenCount: number;
}

export interface TablitePluginData {
  files: Record<string, ColumnConfig>;
}

export const DEFAULT_PLUGIN_DATA: TablitePluginData = {
  files: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Persisted settings are untrusted JSON, including data from older versions. */
export function parsePluginData(value: unknown): TablitePluginData {
  if (!isRecord(value) || !isRecord(value.files)) return { files: {} };
  const files: Array<[string, ColumnConfig]> = [];
  const indices = (items: unknown): number[] => Array.isArray(items)
    ? items.filter((item: unknown): item is number =>
      typeof item === "number" && Number.isInteger(item) && item >= 0)
    : [];
  for (const [path, config] of Object.entries(value.files)) {
    if (!isRecord(config)) continue;
    const sizing: Record<string, number> = {};
    if (isRecord(config.sizing)) {
      for (const [key, width] of Object.entries(config.sizing)) {
        if (typeof width === "number" && Number.isFinite(width) && width >= 0) {
          sizing[key] = width;
        }
      }
    }
    files.push([path, {
      order: indices(config.order),
      hidden: indices(config.hidden),
      sizing,
      frozenCount: typeof config.frozenCount === "number" && Number.isFinite(config.frozenCount)
        ? Math.max(0, Math.floor(config.frozenCount)) : 0,
    }]);
  }
  return { files: Object.fromEntries(files) };
}

export function createDefaultColumnConfig(columnCount: number): ColumnConfig {
  return {
    order: Array.from({ length: columnCount }, (_, index) => index),
    hidden: [],
    sizing: {},
    frozenCount: 0,
  };
}

export function normalizeColumnConfig(
  config: Partial<ColumnConfig> | undefined,
  columnCount: number,
): ColumnConfig {
  const base = createDefaultColumnConfig(columnCount);
  if (!config) return base;

  const validIndex = (value: number) =>
    Number.isInteger(value) && value >= 0 && value < columnCount;

  const order = [
    ...(config.order ?? []).filter(validIndex),
    ...base.order.filter((index) => !(config.order ?? []).includes(index)),
  ];

  const hidden = Array.from(new Set((config.hidden ?? []).filter(validIndex)));

  const sizing = Object.fromEntries(
    Object.entries(config.sizing ?? {}).filter(([key, value]) => {
      const index = Number(key);
      return validIndex(index) && typeof value === "number" && Number.isFinite(value);
    }),
  );

  const visibleCount = Math.max(0, columnCount - hidden.length);
  const requestedFrozen = typeof config.frozenCount === "number" ? config.frozenCount : 0;
  const frozenCount = Math.max(0, Math.min(requestedFrozen, visibleCount));

  return {
    order,
    hidden,
    sizing,
    frozenCount,
  };
}

export function remapColumnConfigForInsert(
  config: ColumnConfig,
  insertIndex: number,
  columnCountAfterInsert: number,
): ColumnConfig {
  const shift = (index: number) => (index >= insertIndex ? index + 1 : index);

  const order = config.order.map(shift);
  order.splice(Math.min(insertIndex, order.length), 0, insertIndex);

  const hidden = config.hidden.map(shift);
  const sizing = Object.fromEntries(
    Object.entries(config.sizing).map(([key, value]) => {
      const index = Number(key);
      return [String(shift(index)), value];
    }),
  );

  return normalizeColumnConfig(
    {
      order,
      hidden,
      sizing,
      frozenCount: config.frozenCount,
    },
    columnCountAfterInsert,
  );
}

export function remapColumnConfigForDelete(
  config: ColumnConfig,
  deleteIndex: number,
  columnCountAfterDelete: number,
): ColumnConfig {
  const shift = (index: number) => (index > deleteIndex ? index - 1 : index);

  const order = config.order
    .filter((index) => index !== deleteIndex)
    .map(shift);

  const hidden = config.hidden
    .filter((index) => index !== deleteIndex)
    .map(shift);

  const sizing = Object.fromEntries(
    Object.entries(config.sizing)
      .filter(([key]) => Number(key) !== deleteIndex)
      .map(([key, value]) => {
        const index = Number(key);
        return [String(shift(index)), value];
      }),
  );

  return normalizeColumnConfig(
    {
      order,
      hidden,
      sizing,
      frozenCount: config.frozenCount,
    },
    columnCountAfterDelete,
  );
}
