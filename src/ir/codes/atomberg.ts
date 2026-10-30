/*
 * MIT License
 *
 * Copyright (c) 2019 Vassilis Panos
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Fan IR codes below come from the SmartIR repository (https://github.com/smartHomeHub/SmartIR),
 * codes/fan/1160.json (Atomberg Efficio) and codes/fan/1170.json (Atomberg Renesa),
 * commit e4df2957ad915536f41ffb39daa96886d7cfe040. Broadlink base64 strings, unchanged.
 *
 * SmartIR command name to FanKey mapping:
 *   commands.off          -> off
 *   commands.default['1'] -> speed1   ('2' -> speed2, '3' -> speed3, '4' -> speed4, '5' -> speed5)
 *   commands.default.boost -> boost   (1160 only)
 * The files have no sleep, light or timer codes, so those keys are absent and caps are
 * { fanLight: false, sleep: false }.
 */

import { broadlinkToSignal } from '../broadlink';
import type { FanKey, Remote } from '../catalogue';
import type { IrSignal } from '../emitter';

type FanKeyCodes = Partial<Record<FanKey, string>>;

const CODES_1160: FanKeyCodes = {
  off: 'JgBQAAABKZIUERQRFBEUEhMSExIUERQRFDYTNhQSExITNhQ2FDUUNhQ2FBEUERQRFDYUERQRFDYUERQ2EzYUNhQRFDYUNRQSEwAFbwABKkcUAA0FAAAAAAAAAAA=',
  speed1:
    'JgBQAAABKpEUEhMSFBEUEhMSExITEhMSFDUUNhQSExITNhQ2EzYUNhQ2EzYUEhM2FBITEhMSEzYUEhMSEzYUEhM2FDYTNhQSEwAFbwABKkcUAA0FAAAAAAAAAAA=',
  speed2:
    'JgBQAAABKpITEhQRFBEUERQSExITEhQRFDUUNhQSExITNhQ2FDUUNhQRFDYUERQ1FBITEhQRFDYTNhQSEzYUEhM2FDUUNhQSEwAFbwABKUgUAA0FAAAAAAAAAAA=',
  speed3:
    'JgBQAAABKpITEhQRFBEUERQSExITEhQRFDUUNhQSExITNhQ2FDUUNhQRFDYUERQ1FBITEhQRFDYTNhQSEzYUEhM2FDUUNhQSEwAFbwABKUgUAA0FAAAAAAAAAAA=',
  speed4:
    'JgBQAAABKZIUERQSExITEhQRFBEUERQSEzYUNhQRFBEUNRU1FDYUNRQ2FDYUERQRFDYUERQRFDYUERQRFDYTNhQSEzYUNhQRFAAFbwABKUcUAA0FAAAAAAAAAAA=',
  speed5:
    'JgBQAAABKZEUEhQRFBEUERQSExITEhMSFDUUNhQRFBITNhQ2EzYUNhQRFBEUEhM2FBEUEhMSEzYUNhQ1FDYUERQ2FDUUNhQSEwAFbwABKUgUAA0FAAAAAAAAAAA=',
  boost:
    'JgBQAAABKZIUERQRFBEUEhMSExIUERQRFDYUNRQSExITNhQ2FDUUNhQ2FDUUNhQ2FBEUERQRFDYUERQRFBEUEhM2FDUUNhQSEwAFbwABJ0oUAA0FAAAAAAAAAAA=',
};

const CODES_1170: FanKeyCodes = {
  off: 'JgBQAAABJZITExMSExITEhMSExITExMSEzcTNhMTExITNxM2EzcTNxM3ExkMEhMSEzcTEhMTEjcTEhM3EzcTNxMSEzcTNxMSEwAFYQABJkkTAA0F',
  speed1:
    'JgBQAAABJJMVEBQRFBEUEhQRFBEUERQRFDYUNhQRFRAUNhQ2FDYUNRQSFBEVEBQRFDYUERQRFDYUNhQ2FDYTNhQSEzYUNhQRFAAFYgABJUoVAA0F',
  speed2:
    'JgBQAAABJZMUERURFBEUERQRFBEUERURFDUUNhUQFREVNBQ2FDYUNhQRFTUUERU1FBEUERURFDUVNRUQFTUUERU1FTUUNhQRFQAFYAABJkkUAA0F',
  speed3:
    'JgBQAAABJZMTEhMTEhMTEhMSExITEhMTEzYTNxMSExMTNhM3EzcTNxM3EzcTEhMSEzcTEhMSEzcTEhMSEzcTNxMSEzcTNxMSEwAFYgABJkkTAA0F',
  speed4:
    'JgBQAAABJJMTEhMSExITExMSExITEhMSEzcTNxMWDxITNxM3EzcTNxITExITEhM3ExITEhMSEzcTNxM3EzcTEhM3EzYTNxMSEwAFYgABJkkTAA0F',
  speed5:
    'JgBQAAABJpITEhMSExITEhMTExITEhMSEzcTNxMSExITNxM3EzYTNxM3EzcTNxM2ExMTEhMSEzcTEhMSExITEhM3EzcTNxMSEwAFYQABJ0kTAA0F',
};

function decodeKeys(codes: FanKeyCodes): Partial<Record<FanKey, IrSignal>> {
  const keys: Partial<Record<FanKey, IrSignal>> = {};
  for (const [key, b64] of Object.entries(codes)) keys[key as FanKey] = broadlinkToSignal(b64);
  return keys;
}

export const ATOMBERG_REMOTES: Remote[] = [
  {
    id: 'atomberg-fan/1160',
    kind: 'fan',
    brandId: 'atomberg',
    label: 'Atomberg Efficio',
    caps: { fanLight: false, sleep: false },
    keys: decodeKeys(CODES_1160),
  },
  {
    id: 'atomberg-fan/1170',
    kind: 'fan',
    brandId: 'atomberg',
    label: 'Atomberg Renesa',
    caps: { fanLight: false, sleep: false },
    keys: decodeKeys(CODES_1170),
  },
];
