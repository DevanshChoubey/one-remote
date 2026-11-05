// Reference vectors for the Gree AC encoder (LGPL-2.1, see src/ir/lgpl/LICENSE).
// Copied from IRremoteESP8266 test/ir_Gree_test.cpp (master at 1e2f0f3, version 2.9.0):
// TestSendGreeChars.SendData (a raw state to timings), TestGreeClass.Issue814Power (real YBOFB and
// YAW1F remote states: On or Off, Cool, 23C, fan 1, swing auto, light on),
// TestGreeClass.SetAndGetRaw, and TestDecodeGree.NormalRealExample (a real capture, issue 386).
// Timing strings keep upstream's "f38000d50" prefix.

export const GREE_SEND_DATA_STATE = [0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef];

/** TestGreeClass.Issue814Power. */
export const GREE_YBOFB_ON = [0x59, 0x07, 0x20, 0x50, 0x01, 0x20, 0x00, 0xc0];
export const GREE_YAW1F_ON = [0x59, 0x07, 0x60, 0x50, 0x01, 0x20, 0x00, 0xc0];
export const GREE_OFF = [0x51, 0x07, 0x20, 0x50, 0x01, 0x20, 0x00, 0x40];

/** TestGreeClass.SetAndGetRaw: the reset state (power off, auto, 25C, light on). */
export const GREE_RESET_STATE = [0x00, 0x09, 0x20, 0x50, 0x00, 0x20, 0x00, 0x50];

/** TestDecodeGree.NormalRealExample: the state and its real capture. */
export const GREE_REAL_STATE = [0x19, 0x0a, 0x60, 0x50, 0x02, 0x23, 0x00, 0xf0];
export const GREE_REAL_RAW = [
  9008, 4496, 644, 1660, 676, 530, 648, 558, 672, 1636, 646, 1660, 644, 556, 650, 584, 626, 560,
  644, 580, 628, 1680, 624, 560, 648, 1662, 644, 582, 648, 536, 674, 530, 646, 580, 628, 560, 670,
  532, 646, 562, 644, 556, 672, 536, 648, 1662, 646, 1660, 652, 554, 644, 558, 672, 538, 644, 560,
  668, 560, 648, 1638, 668, 536, 644, 1660, 668, 532, 648, 560, 648, 1660, 674, 554, 622, 19990,
  646, 580, 624, 1660, 648, 556, 648, 558, 674, 556, 622, 560, 644, 564, 668, 536, 646, 1662, 646,
  1658, 672, 534, 648, 558, 644, 562, 648, 1662, 644, 584, 622, 558, 648, 562, 668, 534, 670, 536,
  670, 532, 672, 536, 646, 560, 646, 558, 648, 558, 670, 534, 650, 558, 646, 560, 646, 560, 668,
  1638, 646, 1662, 646, 1660, 646, 1660, 648,
];

export const GREE_SEND_DATA =
  'f38000d50m9000s4500m620s540m620s1600m620s540m620s540m620s1600m620s540m620s540m620s540m620s' +
  '540m620s540m620s1600m620s540m620s1600m620s1600m620s540m620s540m620s540m620s1600m620s1600m6' +
  '20s540m620s1600m620s540m620s1600m620s540m620s540m620s540m620s540m620s1600m620s1600m620s160' +
  '0m620s1600m620s540m620s540m620s1600m620s540m620s19980m620s540m620s540m620s540m620s540m620s' +
  '1600m620s540m620s540m620s1600m620s1600m620s1600m620s540m620s1600m620s540m620s1600m620s540m' +
  '620s1600m620s1600m620s540m620s1600m620s1600m620s540m620s540m620s1600m620s1600m620s1600m620' +
  's1600m620s1600m620s1600m620s540m620s1600m620s1600m620s1600m620s19980';
