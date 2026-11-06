import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import { capabilitiesFrom, fromAttrs, toWrites } from '@/matter/clusters';

const cool24: AcState = {
  power: true,
  mode: 'cool',
  setpoint: 24,
  fan: 2,
  swing: false,
  sleep: false,
};

describe('toWrites', () => {
  it('writes the full state in order', () => {
    expect(
      toWrites(cool24, { hasOnOff: true, absMinCool: 1600, absMaxCool: 3000, fanModeSequence: 2 }),
    ).toEqual([
      { onOff: true },
      { systemMode: 3 },
      { occupiedCoolingSetpoint: 2400 },
      { fanMode: 2 },
    ]);
  });

  it('turns off with systemMode when there is no On/Off cluster', () => {
    expect(
      toWrites(
        { ...cool24, power: false },
        { hasOnOff: false, absMinCool: 1600, absMaxCool: 3000 },
      ),
    ).toEqual([{ systemMode: 0 }]);
  });

  it('turns off with onOff when available', () => {
    expect(
      toWrites({ ...cool24, power: false }, { hasOnOff: true, absMinCool: 1600, absMaxCool: 3000 }),
    ).toEqual([{ onOff: false }]);
  });

  it('clamps the setpoint to the AC limits', () => {
    const w = toWrites(
      { ...cool24, setpoint: 16 },
      { hasOnOff: true, absMinCool: 1800, absMaxCool: 3000, fanModeSequence: 2 },
    );
    expect(w).toContainEqual({ occupiedCoolingSetpoint: 1800 });
  });

  it('skips onOff without the cluster, and fan and rock when unsupported', () => {
    expect(toWrites(cool24, { hasOnOff: false, absMinCool: 1600, absMaxCool: 3000 })).toEqual([
      { systemMode: 3 },
      { occupiedCoolingSetpoint: 2400 },
    ]);
  });

  it('maps modes, auto fan and rock', () => {
    const info = {
      hasOnOff: true,
      absMinCool: 1600,
      absMaxCool: 3000,
      fanModeSequence: 2,
      rockSupport: 1,
    };
    expect(toWrites({ ...cool24, mode: 'dry', fan: 'auto', swing: true }, info)).toEqual([
      { onOff: true },
      { systemMode: 8 },
      { occupiedCoolingSetpoint: 2400 },
      { fanMode: 5 },
      { rockSetting: 1 },
    ]);
    expect(toWrites({ ...cool24, mode: 'fan', fan: 1 }, info)[1]).toEqual({ systemMode: 7 });
    expect(toWrites({ ...cool24, mode: 'auto', fan: 3, swing: false }, info)).toEqual([
      { onOff: true },
      { systemMode: 1 },
      { occupiedCoolingSetpoint: 2400 },
      { fanMode: 3 },
      { rockSetting: 0 },
    ]);
  });

  it('sends the five-speed fan levels 4 and 5 as High, and ignores the IR-only extras', () => {
    const info = {
      hasOnOff: true,
      absMinCool: 1600,
      absMaxCool: 3000,
      fanModeSequence: 2,
      rockSupport: 1,
    };
    expect(toWrites({ ...cool24, fan: 4 }, info)[3]).toEqual({ fanMode: 3 });
    expect(toWrites({ ...cool24, fan: 5 }, info)[3]).toEqual({ fanMode: 3 });
    const extras: AcState = {
      ...cool24,
      swing: false,
      swingV: 2,
      swingH: 'left',
      powerful: true,
      quiet: false,
      ion: true,
    };
    expect(toWrites(extras, info)).toEqual(toWrites({ ...cool24, swing: false }, info));
    // A vertical position is swing off; auto is swing on (rock).
    expect(toWrites({ ...cool24, swing: true, swingV: 'auto' }, info)[4]).toEqual({
      rockSetting: 1,
    });
  });
});

