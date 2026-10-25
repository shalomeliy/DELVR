// Data model from the spec ("מודל נתונים"), trimmed to v1: no apartment/floor, no time windows.

export interface LatLng { lat: number; lng: number }

export type StopOrder = 'first' | 'auto' | 'last';
export type VerifyStatus = 'pending' | 'ok' | 'needs_fix';
/** pasted: the courier left the item or a notice stuck on the door. Counted apart from delivered. */
export type DeliveryStatus = 'todo' | 'delivered' | 'pasted' | 'failed';

export interface Stop {
  id: string;
  /** What the courier said or typed, after parsing ("הרצל 3, רחובות"). */
  input: string;
  /** What was first dictated, kept so a correction is remembered for next time. */
  spoken: string;
  /** City the courier said (or the start city), used to check Google's answer. */
  city: string | null;
  verify: VerifyStatus;
  /** Why Google's answer was not accepted, in Hebrew, when verify is needs_fix. */
  fixReason?: string;
  /** Google's formatted address, shown to the courier in Hebrew. */
  address?: string;
  location?: LatLng;
  order: StopOrder;
  note?: string;
  delivery: DeliveryStatus;
  /** Why the delivery failed, typed or dictated by the courier. */
  failReason?: string;
  /** When the courier marked it delivered, pasted or failed. The latest one is where a re-sort starts from. */
  handledAt?: number;
}

export type EndMode = 'open' | 'return' | 'address';

export interface Place { input: string; address?: string; location?: LatLng }

export interface Leg { durationSec: number; distanceM: number }

export interface Optimized {
  /** Stop ids in driving order. */
  order: string[];
  legs: Leg[];
  totalDurationSec: number;
  totalDistanceM: number;
  /** Driving totals for the order the stops were added in, for the before/after view. */
  before?: { totalDurationSec: number; totalDistanceM: number };
  polyline?: string;
  at: number;
}

export interface Plan {
  start: Place;
  /** Where the route ends: at the last stop (default), back at the start, or at a chosen address. */
  endMode?: EndMode;
  /** The chosen end address, used when endMode is 'address'. */
  end: Place | null;
  stops: Stop[];
  optimized?: Optimized;
}

export const MAX_STOPS = 25;
