import type { Link } from './model';

/** A Gree (or Gree Wi-Fi module) AC that answered a scan on the home network. */
export interface GreeUnit {
  /** Lower-case hex, no separators. */
  mac: string;
  host: string;
  /** The unit's own name (often a hex id), may be empty. */
  name: string;
  cipher: 'ecb' | 'gcm';
  brand?: string;
  model?: string;
  version?: string;
}

/** What screens may import to add a Gree Wi-Fi AC. Everything stays on the home network. */
export interface GreeSetup {
  available(): boolean;
  /** Units that answered, one per MAC. Rejects DeviceError('notSent') off Wi-Fi. */
  scan(): Promise<GreeUnit[]>;
  /** Asks the unit for its key (the unit's own local bind). Rejects a DeviceError. */
  bind(unit: GreeUnit): Promise<Extract<Link, { kind: 'gree' }>>;
}