describe('fromAttrs', () => {
  it('maps attributes to state and room temperature', () => {
    const r = fromAttrs(
      {
        onOff: true,
        systemMode: 8,
        occupiedCoolingSetpoint: 2550,
        fanMode: 5,
        localTemperature: 2710,
      },
      defaultAcState(),
    );
    expect(r.state).toMatchObject({ mode: 'dry', setpoint: 26, fan: 'auto', power: true });
    expect(r.roomTemp).toBe(27.1);
  });

  it('omits roomTemp when null', () => {
    const r = fromAttrs(
      { systemMode: 3, occupiedCoolingSetpoint: 2400, localTemperature: null },
      defaultAcState(),
    );
    expect('roomTemp' in r).toBe(false);
  });

  it('is off when onOff is false or mode is off, keeping the last mode', () => {
    const last = { ...defaultAcState(), mode: 'fan' as const, power: true };
    expect(
      fromAttrs(
        { onOff: false, systemMode: 3, occupiedCoolingSetpoint: 2400, localTemperature: null },
        last,
      ).state,
    ).toMatchObject({ power: false, mode: 'fan' });
    expect(
      fromAttrs({ systemMode: 0, occupiedCoolingSetpoint: 2400, localTemperature: null }, last)
        .state,
    ).toMatchObject({ power: false, mode: 'fan' });
  });

  it('maps fan modes and swing, keeping last when absent', () => {
    const base = { systemMode: 3, occupiedCoolingSetpoint: 2400, localTemperature: null };
    const last = { ...defaultAcState(), fan: 2 as const, swing: true };
    expect(fromAttrs({ ...base, fanMode: 4 }, last).state.fan).toBe('auto');
    expect(fromAttrs({ ...base, fanMode: 1 }, last).state.fan).toBe(1);
    expect(fromAttrs({ ...base, fanMode: 3 }, last).state.fan).toBe(3);
    expect(fromAttrs({ ...base, fanMode: 2 }, last).state.fan).toBe(2);
    expect(fromAttrs(base, last).state.fan).toBe(2);
    expect(fromAttrs({ ...base, rockSetting: 0 }, last).state.swing).toBe(false);
    expect(fromAttrs({ ...base, rockSetting: 1 }, last).state.swing).toBe(true);
    expect(fromAttrs(base, last).state.swing).toBe(true);
  });

  it('keeps the last mode for modes it does not know', () => {
    const last = { ...defaultAcState(), mode: 'dry' as const };
    expect(
      fromAttrs({ systemMode: 4, occupiedCoolingSetpoint: 2400, localTemperature: null }, last)
        .state.mode,
    ).toBe('dry');
    expect(
      fromAttrs({ systemMode: 7, occupiedCoolingSetpoint: 2400, localTemperature: null }, last)
        .state.mode,
    ).toBe('fan');
    expect(
      fromAttrs({ systemMode: 1, occupiedCoolingSetpoint: 2400, localTemperature: null }, last)
        .state.mode,
    ).toBe('auto');
  });
});

describe('capabilitiesFrom', () => {
  const base = { hasOnOff: true, absMinCool: 1600, absMaxCool: 3000 };
  it('derives fan speeds from the sequence', () => {
    expect(capabilitiesFrom({ ...base, fanModeSequence: 0 }).acFan).toEqual([1, 2, 3]);
    expect(capabilitiesFrom({ ...base, fanModeSequence: 1 }).acFan).toEqual([1, 3]);
    expect(capabilitiesFrom({ ...base, fanModeSequence: 2 }).acFan).toEqual([1, 2, 3, 'auto']);
    expect(capabilitiesFrom({ ...base, fanModeSequence: 3 }).acFan).toEqual([1, 3, 'auto']);
    expect(capabilitiesFrom({ ...base, fanModeSequence: 4 }).acFan).toEqual(['auto']);
    expect(capabilitiesFrom({ ...base, fanModeSequence: 5 }).acFan).toEqual(['auto']);
    expect(capabilitiesFrom(base).acFan).toEqual([]);
  });

  it('derives setpoint, swing, sleep and modes', () => {
    const c = capabilitiesFrom({ ...base, rockSupport: 0, systemModes: [0, 3, 8] });
    expect(c.setpoint).toEqual({ min: 16, max: 30 });
    expect(c.swing).toBe(false);
    expect(c.sleep).toBe(false);
    expect(c.acModes).toEqual(['cool', 'dry']);
    expect(capabilitiesFrom({ ...base, rockSupport: 3 }).swing).toBe(true);
    expect(capabilitiesFrom(base).acModes).toEqual(['cool', 'dry', 'fan', 'auto']);
  });

  it('never claims the IR-only extras', () => {
    const c = capabilitiesFrom({ ...base, fanModeSequence: 2, rockSupport: 3 });
    for (const k of ['swingV', 'swingH', 'powerful', 'quiet', 'ion'] as const) {
      expect(c[k]).toBeUndefined();
    }
  });
});
