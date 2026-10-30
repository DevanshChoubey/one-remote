# TV hardware spike results

Filled in after the hardware runs (Task 5, steps 6 and 7).

## Run 1 (2026-10-30, Realme X, debug build over USB)

The pass bar was not reached: pairing failed before the TV showed a prompt. The phone and the C4
were on the same network (phone 192.168.0.147, TV 192.168.0.193).

## Devices

- Phones and OS versions: Realme X (RMX1901), Android 11 (API 30). Not one of the plan's phones;
  the iQOO and S21 FE runs are still to do.
- LG C4 firmware:

## Network

- Port that answered (3000 or 3001): both accept TCP from the phone's shell (`nc`), but port 3000
  closes a plain WebSocket handshake without replying. The app's `ws://...:3000` fails within
  about 0.1 s.
- React Native `WebSocket` accepted `wss://3001` (yes/no, error): no. It fails within about
  0.1 s with no error text. This fits the TV's self-signed certificate being rejected, but the
  certificate was not inspected directly.
- `react-native-udp` built under the new architecture (yes/no): yes (debug build, Android).
- SSDP replied on Android (yes/no): yes. Discover found the C4 in 1.4 s; it reports
  `usn=uuid:2066574d-4a25-7efa-5ae0-9b6b5b0dc230`.
- C4 SSDP headers:
- `getinfo` MAC matched the TV's settings (yes/no):

## Input

- Input picker opened (yes/no):
- `insertText` `replace:true` replaced the field (yes/no):
- `PAUSE` / `PLAY` worked (yes/no):

## Pass bar (per phone)

- Reconnect times:
- Pair with the C4: failed on the Realme X (see Network).
- 100 touchpad moves with no visible lag:
- Lock and unlock 10 times, reconnect within 1 s:
- TV IP change, recovered by itself:
- Power on from off over Wake-on-LAN ("Turn on via Wi-Fi" on):
