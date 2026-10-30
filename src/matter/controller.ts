import type { Unsubscribe } from '@/core';
import type { CommissionStep } from '@/core/matterSetup';
import type { Prefix } from '@/transport/localOnly';

/** Thermostat, Fan Control and On/Off attributes of an AC. Temperatures are 0.01 °C. */
export interface MatterAcAttrs {
  onOff?: boolean;
  systemMode: number;
  occupiedCoolingSetpoint: number;
  fanMode?: number;
  rockSetting?: number;
  localTemperature: number | null;
}

export interface MatterAcInfo {
  hasOnOff: boolean;
  absMinCool: number; // 0.01 °C
  absMaxCool: number; // 0.01 °C
  fanModeSequence?: number;
  rockSupport?: number;
  systemModes?: number[];
}

export type MatterWrite = Partial<
  Pick<
    MatterAcAttrs,
    'onOff' | 'systemMode' | 'occupiedCoolingSetpoint' | 'fanMode' | 'rockSetting'
  >
>;

export interface MatterController {
  available(): boolean;
  commission(payload: string, onStep: (s: CommissionStep) => void): Promise<{ nodeId: string }>;
  info(nodeId: string): Promise<MatterAcInfo>;
  read(nodeId: string): Promise<MatterAcAttrs>;
  /** Rejects MatterError. */
  write(nodeId: string, w: MatterWrite): Promise<void>;
  subscribe(nodeId: string, onAttrs: (a: MatterAcAttrs) => void, onLost: () => void): Unsubscribe;
  peerAddress(nodeId: string): Promise<string | null>;
  onLinkPrefixes(): Promise<Prefix[]>;
}
