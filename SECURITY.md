# Security policy

## Scope

One Remote talks to devices on your home network, over IR and over Bluetooth. It has no server of
its own, no account and no analytics. Every connection goes to a private address on the home
network, with one exception: the MirAIe cloud connection for Panasonic ACs, which is off unless you
turn it on. That keeps the attack surface small, but not zero.

In scope:

- **Local network sockets** (`src/transport`): the TV, Gree and Matter connections, discovery
  (mDNS, SSDP), Wake-on-LAN, and the `assertLocal()` check in `src/transport/localOnly.ts` that
  refuses any address outside the home network. A way to make the app connect to a public address,
  or to an unexpected multicast or broadcast address, is in scope.
- **Parsing what devices send back**: the LG webOS, Samsung, Android TV / Google TV, Gree, Matter,
  MirAIe and aer replies (`src/webos`, `src/samsung`, `src/androidtv`, `src/gree`, `src/matter`,
  `src/miraie`, `src/aer`).
- **IR** (`src/ir`, `modules/ir-emitter`): the codes the app builds and sends.
- **Bluetooth** (`src/transport/ble`, `src/aer`): scanning, connecting and the aer protocol.
- **Data stored on the phone**: the TV pairing keys and the MirAIe phone number, password and
  token, which are kept in secure storage (`src/store/secrets.ts`); and the Matter controller's
  fabric data, the devices, rooms and settings, which are kept in the app's own storage. A way for
  them to leave the phone, or to be read by another app, is in scope.
- **The MirAIe cloud opt-in** (`src/transport/cloud.ts`, `src/miraie`): that it stays off by
  default, that it talks only to the allowlisted hosts `auth.miraie.in`, `app.miraie.in` and
  `mqtt.miraie.in` over TLS, and that Disconnect deletes the saved sign-in.
- **Build configuration** that affects permissions or data leaving the phone: `app.json` and the
  config plugins in `plugins/`, such as `withNoGoogleTelemetry.js` (removes ML Kit's usage logging),
  `withNoPush.js` (removes the Firebase push components) and `withNoLocation.js`.
- Any other way the app could send data off the phone.

Out of scope:

- The firmware and local protocols of TVs, ACs, fans and the air freshener. Many accept commands
  from anyone on the network or in range. Report firmware issues to the manufacturer.
- Vendor clouds and apps, including Panasonic's MirAIe service, LG ThinQ, Samsung SmartThings and
  Google's services.
- Debug builds and the developer screens under `app/dev/`.

## Supported versions

Only the latest commit on `main` is supported while the project is in beta.

## Report a vulnerability

Please report privately. Do not open a public issue.

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability** to open a private security advisory.

Include what you found, how to reproduce it, and the phone, OS and device you used. Leave out real
pairing keys and passwords. The maintainer replies in the advisory. Once a fix is ready, the
advisory is published with credit, unless you prefer otherwise.
