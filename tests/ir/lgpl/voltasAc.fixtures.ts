// Reference vectors for the Voltas AC encoder (LGPL-2.1, see src/ir/lgpl/LICENSE).
// Copied from IRremoteESP8266 test/ir_Voltas_test.cpp (master at 1e2f0f3, version 2.9.0):
// TestDecodeVoltas.RealExample (a real 122LZF remote capture: On, Dry, 24C, fan Low, WiFi on) and
// TestIRVoltasClass.Checksums (the reset state).

export const VOLTAS_REAL_STATE = [0x33, 0x84, 0x88, 0x18, 0x3b, 0x3b, 0x3b, 0x11, 0x00, 0xe6];
export const VOLTAS_RESET_STATE = [0x33, 0x28, 0x00, 0x17, 0x3b, 0x3b, 0x3b, 0x11, 0x00, 0xcb];

/** TestDecodeVoltas.RealExample rawData: the real capture of VOLTAS_REAL_STATE. */
export const VOLTAS_REAL_RAW = [
  1002, 584, 1000, 586, 1000, 2568, 1002, 2570, 1002, 586, 998, 588, 1000, 2568, 1002, 2570, 1002,
  2572, 1002, 584, 1002, 586, 1000, 584, 1000, 586, 1002, 2568, 1004, 584, 1000, 586, 1002, 2568,
  1002, 584, 1002, 584, 1004, 584, 1000, 2568, 1002, 586, 1000, 586, 998, 590, 998, 584, 1002, 584,
  1000, 586, 1000, 2570, 1002, 2568, 1004, 584, 1000, 584, 1002, 584, 1002, 582, 1004, 584, 1002,
  2568, 1002, 2570, 1004, 2570, 1000, 586, 1002, 2568, 1004, 2568, 1006, 584, 1000, 584, 1002, 2568,
  1002, 2570, 1002, 2568, 1002, 586, 1002, 2570, 1000, 2570, 1002, 588, 998, 586, 1000, 2568, 1004,
  2568, 1004, 2568, 1002, 588, 998, 2570, 1002, 2568, 1004, 586, 1002, 584, 1000, 586, 1000, 2570,
  1000, 586, 1000, 584, 1002, 586, 1000, 2568, 1004, 584, 1000, 586, 1000, 586, 1002, 584, 1002,
  586, 1000, 586, 1000, 586, 1000, 586, 1000, 2568, 1002, 2568, 1002, 2568, 1004, 586, 1000, 584,
  1000, 2570, 1004, 2568, 1004, 584, 1002,
];
