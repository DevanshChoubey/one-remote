// Reference vectors for the Carrier AC encoder (LGPL-2.1, see src/ir/lgpl/LICENSE).
// Copied from IRremoteESP8266 test/ir_Carrier_test.cpp (master at 1e2f0f3, version 2.9.0):
// TestDecodeCarrierAC64.SyntheticExample (the value of the real capture in .RealExample, sent as
// timings) and TestCarrierAc64Class.HumanReadable (the reset state).
// Timing strings keep upstream's "f38000d50" prefix.

/** TestDecodeCarrierAC64.RealExample / SyntheticExample: on, Heat, 30C, fan Low, swing on. */
export const CARRIER64_REAL_VALUE = 0x404000102e5e5584n;

/** ir_Carrier_test.cpp lines 416-430 (the comment lines between the literals dropped). */
export const CARRIER64_SYNTHETIC =
  'f38000d50m8940s4556m503s615m503s615m503s1736m503s615m503s615m503s615m503s615m503s1736m503s' +
  '1736m503s615m503s1736m503s615m503s1736m503s615m503s1736m503s615m503s615m503s1736m503s1736m' +
  '503s1736m503s1736m503s615m503s1736m503s615m503s615m503s1736m503s1736m503s1736m503s615m503s' +
  '1736m503s615m503s615m503s615m503s615m503s615m503s615m503s1736m503s615m503s615m503s615m503s' +
  '615m503s615m503s615m503s615m503s615m503s615m503s615m503s615m503s615m503s615m503s615m503s61' +
  '5m503s615m503s615m503s1736m503s615m503s615m503s615m503s615m503s615m503s615m503s615m503s173' +
  '6m503s615m503s100000';
