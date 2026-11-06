# Google Play store listing (draft for review)

Not saved in Play Console yet. Limits: app name 30 characters, short description 80, full
description 4000.

## App name

One Remote

## Short description

One private remote for your TV, ACs, fans and air freshener. No ads, no account.

## Full description

One Remote is one simple remote for the devices at home: the TV, the ACs, the fans and the air
freshener. It talks to them directly, over your home Wi-Fi, the phone's IR blaster or Bluetooth. No
ads, no account, no analytics.

Each kind of device gets the layout that suits it:

• TV: a big touchpad (or a D-pad), volume, inputs, a keyboard for search, and hold-to-talk voice on
Android TV. Works with LG webOS, Samsung (Tizen) and Android TV / Google TV over Wi-Fi, and can turn
the TV on from standby with Wake-on-LAN or IR.
• AC: a temperature dial, modes, fan speed and swing. Over the IR blaster for Panasonic, Carrier,
Daikin, Gree, Haier, Hitachi, LG, Midea, Mitsubishi Heavy, Samsung, Voltas and Whirlpool; over Wi-Fi
for Gree units and Matter ACs added by their QR code.
• Fan: power, speeds, boost, sleep and light for Atomberg fans, over IR.
• Air freshener: spray now, auto spray, schedules, battery and refill for the Godrej aer Smart Matic,
over Bluetooth.

Also:
• Devices grouped by room on one home screen.
• An IR backup for Wi-Fi devices, for when the network is down.
• Light and dark themes, large text, screen-reader labels on every control.

Private by design
Everything stays on your phone and your home network. The app has no account and no server of its
own, and it refuses connections to any address outside your home network. The one exception is
optional and off by default: Panasonic Wi-Fi ACs sold in India can be controlled through your own
MirAIe account, if you turn that on in Settings.

IR control needs a phone with an IR blaster. Wi-Fi devices need to be on the same network as the
phone.

One Remote is open source (MIT): github.com/DevanshChoubey/one-remote

Unofficial. Not affiliated with LG, Samsung, Google, Panasonic, Atomberg, Godrej or any other device
maker. Brand names are used only to say which devices work.

## Graphics

- App icon: 512×512, from `assets/images/icon.png` (the dial icon).
- Feature graphic: 1024×500, `docs/store/feature-graphic.png` (built from
  `docs/store/feature-graphic.html`): the AC temperature dial. It shows the app icon, so re-render it
  when the icon changes.
- Phone screenshots: `docs/store/screenshots/` (1080×1920, in upload order: Home, AC, TV, Fan, Air
  freshener). They show the central mock's screens with a caption above each. Replace them with
  captures from the real app on the iQOO if the app drifts from the mock.
