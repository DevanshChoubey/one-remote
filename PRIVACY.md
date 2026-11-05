# Privacy policy

Effective 2026-11-06. Applies to One Remote (`com.devanshchoubey.oneremote`) on Android and iOS.

One Remote is an app made by one developer, Devansh Choubey. It is not made by or affiliated with
LG, Samsung, Google, Panasonic, Atomberg or any other maker of the devices it controls.

## The short version

One Remote collects nothing and sends nothing to a server of its own. It has no account, no
analytics and no ads. It talks only to devices on your home network, to ACs and fans through your
phone's IR blaster, and to your air freshener over Bluetooth.

There is one exception, and it is off unless you turn it on: the **MirAIe cloud connection** in
Settings, for Panasonic Wi-Fi ACs sold in India. With it on, the app signs in to your own MirAIe
account and controls those ACs through Panasonic's MirAIe servers. See
[MirAIe cloud connection](#miraie-cloud-connection-opt-in) below.

## What stays on your phone

To work, the app keeps these on your phone only:

- the devices and rooms you add: their names, model, local network address and how they connect;
- your air freshener (aer dispenser) over Bluetooth: its Bluetooth address, its readings and its
  schedules, kept on the phone;
- the pairing keys your TVs and Matter devices give the app, kept in the phone's secure storage
  where the platform offers it;
- your theme and other settings;
- only if you turn on the MirAIe cloud connection: your MirAIe phone number and password and the
  sign-in token MirAIe returns, kept in the phone's secure storage.

None of it leaves the phone. Uninstalling the app, or clearing its storage, deletes it. Android
backups leave out the pairing keys.

## The network

The app opens connections only to private addresses on your home network (such as 192.168.x.x),
to find and control your TVs, ACs and other devices. It refuses any other address, with the one
opt-in exception below. The internet permission on Android is what any network connection needs,
including local ones.

## MirAIe cloud connection (opt-in)

Off by default. Settings, Cloud connections, MirAIe explains what it does before it asks for
anything. While it is off, the app opens no connection to MirAIe or to any other internet address.

When you turn it on and sign in, and only while it stays on:

- your MirAIe phone number and password go to Panasonic's MirAIe sign-in server
  (`auth.miraie.in`) over HTTPS, to sign in; the app keeps them in secure storage on the phone so
  it can sign in again when the token runs out;
- with the token MirAIe returns, the app asks MirAIe (`app.miraie.in`, HTTPS) for the homes and
  ACs in your account and their current state;
- the app keeps an encrypted (TLS) connection to MirAIe's message server (`mqtt.miraie.in`) to send
  your commands to those ACs (power, mode, temperature, fan, swing) and to receive their state and
  whether they are online.

The app talks to these three hosts only, and only for the ACs you add through MirAIe. Nothing about
your other devices, rooms or settings is sent. What MirAIe does with the data is governed by
Panasonic's own MirAIe privacy policy, as when you use the MirAIe app.

**Disconnect MirAIe** in Settings turns it off, closes the connections and deletes the saved phone
number, password and token from the phone. ACs you added through MirAIe keep their IR backup, if
you added one, and keep working over IR.

One Remote is not made by or affiliated with Panasonic. The MirAIe connection is unofficial and may
stop working if Panasonic changes its service.

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

The app shares no data with anyone, because it collects none. Nothing is sold. With the MirAIe
cloud connection on, what is listed above goes to Panasonic's MirAIe service at your request, and
to no one else.

## Children

The app is not aimed at children and collects no data from anyone.

## Changes

Changes to this policy are made in this file, and its history is kept in the app's repository.

## Contact

Email devanshc13@gmail.com.
