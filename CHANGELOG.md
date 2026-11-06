# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing is tagged yet. Builds go to the Google Play internal testing track (beta 1).

### Added

- **Home**: devices grouped by room, with a card per device and a device settings sheet. Light,
  dark or match-the-phone theme, following the phone's reduce-motion setting.
- **TV, over the home Wi-Fi**: LG webOS, Samsung (Tizen) and Android TV / Google TV. One search
  finds them on the network, then the app pairs with the TV's on-screen prompt or code. The remote
  is laid out like the Google TV remote: a touchpad or D-pad, volume, home and back, inputs, a
  keyboard to type on the TV, and hold-to-talk voice on Android TV / Google TV. It turns the TV on
  with Wake-on-LAN, or with IR on phones that have a blaster, and knows when the TV is on, in
  standby or off.
- **ACs over IR**, on Android phones with an IR blaster: Panasonic (with Powerful, Quiet, swing
  positions, five fan speeds and nanoe), Carrier, Daikin, Gree, Haier, Hitachi, LG, Midea (and
  Coolix), Mitsubishi Heavy, Samsung, Voltas and Whirlpool. Blue Star, Godrej and Lloyd are offered
  likely code sets, marked as guesses. Encoders are ported from IRremoteESP8266 (LGPL-2.1).
- **ACs over Wi-Fi**: Gree units on the local network, and ACs with Matter, added by scanning the
  Matter QR code or typing its code.
- **Panasonic MirAIe ACs (opt-in)**: an off-by-default cloud connection in Settings, Cloud
  connections, for Panasonic Wi-Fi ACs sold in India. It is the app's only internet use, limited to
  MirAIe's own hosts. An IR backup can be added for each AC.
- **Atomberg fans over IR**, with clean NEC codes checked on a real fan.
- **Godrej aer air freshener over Bluetooth**: spray now, auto spray, schedules, battery and refill
  readings, and refill, battery and check-in alerts planned on the phone.
- IR backup for a Wi-Fi device, from its settings sheet.
- Settings: theme, phone volume keys for the TV, vibrate on press, rooms, alerts, cloud
  connections, privacy and the licences.
- Privacy policy (`PRIVACY.md`) and the Google Play listing notes (`docs/store/google-play.md`).
- Open-source files: MIT licence, notice, contributing guide, security policy, code of conduct, and
  issue and pull request templates.
- CI runs the typecheck, lint, tests with coverage and `expo-doctor` on every push and pull
  request.
- Automatic internal releases: every push to `main` that passes CI builds a signed bundle and
  uploads it to the Play internal testing track. The release build caches its native compile and
  builds only the ARM ABIs, so it runs much faster.

### Security

- Local network only: every connection goes through a check that refuses public addresses, except
  the opt-in MirAIe hosts. No analytics, crash reporting or location.
- Release builds remove Google ML Kit's usage logging and the Firebase push components, and block
  the location permissions.
- TV pairing keys and the MirAIe sign-in are kept in the phone's secure storage.

[Unreleased]: https://github.com/DevanshChoubey/one-remote/commits/main
