"use client";

import type { AgWidgetField, AgWidgetParams } from "ag-studio";
import { useEffect, useState } from "react";

import { useRefreshSignal } from "./refresh-signal";

/**
 * Rows for a custom widget from Studio's own data engine, so page filters, the date filter and
 * cross-filters apply to it like any built-in widget. Re-runs on new params (a mapping or format
 * change) and whenever the report's filters change (the console's refresh signal). Returns the
 * rows and when they were read.
 */
export function useWidgetRows(params: Pick<AgWidgetParams, "widgetApi">, fields: AgWidgetField[] | null) {
  const [result, setResult] = useState<{ rows: Record<string, unknown>[]; at: number } | null>(null);
  const { widgetApi } = params;
  const key = fields?.map((f) => `${f.fieldId}:${f.aggregation ?? ""}`).join("|") ?? "";
  const signal = useRefreshSignal();

  useEffect(() => {
    if (!fields) {
      widgetApi.setDisplayState("incompleteDataMapping");
      return;
    }
    let live = true;
    widgetApi.setDisplayState("loading", { prominent: result === null });
    widgetApi
      .getData({ fields })
      .then((response) => {
        if (!live) return;
        const next = response.results.rows;
        setResult({ rows: next, at: Date.now() });
        widgetApi.setDisplayState(next.length === 0 ? "noData" : "displayed");
      })
      .catch(() => live && widgetApi.setDisplayState("noData"));
    return () => {
      live = false;
    };
    // `params` changes identity when Studio re-renders the widget with a new mapping or format.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetApi, key, params, signal]);

  return result;
}

/** A custom widget's params, with the keys of its data mapping. */
export type MappedParams<K extends string> = Omit<AgWidgetParams, "dataMapping"> & { dataMapping: Partial<Record<K, AgWidgetField[]>> };

/** A row's value for a field: rows are keyed by the field's key. */
export const valueOf = (row: Record<string, unknown>, field: AgWidgetField) => row[field.key] ?? row[field.fieldId];

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 10_000 ? 0 : 2 });
