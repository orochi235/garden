/**
 * An invertible mutation. Applied via an adapter; produces an inverse op
 * that, when applied to the same adapter, undoes the original.
 *
 * Adapters are intentionally typed loosely here so different op types can
 * require different adapter capabilities. Each op is responsible for
 * narrowing the adapter via the methods it calls.
 */
export interface Op {
  apply(adapter: unknown): void;
  invert(): Op;
  label?: string;
  coalesceKey?: string;
}
