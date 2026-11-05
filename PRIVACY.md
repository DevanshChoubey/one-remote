# Privacy policy

Effective 2026-11-04. Applies to One Remote (`com.devanshchoubey.oneremote`) on Android and iOS.

One Remote is an app made by one developer, Devansh Choubey. It is not made by or affiliated with
LG, Samsung, Google, Panasonic, Atomberg or any other maker of the devices it controls.

## The short version

One Remote collects nothing and sends nothing to a server. It has no account, no analytics and no
ads. It talks only to devices on your home network, to ACs and fans through your phone's IR
blaster, and to your air freshener over Bluetooth.

## What stays on your phone

To work, the app keeps these on your phone only:

- the devices and rooms you add: their names, model, local network address and how they connect;
- your air freshener (aer dispenser) over Bluetooth: its Bluetooth address, its readings and its
  schedules, kept on the phone;
- the pairing keys your TVs and Matter devices give the app, kept in the phone's secure storage
  where the platform offers it;
- your theme and other settings.

None of it leaves the phone. Uninstalling the app, or clearing its storage, deletes it. Android
backups leave out the pairing keys.

## The network

The app opens connections only to private addresses on your home network (such as 192.168.x.x),
to find and control your TVs, ACs and other devices. It refuses any other address. The internet
permission on Android is what any network connection needs, including local ones.

## Permissions

| Permission                 | Why                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Network, Wi-Fi             | To find your devices on your home network and control them.                                        |
| Local network (iOS)        | The same, on iPhone.                                                                               |
| Camera                     | Only while you scan the Matter QR code on a device. Images are read on the phone.                  |
| Microphone                 | Only while you hold the mic button, to type speech on your TV. Recognition runs on the phone.      |
| IR blaster                 | To send remote-control signals to ACs and fans, on phones that have one.                           |
| Vibrate                    | For a short tap of feedback on button presses.                                                     |
| Nearby devices (Bluetooth) | To find and control your air freshener in the room. Android 12 and newer; never used for location. |
| Notifications              | For refill, battery and check-in alerts, planned on the phone. No push messages.                   |

Alerts never run Bluetooth in the background.

The QR code is read on the phone by Google ML Kit's built-in model. The app removes ML Kit's
usage logging, so it sends nothing to Google.

## Sharing

The app shares no data with anyone, because it collects none. Nothing is sold.

## Children

The app is not aimed at children and collects no data from anyone.

## Changes

Changes to this policy are made in this file, and its history is kept in the app's repository.

## Contact

Email devanshc13@gmail.com.
